// ── platform activity wire ─────────────────────────────────────────
// Merges the newest events across trades, order fills, deposits,
// withdrawals and vault creations into one newest-first feed with
// pre-rendered text lines (vault names uppercased — ticker-tape style).
// Trades that were produced by a filled order render as "order_fill"
// (joined via Order.filledTradeId), not as plain trades. Cached 5s.

import type { ActivityEvent, TradeSide } from "@coffer/shared";
import { fmtSol } from "@coffer/shared";
import { getOrSet } from "../cache.js";
import { prisma } from "../db.js";

const ACTIVITY_TTL_MS = 5_000;
export const ACTIVITY_MAX_LIMIT = 100;

const ORDER_LABEL: Record<string, string> = {
  take_profit: "TP",
  stop_loss: "SL",
  limit_buy_dip: "LIMIT BUY",
  limit_buy_breakout: "LIMIT BUY",
};

const sol = (v: number) => fmtSol(v, 1);
const up = (s: string) => s.toUpperCase();

async function buildFeed(limit: number): Promise<ActivityEvent[]> {
  const [filledOrders, deposits, withdrawals, vaults] = await Promise.all([
    prisma.order.findMany({
      where: { status: "filled", filledTradeId: { not: null } },
      orderBy: [{ filledAt: "desc" }, { id: "desc" }],
      take: limit,
      include: { vault: { select: { name: true } } },
    }),
    prisma.deposit.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      include: { vault: { select: { name: true } } },
    }),
    prisma.withdrawRequest.findMany({
      where: { status: { in: ["pending", "executable", "paid"] } },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      take: limit,
      include: { vault: { select: { name: true } } },
    }),
    prisma.vault.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, name: true, type: true, createdAt: true },
    }),
  ]);

  // fill trades give the order events their real fill size/side
  const fillTradeIds = filledOrders
    .map((o) => o.filledTradeId)
    .filter((id): id is string => id !== null);
  const [fillTrades, trades] = await Promise.all([
    fillTradeIds.length
      ? prisma.trade.findMany({ where: { id: { in: fillTradeIds } } })
      : Promise.resolve([]),
    prisma.trade.findMany({
      orderBy: [{ ts: "desc" }, { id: "desc" }],
      take: limit + fillTradeIds.length, // room to drop the fill trades
      include: { vault: { select: { name: true } } },
    }),
  ]);
  const fillTradeById = new Map(fillTrades.map((t) => [t.id, t]));

  const events: ActivityEvent[] = [];

  for (const t of trades) {
    if (fillTradeById.has(t.id)) continue; // rendered as order_fill below
    const vaultName = up(t.vault.name);
    events.push({
      id: `trade:${t.id}`,
      ts: t.ts,
      kind: "trade",
      vaultId: t.vaultId,
      vaultName,
      text: `${vaultName} ${t.side === "buy" ? "BOUGHT" : "SOLD"} ${sol(t.solAmount)} SOL OF ${up(t.symbol)}`,
      solAmount: t.solAmount,
      side: t.side as TradeSide,
    });
  }

  for (const o of filledOrders) {
    const trade = o.filledTradeId ? fillTradeById.get(o.filledTradeId) : undefined;
    const vaultName = up(o.vault.name);
    const isSell = o.kind === "take_profit" || o.kind === "stop_loss";
    const solAmount = trade?.solAmount ?? o.amountSol ?? undefined;
    const label = ORDER_LABEL[o.kind] ?? up(o.kind);
    const amountText =
      solAmount !== undefined ? ` ${isSell ? "+" : "-"}${sol(solAmount)} SOL` : "";
    events.push({
      id: `order:${o.id}`,
      ts: o.filledAt ?? o.createdAt,
      kind: "order_fill",
      vaultId: o.vaultId,
      vaultName,
      text: `${label} FILLED: ${up(o.symbol)}${amountText} (${vaultName})`,
      solAmount,
      side: isSell ? "sell" : "buy",
    });
  }

  for (const d of deposits) {
    const vaultName = up(d.vault.name);
    events.push({
      id: `deposit:${d.id}`,
      ts: Math.floor(d.createdAt.getTime() / 1000),
      kind: "deposit",
      vaultId: d.vaultId,
      vaultName,
      text: `DEPOSIT +${sol(d.costSol)} SOL INTO ${vaultName}`,
      solAmount: d.costSol,
    });
  }

  for (const w of withdrawals) {
    const vaultName = up(w.vault.name);
    const paid = w.status === "paid";
    events.push({
      id: `withdraw:${w.id}`,
      ts: paid ? (w.paidAt ?? w.executableAt) : w.requestedAt,
      kind: paid ? "withdraw_paid" : "withdraw_request",
      vaultId: w.vaultId,
      vaultName,
      text: `${paid ? "WITHDRAW PAID" : "WITHDRAW REQUEST"} ${sol(w.valueAtRequestSol)} SOL FROM ${vaultName}`,
      solAmount: w.valueAtRequestSol,
    });
  }

  for (const v of vaults) {
    const vaultName = up(v.name);
    events.push({
      id: `vault:${v.id}`,
      ts: Math.floor(v.createdAt.getTime() / 1000),
      kind: "vault_created",
      vaultId: v.id,
      vaultName,
      text: `VAULT CREATED: ${vaultName} (${up(v.type)})`,
    });
  }

  events.sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id));
  return events.slice(0, limit);
}

/** Newest-first merged activity feed, cached 5s per limit. */
export async function getActivity(limit: number): Promise<ActivityEvent[]> {
  const clamped = Math.max(1, Math.min(ACTIVITY_MAX_LIMIT, Math.floor(limit)));
  return getOrSet(`activity:${clamped}`, ACTIVITY_TTL_MS, () => buildFeed(clamped));
}
