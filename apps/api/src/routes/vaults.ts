import {
  PERF_FEE_DEFAULT_BPS,
  PERF_FEE_MAX_BPS,
  PERF_FEE_MIN_BPS,
  type Vault,
  type VaultMode,
  type VaultType,
} from "@coffer/shared";
import { Router } from "express";
import { prisma } from "../db.js";
import { crystallize } from "../services/fees.js";
import { executeTrade, REAL_VAULT_WALL, TradeError } from "../services/trading.js";
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

// GET /api/vaults?sort=tvl|pnl7d|pnl30d|pnlAll|age|sharePrice&type=managed|mirror&mode=real|paper
// No mode param = ALL vaults — the web filters per surface.
vaultsRouter.get("/", async (req, res, next) => {
  try {
    const type = req.query.type as VaultType | undefined;
    if (type !== undefined && type !== "managed" && type !== "mirror") {
      res.status(400).json({ error: 'type must be "managed" or "mirror"' });
      return;
    }
    const mode = req.query.mode as VaultMode | undefined;
    if (mode !== undefined && mode !== "real" && mode !== "paper") {
      res.status(400).json({ error: 'mode must be "real" or "paper"' });
      return;
    }
    const sortKey = (req.query.sort as SortKey | undefined) ?? "tvl";
    const sorter = SORTERS[sortKey];
    if (!sorter) {
      res.status(400).json({ error: `sort must be one of ${Object.keys(SORTERS).join(", ")}` });
      return;
    }
    // List views get a downsampled curve (sparkline density).
    const vaults = await assembleVaults({ type, mode }, { curvePoints: 240 });
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

// GET /api/vaults/:id/mirror — mirror copy config + sync state. Kept as
// its own endpoint because the shared Vault shape has no mirror-config
// fields (packages/shared is not extended here). fixedSol/maxSol report
// the EFFECTIVE values (engine defaults applied when the row is null).
vaultsRouter.get("/:id/mirror", async (req, res, next) => {
  try {
    const vault = await prisma.vault.findUnique({ where: { id: req.params.id } });
    if (!vault) {
      res.status(404).json({ error: "vault not found" });
      return;
    }
    if (vault.type !== "mirror") {
      res.status(404).json({ error: "not a mirror vault" });
      return;
    }
    res.json({
      config: {
        sizingMode: vault.mirrorSizingMode ?? "fixed",
        fixedSol: vault.mirrorFixedSol ?? 0.25,
        maxSol: vault.mirrorMaxSol ?? 1.0,
      },
      leaderWallet: vault.leaderWallet,
      lastSig: vault.mirrorLastSig,
      syncedAt: vault.mirrorSyncedAt,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/vaults — create a vault (demo user becomes the trader).
// mode defaults to "real" when omitted: the MAIN platform is real SOL.
// Creating a real vault is just a DB row — its on-chain init is pending,
// and every ledger operation against it is walled until the program ships.
// Mirror vaults additionally accept mirrorSizingMode ("fixed" |
// "proportional"), mirrorFixedSol (0.01–100) and mirrorMaxSol
// (>= fixed); omitted values fall back to the engine defaults
// (fixed, 0.25 SOL, cap 1.0 SOL).
vaultsRouter.post("/", async (req, res, next) => {
  try {
    const {
      name,
      type,
      mode,
      perfFeeBps,
      thesis,
      leaderWallet,
      mirrorSizingMode,
      mirrorFixedSol,
      mirrorMaxSol,
    } = (req.body ?? {}) as {
      name?: string;
      type?: string;
      mode?: string;
      perfFeeBps?: number;
      thesis?: string;
      leaderWallet?: string;
      mirrorSizingMode?: string;
      mirrorFixedSol?: number;
      mirrorMaxSol?: number;
    };
    if (!name || typeof name !== "string" || name.trim().length < 3) {
      res.status(400).json({ error: "name must be at least 3 characters" });
      return;
    }
    if (type !== "managed" && type !== "mirror") {
      res.status(400).json({ error: 'type must be "managed" or "mirror"' });
      return;
    }
    const vaultMode: VaultMode = mode === undefined ? "real" : (mode as VaultMode);
    if (vaultMode !== "real" && vaultMode !== "paper") {
      res.status(400).json({ error: 'mode must be "real" or "paper"' });
      return;
    }
    if (type === "mirror" && !leaderWallet) {
      res.status(400).json({ error: "mirror vaults require leaderWallet" });
      return;
    }
    // ── mirror copy config (mirror vaults only) ──────────────────────
    if (
      type !== "mirror" &&
      (mirrorSizingMode !== undefined || mirrorFixedSol !== undefined || mirrorMaxSol !== undefined)
    ) {
      res.status(400).json({ error: "mirror sizing config only applies to mirror vaults" });
      return;
    }
    if (
      mirrorSizingMode !== undefined &&
      mirrorSizingMode !== "fixed" &&
      mirrorSizingMode !== "proportional"
    ) {
      res.status(400).json({ error: 'mirrorSizingMode must be "fixed" or "proportional"' });
      return;
    }
    if (
      mirrorFixedSol !== undefined &&
      (typeof mirrorFixedSol !== "number" || !Number.isFinite(mirrorFixedSol) ||
        mirrorFixedSol < 0.01 || mirrorFixedSol > 100)
    ) {
      res.status(400).json({ error: "mirrorFixedSol must be a number between 0.01 and 100" });
      return;
    }
    // max must cover the effective fixed size (default 0.25 when omitted)
    const effectiveFixed = mirrorFixedSol ?? 0.25;
    if (
      mirrorMaxSol !== undefined &&
      (typeof mirrorMaxSol !== "number" || !Number.isFinite(mirrorMaxSol) ||
        mirrorMaxSol < effectiveFixed)
    ) {
      res.status(400).json({
        error: `mirrorMaxSol must be a number >= the fixed copy size (${effectiveFixed})`,
      });
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
        mode: vaultMode,
        status: "active",
        traderId: trader.id,
        leaderWallet: type === "mirror" ? leaderWallet : null,
        mirrorSizingMode: type === "mirror" ? (mirrorSizingMode ?? null) : null,
        mirrorFixedSol: type === "mirror" ? (mirrorFixedSol ?? null) : null,
        mirrorMaxSol: type === "mirror" ? (mirrorMaxSol ?? null) : null,
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
    const t0 = nowSec();
    // equity curve is PER-SHARE value; a fresh vault starts at 1.0
    await prisma.equityPoint.upsert({
      where: { vaultId_t: { vaultId: created.id, t: t0 } },
      update: { v: 1 },
      create: { vaultId: created.id, t: t0, v: 1 },
    });
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
      // err.body carries exact wire shapes (e.g. the real-vault wall)
      res.status(err.status).json(err.body ?? { error: err.message });
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
    if (dbVault.mode === "real") {
      // THE WALL: real-vault deposits are on-chain transfers, not ledger rows
      res.status(409).json(REAL_VAULT_WALL);
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
      // per-depositor ledger — the cost basis fees crystallize against
      prisma.vaultDepositor.upsert({
        where: { vaultId_userId: { vaultId: dbVault.id, userId: user.id } },
        update: { shares: { increment: shares }, costSol: { increment: sol } },
        create: { vaultId: dbVault.id, userId: user.id, shares, costSol: sol },
      }),
      prisma.vault.update({
        where: { id: dbVault.id },
        data: {
          tvlSol: { increment: sol },
          totalShares: { increment: shares },
          solBufferSol: { increment: sol },
        },
      }),
      // deposits mint at the current share price and do not move it —
      // record the unchanged per-share value
      prisma.equityPoint.upsert({
        where: { vaultId_t: { vaultId: dbVault.id, t: nowSec() } },
        update: { v: sharePrice },
        create: { vaultId: dbVault.id, t: nowSec(), v: sharePrice },
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
    if (dbVault.mode === "real") {
      // THE WALL: real-vault withdrawals (instant AND windowed) are on-chain
      res.status(409).json(REAL_VAULT_WALL);
      return;
    }
    const user = await getDemoUser();

    // held/basis come from the per-depositor ledger; pending (unexecuted)
    // requests still reserve their shares
    const [depositor, pendingReqs] = await Promise.all([
      prisma.vaultDepositor.findUnique({
        where: { vaultId_userId: { vaultId: dbVault.id, userId: user.id } },
      }),
      prisma.withdrawRequest.aggregate({
        where: {
          vaultId: dbVault.id,
          userId: user.id,
          status: { in: ["pending", "executable"] },
        },
        _sum: { shares: true },
      }),
    ]);
    const held = (depositor?.shares ?? 0) - (pendingReqs._sum.shares ?? 0);
    if (!depositor || shares > held + 1e-9) {
      res.status(400).json({ error: `insufficient shares (held: ${Math.max(0, held).toFixed(4)})` });
      return;
    }

    const valueSol = shares * dbVault.sharePriceSol;
    const instant = valueSol <= dbVault.solBufferSol;
    const now = nowSec();

    if (instant) {
      // crystallize the 70/20/10 split against this portion's cost basis
      const fees = crystallize({
        grossSol: valueSol,
        positionCostSol: depositor.costSol,
        shares,
        positionShares: depositor.shares,
        perfFeeBps: dbVault.perfFeeBps,
      });
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
        prisma.vaultDepositor.update({
          where: { id: depositor.id },
          data: {
            shares: { decrement: shares },
            costSol: { decrement: fees.costBasisSol },
            cumulativeTraderFeeSol: { increment: fees.traderFeeSol },
          },
        }),
        prisma.vault.update({
          where: { id: dbVault.id },
          data: {
            // gross leaves depositor equity; fees move from the buffer
            // into the accrual buckets (owed, outside tvl)
            tvlSol: { decrement: valueSol },
            totalShares: { decrement: shares },
            solBufferSol: { decrement: valueSol },
            traderFeesAccruedSol: { increment: fees.traderFeeSol },
            platformFeesAccruedSol: { increment: fees.platformFeeSol },
          },
        }),
        // a fair-priced withdrawal leaves per-share value unchanged
        prisma.equityPoint.upsert({
          where: { vaultId_t: { vaultId: dbVault.id, t: now } },
          update: { v: dbVault.sharePriceSol },
          create: { vaultId: dbVault.id, t: now, v: dbVault.sharePriceSol },
        }),
      ]);
      res.status(201).json({ mode: "instant", request: toWithdrawRequest(request), fees });
      return;
    }

    // Windowed: funds move — and fees crystallize — when the request
    // executes after the window (at worse-of pricing).
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
