import {
  PERF_FEE_DEFAULT_BPS,
  PERF_FEE_MAX_BPS,
  PERF_FEE_MIN_BPS,
  type Vault,
  type VaultType,
} from "@coffer/shared";
import { Router } from "express";
import { prisma } from "../db.js";
import { executeTrade, TradeError } from "../services/trading.js";
import {
  assembleVault,
  assembleVaults,
  getDemoUser,
  toPosition,
  toTrade,
  toWithdrawRequest,
} from "../services/vaults.js";

export const vaultsRouter = Router();

const nowSec = () => Math.floor(Date.now() / 1000);

type SortKey = "tvl" | "pnl7d" | "pnl30d" | "pnlAll" | "age" | "sharePrice";

const SORTERS: Record<SortKey, (a: Vault, b: Vault) => number> = {
  tvl: (a, b) => b.tvlSol - a.tvlSol,
  pnl7d: (a, b) => b.stats.pnlPct7d - a.stats.pnlPct7d,
  pnl30d: (a, b) => b.stats.pnlPct30d - a.stats.pnlPct30d,
  pnlAll: (a, b) => b.stats.pnlPctAll - a.stats.pnlPctAll,
  age: (a, b) => b.stats.ageDays - a.stats.ageDays,
  sharePrice: (a, b) => b.sharePriceSol - a.sharePriceSol,
};

// GET /api/vaults?sort=tvl|pnl7d|pnl30d|pnlAll|age|sharePrice&type=managed|mirror
vaultsRouter.get("/", async (req, res, next) => {
  try {
    const type = req.query.type as VaultType | undefined;
    if (type !== undefined && type !== "managed" && type !== "mirror") {
      res.status(400).json({ error: 'type must be "managed" or "mirror"' });
      return;
    }
    const sortKey = (req.query.sort as SortKey | undefined) ?? "tvl";
    const sorter = SORTERS[sortKey];
    if (!sorter) {
      res.status(400).json({ error: `sort must be one of ${Object.keys(SORTERS).join(", ")}` });
      return;
    }
    // List views get a downsampled curve (sparkline density).
    const vaults = await assembleVaults({ type }, { curvePoints: 240 });
    vaults.sort(sorter);
    res.json({ vaults });
  } catch (err) {
    next(err);
  }
});

// GET /api/vaults/:id — vault + positions + last 50 trades + pending withdrawals
vaultsRouter.get("/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    const vault = await assembleVault(id);
    if (!vault) {
      res.status(404).json({ error: "vault not found" });
      return;
    }
    const [positions, trades, withdrawals] = await Promise.all([
      prisma.position.findMany({ where: { vaultId: id }, orderBy: { valueSol: "desc" } }),
      prisma.trade.findMany({ where: { vaultId: id }, orderBy: { ts: "desc" }, take: 50 }),
      prisma.withdrawRequest.findMany({
        where: { vaultId: id, status: { in: ["pending", "executable"] } },
        orderBy: { requestedAt: "desc" },
      }),
    ]);
    res.json({
      vault,
      positions: positions.map(toPosition),
      trades: trades.map(toTrade),
      pendingWithdrawals: withdrawals.map(toWithdrawRequest),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/vaults — create a vault (demo user becomes the trader)
vaultsRouter.post("/", async (req, res, next) => {
  try {
    const { name, type, perfFeeBps, thesis, leaderWallet } = (req.body ?? {}) as {
      name?: string;
      type?: string;
      perfFeeBps?: number;
      thesis?: string;
      leaderWallet?: string;
    };
    if (!name || typeof name !== "string" || name.trim().length < 3) {
      res.status(400).json({ error: "name must be at least 3 characters" });
      return;
    }
    if (type !== "managed" && type !== "mirror") {
      res.status(400).json({ error: 'type must be "managed" or "mirror"' });
      return;
    }
    if (type === "mirror" && !leaderWallet) {
      res.status(400).json({ error: "mirror vaults require leaderWallet" });
      return;
    }
    const fee = Math.min(
      PERF_FEE_MAX_BPS,
      Math.max(PERF_FEE_MIN_BPS, Math.round(Number(perfFeeBps) || PERF_FEE_DEFAULT_BPS)),
    );
    const trader = await getDemoUser();
    const created = await prisma.vault.create({
      data: {
        name: name.trim(),
        type,
        status: "active",
        traderId: trader.id,
        leaderWallet: type === "mirror" ? leaderWallet : null,
        tvlSol: 0,
        sharePriceSol: 1,
        totalShares: 0,
        managerStakeSol: 0,
        perfFeeBps: fee,
        redeemWindowHours: 24,
        solBufferSol: 0,
        thesis: thesis?.trim() || null,
      },
    });
    await prisma.equityPoint.create({ data: { vaultId: created.id, t: nowSec(), v: 0 } });
    const vault = await assembleVault(created.id);
    res.status(201).json({ vault });
  } catch (err) {
    next(err);
  }
});

// POST /api/vaults/:id/trade — DEMO trade execution at the LIVE oracle
// price. Body: { side: "buy"|"sell", mint, solAmount? (buy),
// sellFraction? 0-1 (sell) }. Responds with the shared TradeResult
// shape { trade, position, vault } (position null when the sell closed
// it). 422 when the oracle has no live mark — we never fabricate.
vaultsRouter.post("/:id/trade", async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as {
      side?: "buy" | "sell";
      mint?: string;
      solAmount?: number;
      sellFraction?: number;
    };
    const result = await executeTrade(req.params.id, {
      side: body.side as "buy" | "sell",
      mint: body.mint as string,
      solAmount: body.solAmount,
      sellFraction: body.sellFraction,
    });
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof TradeError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// POST /api/vaults/:id/deposit { sol } — DEMO ledger operation: adjusts
// tvl/shares/buffer and records a Deposit row. No chain interaction.
vaultsRouter.post("/:id/deposit", async (req, res, next) => {
  try {
    const sol = Number((req.body ?? {}).sol);
    if (!Number.isFinite(sol) || sol <= 0) {
      res.status(400).json({ error: "sol must be a positive number" });
      return;
    }
    const dbVault = await prisma.vault.findUnique({ where: { id: req.params.id } });
    if (!dbVault) {
      res.status(404).json({ error: "vault not found" });
      return;
    }
    if (dbVault.status !== "active") {
      res.status(409).json({ error: `vault is ${dbVault.status}` });
      return;
    }
    const user = await getDemoUser();
    const sharePrice = dbVault.sharePriceSol > 0 ? dbVault.sharePriceSol : 1;
    const shares = sol / sharePrice;
    const [deposit] = await prisma.$transaction([
      prisma.deposit.create({
        data: { vaultId: dbVault.id, userId: user.id, shares, costSol: sol },
      }),
      prisma.vault.update({
        where: { id: dbVault.id },
        data: {
          tvlSol: { increment: sol },
          totalShares: { increment: shares },
          solBufferSol: { increment: sol },
        },
      }),
      prisma.equityPoint.create({
        data: { vaultId: dbVault.id, t: nowSec(), v: dbVault.tvlSol + sol },
      }),
    ]);
    const vault = await assembleVault(dbVault.id);
    res.status(201).json({ deposit: { id: deposit.id, shares, costSol: sol }, vault });
  } catch (err) {
    next(err);
  }
});

// POST /api/vaults/:id/withdraw { shares } — DEMO ledger operation.
// Instant when the SOL buffer covers it, otherwise windowed by
// redeemWindowHours (request sits "pending" until executableAt).
vaultsRouter.post("/:id/withdraw", async (req, res, next) => {
  try {
    const shares = Number((req.body ?? {}).shares);
    if (!Number.isFinite(shares) || shares <= 0) {
      res.status(400).json({ error: "shares must be a positive number" });
      return;
    }
    const dbVault = await prisma.vault.findUnique({ where: { id: req.params.id } });
    if (!dbVault) {
      res.status(404).json({ error: "vault not found" });
      return;
    }
    const user = await getDemoUser();

    // held = deposited − already withdrawn/withdrawing
    const [deposits, priorWithdrawals] = await Promise.all([
      prisma.deposit.aggregate({
        where: { vaultId: dbVault.id, userId: user.id },
        _sum: { shares: true },
      }),
      prisma.withdrawRequest.aggregate({
        where: { vaultId: dbVault.id, userId: user.id, status: { not: "cancelled" } },
        _sum: { shares: true },
      }),
    ]);
    const held = (deposits._sum.shares ?? 0) - (priorWithdrawals._sum.shares ?? 0);
    if (shares > held + 1e-9) {
      res.status(400).json({ error: `insufficient shares (held: ${held.toFixed(4)})` });
      return;
    }

    const valueSol = shares * dbVault.sharePriceSol;
    const instant = valueSol <= dbVault.solBufferSol;
    const now = nowSec();

    if (instant) {
      const [request] = await prisma.$transaction([
        prisma.withdrawRequest.create({
          data: {
            vaultId: dbVault.id,
            userId: user.id,
            shares,
            valueAtRequestSol: valueSol,
            requestedAt: now,
            executableAt: now,
            status: "paid",
          },
        }),
        prisma.vault.update({
          where: { id: dbVault.id },
          data: {
            tvlSol: { decrement: valueSol },
            totalShares: { decrement: shares },
            solBufferSol: { decrement: valueSol },
          },
        }),
        prisma.equityPoint.create({
          data: { vaultId: dbVault.id, t: now, v: Math.max(0, dbVault.tvlSol - valueSol) },
        }),
      ]);
      res.status(201).json({ mode: "instant", request: toWithdrawRequest(request) });
      return;
    }

    // Windowed: funds move when the request executes after the window.
    const request = await prisma.withdrawRequest.create({
      data: {
        vaultId: dbVault.id,
        userId: user.id,
        shares,
        valueAtRequestSol: valueSol,
        requestedAt: now,
        executableAt: now + dbVault.redeemWindowHours * 3600,
        status: "pending",
      },
    });
    res.status(201).json({ mode: "windowed", request: toWithdrawRequest(request) });
  } catch (err) {
    next(err);
  }
});
