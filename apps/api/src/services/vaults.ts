// ── vault assembly ─────────────────────────────────────────────────
// Turns Prisma rows into the shared API shapes (@coffer/shared), with
// stats computed from the equity curve + trade history. All routes go
// through here so web always sees one consistent Vault shape.

import type {
  EquityPoint,
  Position,
  Trade,
  TraderProfile,
  TraderStats,
  Vault,
  VaultStats,
  VaultType,
  WithdrawRequest,
} from "@coffer/shared";
import type {
  EquityPoint as DbEquityPoint,
  Position as DbPosition,
  Trade as DbTrade,
  User as DbUser,
  Vault as DbVault,
  WithdrawRequest as DbWithdrawRequest,
} from "@prisma/client";
import { prisma } from "../db.js";

const nowSec = () => Math.floor(Date.now() / 1000);

// ── trade pairing (realized pnl / win rate) ────────────────────────
// FIFO-ish average-cost pairing: buys build an average entry per mint,
// each sell realizes pnl against that average. Good enough for stats;
// the real accounting engine lives on-chain later.

interface PairedStats {
  wins: number;
  losses: number;
  realizedPnlSol: number;
  grossProfit: number;
  grossLoss: number;
}

function pairTrades(trades: DbTrade[]): PairedStats {
  const book = new Map<string, { tokens: number; costSol: number }>();
  const out: PairedStats = { wins: 0, losses: 0, realizedPnlSol: 0, grossProfit: 0, grossLoss: 0 };
  for (const t of [...trades].sort((a, b) => a.ts - b.ts)) {
    const entry = book.get(t.mint) ?? { tokens: 0, costSol: 0 };
    if (t.side === "buy") {
      entry.tokens += t.tokenAmount;
      entry.costSol += t.solAmount;
      book.set(t.mint, entry);
    } else {
      const sellTokens = Math.min(t.tokenAmount, entry.tokens);
      if (sellTokens <= 0) continue; // sell with no recorded entry — skip
      const avgCost = entry.costSol / entry.tokens;
      const costOut = avgCost * sellTokens;
      const proceeds = t.solAmount * (sellTokens / t.tokenAmount);
      const pnl = proceeds - costOut;
      out.realizedPnlSol += pnl;
      if (pnl >= 0) {
        out.wins += 1;
        out.grossProfit += pnl;
      } else {
        out.losses += 1;
        out.grossLoss += -pnl;
      }
      entry.tokens -= sellTokens;
      entry.costSol -= costOut;
      book.set(t.mint, entry);
    }
  }
  return out;
}

function traderStatsFromTrades(trades: DbTrade[]): TraderStats {
  const paired = pairTrades(trades);
  const closed = paired.wins + paired.losses;
  return {
    winRatePct: closed > 0 ? (paired.wins / closed) * 100 : 0,
    pnlSol: round(paired.realizedPnlSol, 2),
    trades: trades.length,
    profitFactor:
      paired.grossLoss > 0 ? round(paired.grossProfit / paired.grossLoss, 2) : undefined,
  };
}

// ── equity-curve math ──────────────────────────────────────────────

function pnlPctSince(curve: EquityPoint[], sinceSec: number): number {
  if (curve.length < 2) return 0;
  const last = curve[curve.length - 1]!;
  let ref = curve[0]!;
  for (const p of curve) {
    if (p.t <= sinceSec) ref = p;
    else break;
  }
  if (ref.v === 0) return 0;
  return ((last.v - ref.v) / ref.v) * 100;
}

function maxDrawdownPct(curve: EquityPoint[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const p of curve) {
    if (p.v > peak) peak = p.v;
    else if (peak > 0) maxDd = Math.max(maxDd, ((peak - p.v) / peak) * 100);
  }
  return maxDd;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function round(v: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Keep roughly `maxPoints` points, always preserving the final point. */
export function downsample(curve: EquityPoint[], maxPoints: number): EquityPoint[] {
  if (curve.length <= maxPoints) return curve;
  const stride = Math.ceil(curve.length / maxPoints);
  const out: EquityPoint[] = [];
  for (let i = 0; i < curve.length; i += stride) out.push(curve[i]!);
  const last = curve[curve.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

// ── shape mappers ──────────────────────────────────────────────────

export function toTraderProfile(user: DbUser, allTrades: DbTrade[]): TraderProfile {
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    xHandle: user.xHandle ?? undefined,
    avatarUrl: user.avatarUrl ?? undefined,
    // P0 heuristic: linked X handle ⇒ verified badge. Real flow verifies
    // via X OAuth in the profile service.
    xVerified: Boolean(user.xHandle),
    bio: user.bio ?? undefined,
    onchainStats: traderStatsFromTrades(allTrades),
  };
}

export function toPosition(row: DbPosition): Position {
  const pnlSol = row.valueSol - row.costSol;
  return {
    id: row.id,
    vaultId: row.vaultId,
    mint: row.mint,
    symbol: row.symbol,
    name: row.name ?? undefined,
    amountTokens: row.amountTokens,
    costSol: row.costSol,
    valueSol: row.valueSol,
    pnlSol: round(pnlSol, 3),
    pnlPct: row.costSol > 0 ? round((pnlSol / row.costSol) * 100, 1) : 0,
    markStale: row.markStale,
    updatedAt: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

export function toTrade(row: DbTrade): Trade {
  return {
    id: row.id,
    vaultId: row.vaultId,
    ts: row.ts,
    side: row.side as Trade["side"],
    mint: row.mint,
    symbol: row.symbol,
    solAmount: row.solAmount,
    tokenAmount: row.tokenAmount,
    priceSol: row.priceSol,
    txSig: row.txSig,
    source: row.source as VaultType,
    copyLagSlots: row.copyLagSlots ?? undefined,
  };
}

export function toWithdrawRequest(row: DbWithdrawRequest): WithdrawRequest {
  return {
    id: row.id,
    vaultId: row.vaultId,
    userId: row.userId,
    shares: row.shares,
    valueAtRequestSol: row.valueAtRequestSol,
    requestedAt: row.requestedAt,
    executableAt: row.executableAt,
    status: row.status as WithdrawRequest["status"],
  };
}

// ── assembly ───────────────────────────────────────────────────────

export interface AssembleOptions {
  /** Downsample equity curves to about this many points (list views). */
  curvePoints?: number;
}

type DbVaultWithTrader = DbVault & { trader: DbUser };

function computeStats(
  vault: DbVaultWithTrader,
  curve: EquityPoint[],
  trades: DbTrade[],
  depositorCount: number,
): VaultStats {
  const now = nowSec();
  const paired = pairTrades(trades);
  const closed = paired.wins + paired.losses;
  const lags = trades
    .map((t) => t.copyLagSlots)
    .filter((v): v is number => v !== null && v !== undefined);
  return {
    pnlPct7d: round(pnlPctSince(curve, now - 7 * 86400)),
    pnlPct30d: round(pnlPctSince(curve, now - 30 * 86400)),
    pnlPctAll: round(pnlPctSince(curve, 0)),
    maxDrawdownPct: round(maxDrawdownPct(curve)),
    winRatePct: round(closed > 0 ? (paired.wins / closed) * 100 : 0),
    tradesCount: trades.length,
    depositorCount,
    ageDays: Math.max(0, Math.floor((now - vault.createdAt.getTime() / 1000) / 86400)),
    medianCopyLagSlots: vault.type === "mirror" ? median(lags) : undefined,
  };
}

/**
 * Assemble full shared Vault shapes for the given vault ids (or all
 * vaults when omitted). Batches every query — no per-vault round trips.
 */
export async function assembleVaults(
  filter: { ids?: string[]; type?: VaultType } = {},
  options: AssembleOptions = {},
): Promise<Vault[]> {
  const vaults = await prisma.vault.findMany({
    where: {
      ...(filter.ids ? { id: { in: filter.ids } } : {}),
      ...(filter.type ? { type: filter.type } : {}),
    },
    include: { trader: true },
    orderBy: { createdAt: "asc" },
  });
  if (vaults.length === 0) return [];
  const vaultIds = vaults.map((v) => v.id);
  const traderIds = [...new Set(vaults.map((v) => v.traderId))];

  const [equityRows, tradeRows, depositRows, traderVaultRows] = await Promise.all([
    prisma.equityPoint.findMany({
      where: { vaultId: { in: vaultIds } },
      orderBy: { t: "asc" },
    }),
    prisma.trade.findMany({ where: { vaultId: { in: vaultIds } }, orderBy: { ts: "asc" } }),
    prisma.deposit.findMany({
      where: { vaultId: { in: vaultIds } },
      select: { vaultId: true, userId: true },
    }),
    prisma.vault.findMany({
      where: { traderId: { in: traderIds } },
      select: { id: true, traderId: true },
    }),
  ]);

  // Trader stats aggregate across ALL the trader's vaults, so fetch any
  // trades of theirs not already in tradeRows.
  const extraVaultIds = traderVaultRows.map((v) => v.id).filter((id) => !vaultIds.includes(id));
  const extraTrades = extraVaultIds.length
    ? await prisma.trade.findMany({ where: { vaultId: { in: extraVaultIds } } })
    : [];

  const vaultOwner = new Map(traderVaultRows.map((v) => [v.id, v.traderId]));
  const tradesByVault = new Map<string, DbTrade[]>();
  const tradesByTrader = new Map<string, DbTrade[]>();
  for (const t of [...tradeRows, ...extraTrades]) {
    if (vaultIds.includes(t.vaultId)) {
      const list = tradesByVault.get(t.vaultId) ?? [];
      list.push(t);
      tradesByVault.set(t.vaultId, list);
    }
    const owner = vaultOwner.get(t.vaultId);
    if (owner) {
      const list = tradesByTrader.get(owner) ?? [];
      list.push(t);
      tradesByTrader.set(owner, list);
    }
  }

  const equityByVault = new Map<string, EquityPoint[]>();
  for (const p of equityRows) {
    const list = equityByVault.get(p.vaultId) ?? [];
    list.push({ t: p.t, v: p.v });
    equityByVault.set(p.vaultId, list);
  }

  const depositorsByVault = new Map<string, Set<string>>();
  for (const d of depositRows) {
    const set = depositorsByVault.get(d.vaultId) ?? new Set<string>();
    set.add(d.userId);
    depositorsByVault.set(d.vaultId, set);
  }

  return vaults.map((v) => {
    const curve = equityByVault.get(v.id) ?? [];
    const trades = tradesByVault.get(v.id) ?? [];
    const stats = computeStats(v, curve, trades, depositorsByVault.get(v.id)?.size ?? 0);
    return {
      id: v.id,
      name: v.name,
      type: v.type as VaultType,
      status: v.status as Vault["status"],
      trader: toTraderProfile(v.trader, tradesByTrader.get(v.traderId) ?? []),
      leaderWallet: v.leaderWallet ?? undefined,
      createdAt: Math.floor(v.createdAt.getTime() / 1000),
      tvlSol: v.tvlSol,
      sharePriceSol: v.sharePriceSol,
      totalShares: v.totalShares,
      managerStakeSol: v.managerStakeSol,
      managerStakePct: v.tvlSol > 0 ? round((v.managerStakeSol / v.tvlSol) * 100) : 0,
      perfFeeBps: v.perfFeeBps,
      redeemWindowHours: v.redeemWindowHours,
      solBufferSol: v.solBufferSol,
      thesis: v.thesis ?? undefined,
      stats,
      equityCurve: options.curvePoints ? downsample(curve, options.curvePoints) : curve,
    };
  });
}

export async function assembleVault(
  id: string,
  options: AssembleOptions = {},
): Promise<Vault | undefined> {
  const [vault] = await assembleVaults({ ids: [id] }, options);
  return vault;
}

// ── demo user ──────────────────────────────────────────────────────
// P0 runs without auth: every user-scoped route acts as the demo user.
// The Privy integration replaces this with a session lookup.

export async function getDemoUser(): Promise<DbUser> {
  return prisma.user.upsert({
    where: { handle: "you" },
    update: {},
    create: {
      handle: "you",
      displayName: "You (demo)",
      bio: "Local demo account. Deposits and withdrawals here are ledger entries, not transactions.",
    },
  });
}
