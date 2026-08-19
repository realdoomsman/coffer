// ── real OHLCV via GeckoTerminal (free, keyless) ───────────────────
// Two-step: resolve the token's deepest pool (highest reserve_in_usd,
// cached 10 min), then pull up to 200 candles for it (cached 30s per
// mint+timeframe). GeckoTerminal's free tier allows ~30 req/min — the
// caches keep a busy chart well under that (worst case 2 req / 30s per
// chart), and beneath the caches every GT call is metered by the global
// budgeter in gtBudget.ts (candles run at "high" priority, pool
// resolution at "normal"). Failures — including an exhausted budget —
// degrade to {candles: [], pool}; the UI renders an empty state, we
// never 500 a chart.

import type { Candle } from "@coffer/shared";
import { cacheGet, cacheSet } from "../cache.js";
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

// ── candles ────────────────────────────────────────────────────────

export async function getOhlcv(mint: string, tf: Timeframe): Promise<OhlcvResult> {
  const key = `gt:ohlcv:${mint}:${tf}`;
  const cached = cacheGet<OhlcvResult>(key);
  if (cached !== undefined) return cached;

  const pool = await topPool(mint);
  if (!pool) return cacheSet(key, { candles: [], pool: null }, OHLCV_TTL_MS);

  const { timeframe, aggregate } = TF_MAP[tf];
  let candles: Candle[] = [];
  try {
    const body = (await gtJson(
      `${GT_BASE}/networks/solana/pools/${encodeURIComponent(pool)}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=200`,
      "high",
    )) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
    // rows are [ts, o, h, l, c, v] newest-first — flip to oldest-first
    candles = (body?.data?.attributes?.ohlcv_list ?? [])
      .filter((r): r is number[] => Array.isArray(r) && r.length >= 5)
      .map((r) => ({ t: r[0]!, o: r[1]!, h: r[2]!, l: r[3]!, c: r[4]!, v: r[5] }))
      .sort((a, b) => a.t - b.t);
  } catch {
    candles = [];
  }
  return cacheSet(key, { candles, pool }, OHLCV_TTL_MS);
}
