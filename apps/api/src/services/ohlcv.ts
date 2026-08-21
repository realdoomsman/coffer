// ── real OHLCV: pump.fun native, GeckoTerminal fallback ────────────
// PRIMARY is pump.fun's own swap-api: this platform is pump.fun-only, so
// the launchpad itself is the most authoritative source — and crucially
// it serves BONDING-CURVE tokens, which have no AMM pool at all and are
// therefore invisible to GeckoTerminal (verified: GT returns zero pools
// for a fresh mint while pump.fun already has candles). It is also
// keyless and outside the GT rate budget, so a GT cool-off can no longer
// blank a chart.
//
// FALLBACK is GeckoTerminal (pool-based, graduated tokens only), metered
// by gtBudget. Beneath both sits the last-good layer: a failed or empty
// refresh serves the remembered chart flagged `stale` rather than wiping
// it. Charts degrade to stale, never to blank.

import type { Candle } from "@coffer/shared";
import { cacheGet, cacheSet, recallGood, rememberGood } from "../cache.js";
import { gtFetch, type GtPriority } from "./gtBudget.js";

const GT_BASE = "https://api.geckoterminal.com/api/v2";
const FETCH_TIMEOUT_MS = 8_000;
const POOL_TTL_MS = 600_000; // 10 min
const POOL_MISS_TTL_MS = 30_000; // failed lookups retry sooner
const OHLCV_TTL_MS = 30_000;

export const TIMEFRAMES = ["1m", "5m", "15m", "1h"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

const TF_MAP: Record<Timeframe, { timeframe: "minute" | "hour"; aggregate: number }> = {
  "1m": { timeframe: "minute", aggregate: 1 },
  "5m": { timeframe: "minute", aggregate: 5 },
  "15m": { timeframe: "minute", aggregate: 15 },
  "1h": { timeframe: "hour", aggregate: 1 },
};

export function isTimeframe(v: unknown): v is Timeframe {
  return typeof v === "string" && (TIMEFRAMES as readonly string[]).includes(v);
}

export interface OhlcvResult {
  candles: Candle[];
  pool: string | null;
  /** true when serving remembered data because the fresh fetch failed */
  stale?: boolean;
  /** unix ms the served candles were actually fetched */
  fetchedAt?: number;
  /** which upstream produced these candles */
  source?: "pumpfun" | "geckoterminal";
}

// All GT calls go through the global budgeter (beneath our caches).
async function gtJson(url: string, priority: GtPriority): Promise<unknown> {
  const res = await gtFetch(url, { priority, timeoutMs: FETCH_TIMEOUT_MS });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

// ── pool resolution ────────────────────────────────────────────────

interface GtPoolRow {
  attributes?: { address?: string; reserve_in_usd?: string };
}

/** Deepest pool address for a mint, or null. Cached (misses retry sooner). */
export async function topPool(mint: string): Promise<string | null> {
  const key = `gt:pool:${mint}`;
  const cached = cacheGet<string | null>(key);
  if (cached !== undefined) return cached;

  let best: string | null = null;
  try {
    const body = (await gtJson(
      `${GT_BASE}/networks/solana/tokens/${encodeURIComponent(mint)}/pools?page=1`,
      "normal",
    )) as { data?: GtPoolRow[] };
    let bestReserve = -1;
    for (const row of body?.data ?? []) {
      const address = row?.attributes?.address;
      const reserve = Number(row?.attributes?.reserve_in_usd ?? 0);
      if (address && reserve > bestReserve) {
        best = address;
        bestReserve = reserve;
      }
    }
  } catch {
    best = null;
  }
  return cacheSet(key, best, best ? POOL_TTL_MS : POOL_MISS_TTL_MS);
}

// ── pump.fun candles (primary) ─────────────────────────────────────

const PUMP_CANDLES_BASE = "https://swap-api.pump.fun/v1/coins";

/** pump.fun interval slugs map 1:1 onto ours. */
const PUMP_TF: Record<Timeframe, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
};

interface PumpCandleRow {
  timestamp?: number; // epoch MILLISECONDS
  open?: string | number;
  high?: string | number;
  low?: string | number;
  close?: string | number;
  volume?: string | number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Candles straight from pump.fun (USD-denominated, same as GT's), for
 * bonding-curve and graduated tokens alike. Returns [] on any failure so
 * the caller can fall through — never throws.
 */
async function pumpCandles(mint: string, tf: Timeframe): Promise<Candle[]> {
  try {
    const res = await fetch(
      `${PUMP_CANDLES_BASE}/${encodeURIComponent(mint)}/candles?interval=${PUMP_TF[tf]}&limit=200&currency=USD`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as PumpCandleRow[];
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r) => ({
        t: Math.floor(num(r.timestamp) / 1000), // ms → unix seconds
        o: num(r.open),
        h: num(r.high),
        l: num(r.low),
        c: num(r.close),
        v: Number.isFinite(num(r.volume)) ? num(r.volume) : undefined,
      }))
      .filter(
        (c) =>
          Number.isFinite(c.t) && c.t > 0 &&
          Number.isFinite(c.o) && Number.isFinite(c.h) &&
          Number.isFinite(c.l) && Number.isFinite(c.c),
      )
      .sort((a, b) => a.t - b.t);
  } catch {
    return [];
  }
}

// ── candles ────────────────────────────────────────────────────────

const OHLCV_FAIL_TTL_MS = 10_000; // retry sooner after a failure

export async function getOhlcv(mint: string, tf: Timeframe): Promise<OhlcvResult> {
  const key = `ohlcv:${mint}:${tf}`;
  const cached = cacheGet<OhlcvResult>(key);
  if (cached !== undefined) return cached;

  const good = recallGood<OhlcvResult>(key);

  // 1) pump.fun native — needs no pool, so bonding-curve tokens chart too
  const pump = await pumpCandles(mint, tf);
  if (pump.length > 0) {
    const fresh: OhlcvResult = {
      candles: pump,
      pool: good?.value.pool ?? null,
      fetchedAt: Date.now(),
      source: "pumpfun",
    };
    rememberGood(key, fresh);
    return cacheSet(key, fresh, OHLCV_TTL_MS);
  }

  // 2) GeckoTerminal fallback — pool-based, graduated tokens only.
  // Pool pinning: once a pool has produced candles, prefer it over a
  // fresh resolution so re-resolution churn can't blank a live chart.
  const pool = (await topPool(mint)) ?? good?.value.pool ?? null;
  if (pool) {
    const { timeframe, aggregate } = TF_MAP[tf];
    try {
      const body = (await gtJson(
        `${GT_BASE}/networks/solana/pools/${encodeURIComponent(pool)}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=200`,
        "high",
      )) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
      // rows are [ts, o, h, l, c, v] newest-first — flip to oldest-first
      const candles = (body?.data?.attributes?.ohlcv_list ?? [])
        .filter((r): r is number[] => Array.isArray(r) && r.length >= 5)
        .map((r) => ({ t: r[0]!, o: r[1]!, h: r[2]!, l: r[3]!, c: r[4]!, v: r[5] }))
        .sort((a, b) => a.t - b.t);
      if (candles.length > 0) {
        const fresh: OhlcvResult = {
          candles,
          pool,
          fetchedAt: Date.now(),
          source: "geckoterminal",
        };
        rememberGood(key, fresh);
        return cacheSet(key, fresh, OHLCV_TTL_MS);
      }
    } catch {
      // fall through to stale
    }
  }

  // 3) both upstreams failed or were empty — serve the last good chart,
  // marked stale, and cache only briefly so the next poll retries
  if (good) {
    return cacheSet(key, { ...good.value, stale: true, fetchedAt: good.at }, OHLCV_FAIL_TTL_MS);
  }
  return cacheSet(key, { candles: [], pool }, OHLCV_FAIL_TTL_MS);
}
