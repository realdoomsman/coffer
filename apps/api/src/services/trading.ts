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
import { PublicKey } from "@solana/web3.js";
import { prisma } from "../db.js";
import { getTokenInfo } from "./prices.js";
import { assembleVault, toPosition, toTrade } from "./vaults.js";
import { executeVaultSwap, validateVaultSwap } from "./vaultSwap.js";

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
// Real vaults hold real SOL and only ever execute on-chain. The vault
// program is now DEPLOYED (devnet, 2026-08-22), so what remains is the
// client half: signing transactions as the user (Privy session signers)
// and a funded NAV keeper. Until both exist, EVERY ledger operation
// against a real vault is rejected with this exact shape — real vaults
// never touch the simulated engine, deployed program or not.
export const REAL_VAULT_WALL = {
  error:
    "real vaults execute on-chain only — the vault program is live on devnet " +
    "(8315nL9tGA3TdYC6jr2jRiB1ccDepRKdXpBVmNybtW2U); pending: client-side " +
    "transaction signing (Privy session signers) and a funded NAV keeper",
  /** what is actually left — program_deploy cleared 2026-08-22 */
  pending: ["nav_keeper"], // client signing is now complete
  programId: "8315nL9tGA3TdYC6jr2jRiB1ccDepRKdXpBVmNybtW2U",
  cluster: "devnet",
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
 * Execute a trade against a vault. Handles both paper (simulated) and
 * real (on-chain via Jupiter) vaults. Throws TradeError on any rejection.
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
  
  // Route to the appropriate execution path
  if (vault.mode === "real") {
    return executeRealTrade(vault, input);
  }
  
  return executePaperTrade(vault, input);
}

/**
 * Execute a paper trade (simulated, database-only).
 */
async function executePaperTrade(vault: any, input: TradeInput): Promise<TradeResult> {
  const { side, mint } = input;
  
  if (vault.status !== "active") throw new TradeError(409, `vault is ${vault.status}`);

  // Live mark only — a fabricated price would fabricate pnl.
  const info = await getTokenInfo(mint);
  if (info.source === "none" || info.priceSol <= 0) {
    throw new TradeError(422, `no live price for ${mint} — refusing to trade without an oracle mark`);
  }
  const priceSol = info.priceSol;

  const existing = await prisma.position.findUnique({
    where: { vaultId_mint: { vaultId: vault.id, mint } },
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
              vaultId: vault.id,
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
        vaultId: vault.id,
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

    // Buffer debit is CONDITIONAL and atomic. The pre-transaction check
    // above is only a fast path: concurrent buys each read the same
    // pre-transaction snapshot, so without a guarded write five parallel
    // 10-SOL buys against a 10-SOL buffer would all "succeed" and mint
    // assets from nothing (audit: 10 SOL deposit -> 30 SOL of positions,
    // share price 3.0). Never clamp an overdraft with Math.max(0, ...) —
    // a clamp turns a trade that must fail into fabricated NAV.
    if (side === "buy") {
      const debited = await tx.vault.updateMany({
        where: { id: vault.id, solBufferSol: { gte: solAmount } },
        data: { solBufferSol: { decrement: solAmount } },
      });
      if (debited.count === 0) {
        throw new TradeError(400, `insufficient SOL buffer (requested ${solAmount})`);
      }
    } else {
      await tx.vault.update({
        where: { id: vault.id },
        data: { solBufferSol: { increment: solAmount } },
      });
    }

    // re-read the post-debit truth, then derive tvl and NAV per share
    const fresh = await tx.vault.findUniqueOrThrow({
      where: { id: vault.id },
      select: { solBufferSol: true, totalShares: true },
    });
    const agg = await tx.position.aggregate({ where: { vaultId: vault.id }, _sum: { valueSol: true } });
    const solBufferSol = fresh.solBufferSol;
    const tvlSol = solBufferSol + (agg._sum.valueSol ?? 0);
    const sharePriceSol = fresh.totalShares > 0 ? tvlSol / fresh.totalShares : 1;
    await tx.vault.update({ where: { id: vault.id }, data: { tvlSol, sharePriceSol } });

    const last = await tx.equityPoint.findFirst({
      where: { vaultId: vault.id },
      orderBy: { t: "desc" },
      select: { t: true },
    });
    if (!last || now - last.t >= EQUITY_MIN_GAP_SEC) {
      // equity curve records PER-SHARE value — flow-independent, so
      // deposits/withdrawals never masquerade as performance
      await tx.equityPoint.upsert({
        where: { vaultId_t: { vaultId: vault.id, t: now } },
        update: { v: sharePriceSol },
        create: { vaultId: vault.id, t: now, v: sharePriceSol },
      });
    }

    return { tradeRow, positionRow: position };
  });

  const assembled = await assembleVault(vault.id);
  return {
    trade: toTrade(tradeRow),
    position: positionRow ? toPosition(positionRow) : null,
    vault: assembled!,
  };
}

/**
 * Execute a real trade (on-chain via Jupiter Router).
 */
async function executeRealTrade(vault: any, input: TradeInput): Promise<TradeResult> {
  const { side, mint } = input;
  
  // For now, real vaults only support buys through the terminal
  // Sells will require a different flow (withdrawals)
  if (side === "sell") {
    throw new TradeError(501, "Real vault sells not yet implemented - use withdrawals instead");
  }

  if (vault.status !== "active") {
    throw new TradeError(409, `vault is ${vault.status}`);
  }

  const solAmount = Number(input.solAmount);
  if (!Number.isFinite(solAmount) || solAmount <= 0) {
    throw new TradeError(400, "solAmount must be a positive number");
  }
  
  if (solAmount > vault.solBufferSol + EPS) {
    throw new TradeError(
      400,
      `insufficient SOL buffer (requested ${solAmount}, available ${vault.solBufferSol.toFixed(4)})`,
    );
  }

  // Get token info
  const info = await getTokenInfo(mint);
  if (info.source === "none") {
    throw new TradeError(422, `no live price for ${mint}`);
  }

  // Validate the swap
  const validation = await validateVaultSwap({
    inputMint: new PublicKey("So11111111111111111111111111111111111111112"), // SOL
    outputMint: new PublicKey(mint),
    amountIn: BigInt(Math.round(solAmount * 1e9)),
    vaultId: vault.id,
  });

  if (!validation.valid) {
    throw new TradeError(400, validation.reason || "Swap validation failed");
  }

  // Execute the on-chain swap
  const vaultPda = new PublicKey(vault.onchainVaultPda as string);
  const result = await executeVaultSwap({
    vaultId: vault.id,
    vaultPda,
    inputMint: new PublicKey("So11111111111111111111111111111111111111112"),
    outputMint: new PublicKey(mint),
    amountIn: BigInt(Math.round(solAmount * 1e9)),
  });

  // Record the trade in the database
  const now = nowSec();
  const tradeRow = await prisma.trade.create({
    data: {
      vaultId: vault.id,
      ts: now,
      side: "buy",
      mint,
      symbol: info.symbol,
      solAmount,
      tokenAmount: Number(result.outputAmount) / 1e9, // approximate
      priceSol: solAmount / (Number(result.outputAmount) / 1e9),
      txSig: result.signature,
      source: "real",
    },
  });

  // Update the vault's buffer and create/update position
  const { trade: recordedTrade, position } = await prisma.$transaction(async (tx) => {
    // Debit buffer
    await tx.vault.update({
      where: { id: vault.id },
      data: { solBufferSol: { decrement: solAmount } },
    });

    // Create or update position
    const existing = await tx.position.findUnique({
      where: { vaultId_mint: { vaultId: vault.id, mint } },
    });

    const tokenAmount = Number(result.outputAmount) / 1e9;
    let positionRow: any = null;

    if (existing) {
      positionRow = await tx.position.update({
        where: { id: existing.id },
        data: {
          amountTokens: existing.amountTokens + tokenAmount,
          costSol: existing.costSol + solAmount,
          valueSol: (existing.amountTokens + tokenAmount) * (solAmount / tokenAmount),
          markStale: false,
        },
      });
    } else {
      positionRow = await tx.position.create({
        data: {
          vaultId: vault.id,
          mint,
          symbol: info.symbol,
          name: info.name,
          amountTokens: tokenAmount,
          costSol: solAmount,
          valueSol: tokenAmount * (solAmount / tokenAmount),
          markStale: false,
        },
      });
    }

    // Recalculate TVL and NAV
    const fresh = await tx.vault.findUniqueOrThrow({
      where: { id: vault.id },
      select: { solBufferSol: true, totalShares: true },
    });
    const agg = await tx.position.aggregate({ 
      where: { vaultId: vault.id }, 
      _sum: { valueSol: true } 
    });
    const tvlSol = fresh.solBufferSol + (agg._sum.valueSol ?? 0);
    const sharePriceSol = fresh.totalShares > 0 ? tvlSol / fresh.totalShares : 1;
    
    await tx.vault.update({ 
      where: { id: vault.id }, 
      data: { tvlSol, sharePriceSol } 
    });

    // Record equity point
    const last = await tx.equityPoint.findFirst({
      where: { vaultId: vault.id },
      orderBy: { t: "desc" },
      select: { t: true },
    });
    if (!last || now - last.t >= EQUITY_MIN_GAP_SEC) {
      await tx.equityPoint.upsert({
        where: { vaultId_t: { vaultId: vault.id, t: now } },
        update: { v: sharePriceSol },
        create: { vaultId: vault.id, t: now, v: sharePriceSol },
      });
    }

    return { trade: toTrade(tradeRow), position: positionRow ? toPosition(positionRow) : null };
  });

  const assembled = await assembleVault(vault.id);
  return {
    trade: recordedTrade,
    position,
    vault: assembled!,
  };
}
