// ── demo trade execution ───────────────────────────────────────────
// Executes buys/sells against a vault's SOL buffer at the LIVE oracle
// mark (getTokenInfo). We never fabricate a price: source:"none" is a
// hard 422. Position accounting is the PaperApe average-cost model —
// add-on buys average into one row per (vault, mint); partial sells
// reduce tokens and cost basis proportionally, realizing pnl implicitly.
// Fills are demo ledger entries: txSig is prefixed "demo-" so the UI
// can distinguish them from on-chain signatures.

import type { TradeResult } from "@coffer/shared";
import type { Position as DbPosition } from "@prisma/client";
import { prisma } from "../db.js";
import { getTokenInfo } from "./prices.js";
import { assembleVault, toPosition, toTrade } from "./vaults.js";

/** Thrown for every rejected trade — routes map status → HTTP code.
 *  `body` (when set) is the exact JSON the route must respond with;
 *  otherwise routes respond { error: message }. */
export class TradeError extends Error {
  readonly status: number;
  readonly body?: Record<string, unknown>;
  constructor(status: number, message: string, body?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// ── THE WALL ────────────────────────────────────────────────────────
// Real vaults hold real SOL and only ever execute on-chain. Until the
// program is deployed (WSL), Privy wallets exist and the keeper is
// funded, EVERY ledger operation against a real vault is rejected with
// this exact shape — real vaults never touch the simulated engine.
export const REAL_VAULT_WALL = {
  error:
    "real vaults execute on-chain only — pending: program deploy (WSL), Privy wallets, funded keeper",
  pending: ["program_deploy", "privy_wallets"],
} as const;

export function realVaultWallError(): TradeError {
  return new TradeError(409, REAL_VAULT_WALL.error, {
    error: REAL_VAULT_WALL.error,
    pending: [...REAL_VAULT_WALL.pending],
  });
}

export interface TradeInput {
  side: "buy" | "sell";
  mint: string;
  /** buys: SOL to spend from the vault's unallocated buffer */
  solAmount?: number;
  /** sells: fraction of the open position to close, 0–1 */
  sellFraction?: number;
}

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const EPS = 1e-9;
/** a sell of ≥ this fraction closes the row (dust is dropped) */
const CLOSE_FRACTION = 0.999;
/** min seconds between trade-driven equity points (anti-spam) */
const EQUITY_MIN_GAP_SEC = 60;

const nowSec = () => Math.floor(Date.now() / 1000);

function randBase58(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += BASE58[Math.floor(Math.random() * BASE58.length)]!;
  return out;
}

/**
 * Execute a demo trade against a vault. Throws TradeError on any
 * rejection (bad input, frozen vault, no live price, insufficient
 * buffer/position). Returns the shared TradeResult shape — position is
 * null when the sell closed the row.
 */
export async function executeTrade(vaultId: string, input: TradeInput): Promise<TradeResult> {
  const { side, mint } = input;
  if (side !== "buy" && side !== "sell") {
    throw new TradeError(400, 'side must be "buy" or "sell"');
  }
  if (typeof mint !== "string" || !BASE58_RE.test(mint)) {
    throw new TradeError(400, "not a valid mint address");
  }

  const vault = await prisma.vault.findUnique({ where: { id: vaultId } });
  if (!vault) throw new TradeError(404, "vault not found");
  // THE WALL: real vaults never execute simulated fills — not from the
  // trade route, not from the order engine, not from DCA legs.
  if (vault.mode === "real") throw realVaultWallError();
  if (vault.status !== "active") throw new TradeError(409, `vault is ${vault.status}`);

  // Live mark only — a fabricated price would fabricate pnl.
  const info = await getTokenInfo(mint);
  if (info.source === "none" || info.priceSol <= 0) {
    throw new TradeError(422, `no live price for ${mint} — refusing to trade without an oracle mark`);
  }
  const priceSol = info.priceSol;

  const existing = await prisma.position.findUnique({
    where: { vaultId_mint: { vaultId, mint } },
  });

  // ── size the fill ────────────────────────────────────────────────
  let solAmount: number; // SOL leg (spent on buy / received on sell)
  let tokenAmount: number; // token leg
  let closing = false;

  if (side === "buy") {
    solAmount = Number(input.solAmount);
    if (!Number.isFinite(solAmount) || solAmount <= 0) {
      throw new TradeError(400, "solAmount must be a positive number");
    }
    if (solAmount > vault.solBufferSol + EPS) {
      throw new TradeError(
        400,
        `insufficient SOL buffer (requested ${solAmount}, available ${vault.solBufferSol.toFixed(4)})`,
      );
    }
    tokenAmount = solAmount / priceSol;
  } else {
    const fraction = Number(input.sellFraction);
    if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) {
      throw new TradeError(400, "sellFraction must be a number in (0, 1]");
    }
    if (!existing || existing.amountTokens <= 0) {
      throw new TradeError(400, "no open position in this token");
    }
    tokenAmount = existing.amountTokens * fraction;
    solAmount = tokenAmount * priceSol;
    closing = fraction >= CLOSE_FRACTION;
  }

  const now = nowSec();
  const txSig = `demo-${randBase58(64)}`;

  // ── apply atomically ─────────────────────────────────────────────
  const { tradeRow, positionRow } = await prisma.$transaction(async (tx) => {
    let position: DbPosition | null;

    if (side === "buy") {
      position = existing
        ? await tx.position.update({
            where: { id: existing.id },
            data: {
              // average-cost basis: add-on buys average in
              amountTokens: existing.amountTokens + tokenAmount,
              costSol: existing.costSol + solAmount,
              valueSol: (existing.amountTokens + tokenAmount) * priceSol,
              markStale: false,
            },
          })
        : await tx.position.create({
            data: {
              vaultId,
              mint,
              symbol: info.symbol,
              name: info.name,
              amountTokens: tokenAmount,
              costSol: solAmount,
              valueSol: tokenAmount * priceSol,
              markStale: false,
            },
          });
    } else {
      const pos = existing!;
      if (closing) {
        await tx.position.delete({ where: { id: pos.id } });
        position = null;
      } else {
        position = await tx.position.update({
          where: { id: pos.id },
          data: {
            amountTokens: pos.amountTokens - tokenAmount,
            // cost basis reduced proportionally — realized pnl is implicit
            costSol: pos.costSol * (1 - tokenAmount / pos.amountTokens),
            valueSol: (pos.amountTokens - tokenAmount) * priceSol,
            markStale: false,
          },
        });
      }
    }

    const tradeRow = await tx.trade.create({
      data: {
        vaultId,
        ts: now,
        side,
        mint,
        symbol: position?.symbol ?? existing?.symbol ?? info.symbol,
        solAmount,
        tokenAmount,
        priceSol,
        txSig,
        source: vault.type,
      },
    });

    // buffer moves, then tvl = buffer + Σ position marks. Share price is
    // NAV per share — it MUST move with trading pnl (a frozen share price
    // silently robs depositors on entry/exit; QA finding).
    const solBufferSol = Math.max(0, vault.solBufferSol + (side === "buy" ? -solAmount : solAmount));
    const agg = await tx.position.aggregate({ where: { vaultId }, _sum: { valueSol: true } });
    const tvlSol = solBufferSol + (agg._sum.valueSol ?? 0);
    const sharePriceSol = vault.totalShares > 0 ? tvlSol / vault.totalShares : 1;
    await tx.vault.update({ where: { id: vaultId }, data: { solBufferSol, tvlSol, sharePriceSol } });

    const last = await tx.equityPoint.findFirst({
      where: { vaultId },
      orderBy: { t: "desc" },
      select: { t: true },
    });
    if (!last || now - last.t >= EQUITY_MIN_GAP_SEC) {
      // equity curve records PER-SHARE value — flow-independent, so
      // deposits/withdrawals never masquerade as performance
      await tx.equityPoint.upsert({
        where: { vaultId_t: { vaultId, t: now } },
        update: { v: sharePriceSol },
        create: { vaultId, t: now, v: sharePriceSol },
      });
    }

    return { tradeRow, positionRow: position };
  });

  const assembled = await assembleVault(vaultId);
  return {
    trade: toTrade(tradeRow),
    position: positionRow ? toPosition(positionRow) : null,
    vault: assembled!,
  };
}
