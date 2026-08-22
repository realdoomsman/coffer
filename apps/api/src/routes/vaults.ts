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
import {
  depositOnChain,
  initVaultOnChain,
  readOnChainVault,
} from "../services/onchainVaults.js";
import { MIN_DEPOSIT_LAMPORTS, solToLamports } from "../services/program.js";
import { OnChainError, getServerPublicKey, tryGetServerKeypair } from "../services/signer.js";
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
    // own-property lookup only: `?sort=constructor` would otherwise reach
    // an inherited Object.prototype member, pass the truthiness check and
    // crash Array.sort with a non-comparator
    const sorter = Object.prototype.hasOwnProperty.call(SORTERS, sortKey)
      ? SORTERS[sortKey]
      : undefined;
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
    // Upper bound matters as much as the lower one: an unbounded name is
    // rendered in every table, ticker and <select>, and one 10k-char name
    // blew the vault tables out to 75,000px, pushing TVL and performance
    // off-screen for EVERY other vault (audit).
    if (name.trim().length > 60) {
      res.status(400).json({ error: "name must be 60 characters or fewer" });
      return;
    }
    if (thesis !== undefined && typeof thesis !== "string") {
      res.status(400).json({ error: "thesis must be a string" });
      return;
    }
    if (typeof thesis === "string" && thesis.trim().length > 500) {
      res.status(400).json({ error: "thesis must be 500 characters or fewer" });
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
    if (
      type === "mirror" &&
      (typeof leaderWallet !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(leaderWallet))
    ) {
      // a truthy non-string used to reach Prisma and 500
      res.status(400).json({ error: "mirror vaults require a valid base58 leaderWallet" });
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

    // ── real vaults are created ON-CHAIN, not in this database ───────
    // The row above is an index entry; init_vault is what actually
    // creates the vault. The PDA seed is the row id, so the account is
    // re-derivable from the row alone.
    //
    // Failure policy: if the program rejects init_vault, the row is
    // DELETED and the request fails — a "real" vault with no on-chain
    // account would be a lie that the deposit path could not honour.
    // The one tolerated gap is a missing server keypair (prod has none
    // yet): the row survives, onchain stays null, and the response says
    // so out loud.
    let onchain: Record<string, unknown> | null = null;
    if (vaultMode === "real") {
      const key = tryGetServerKeypair();
      if ("error" in key) {
        onchain = { status: "skipped", reason: key.error };
        console.warn(`[api] vault ${created.id} created OFF-chain only: ${key.error}`);
      } else {
        try {
          const result = await initVaultOnChain({
            id: created.id,
            type,
            perfFeeBps: fee,
            redeemWindowHours: 24,
          });
          await prisma.vault.update({
            where: { id: created.id },
            data: {
              onchainVaultPda: result.vaultPda,
              onchainInitSig: result.signature || null,
            },
          });
          onchain = { status: result.signature ? "created" : "already_existed", ...result };
        } catch (err) {
          await prisma.vault.delete({ where: { id: created.id } }).catch(() => {});
          if (err instanceof OnChainError) {
            res.status(502).json({ error: "on-chain vault creation failed", ...err.toJson() });
            return;
          }
          res.status(502).json({
            error: `on-chain vault creation failed: ${(err as Error).message}`,
          });
          return;
        }
      }
    }

    const vault = await assembleVault(created.id);
    res.status(201).json({ vault, ...(onchain ? { onchain } : {}) });
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
    // 1e307 SOL made tokenAmount overflow to Infinity and 500 the trade
    if (sol > 1_000_000_000) {
      res.status(400).json({ error: "sol exceeds the maximum deposit (1e9)" });
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
      const request = await prisma.$transaction(async (tx) => {
        // CONDITIONAL, atomic debits. The held/buffer checks above are a
        // fast path only — concurrent withdrawals all read the same stale
        // snapshot, so unguarded decrements let 12 shares redeem against
        // 10 held and drove totalShares/tvl/buffer negative (audit),
        // which also made the holding vanish from the portfolio.
        const burned = await tx.vaultDepositor.updateMany({
          where: { id: depositor.id, shares: { gte: shares } },
          data: {
            shares: { decrement: shares },
            costSol: { decrement: fees.costBasisSol },
            cumulativeTraderFeeSol: { increment: fees.traderFeeSol },
          },
        });
        if (burned.count === 0) {
          throw new TradeError(400, "insufficient shares (concurrent withdrawal)");
        }
        const paid = await tx.vault.updateMany({
          where: {
            id: dbVault.id,
            totalShares: { gte: shares },
            solBufferSol: { gte: valueSol },
          },
          data: {
            // gross leaves depositor equity; fees move from the buffer
            // into the accrual buckets (owed, outside tvl)
            tvlSol: { decrement: valueSol },
            totalShares: { decrement: shares },
            solBufferSol: { decrement: valueSol },
            traderFeesAccruedSol: { increment: fees.traderFeeSol },
            platformFeesAccruedSol: { increment: fees.platformFeeSol },
          },
        });
        if (paid.count === 0) {
          throw new TradeError(409, "vault buffer insufficient — try a windowed withdrawal");
        }
        // a fair-priced withdrawal leaves per-share value unchanged
        await tx.equityPoint.upsert({
          where: { vaultId_t: { vaultId: dbVault.id, t: now } },
          update: { v: dbVault.sharePriceSol },
          create: { vaultId: dbVault.id, t: now, v: dbVault.sharePriceSol },
        });
        return tx.withdrawRequest.create({
          data: {
            vaultId: dbVault.id,
            userId: user.id,
            shares,
            valueAtRequestSol: valueSol,
            requestedAt: now,
            executableAt: now,
            status: "paid",
          },
        });
      });
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
    if (err instanceof TradeError) {
      res.status(err.status).json(err.body ?? { error: err.message });
      return;
    }
    next(err);
  }
});

// ── EXPLICITLY ON-CHAIN ROUTES ──────────────────────────────────────
// The only routes a real vault may use. Everything else in this file
// keeps hitting THE WALL (REAL_VAULT_WALL) for real vaults — these do
// not weaken it, they are the other side of it: they never touch the
// demo ledger, they only build, sign and send program instructions and
// read the resulting account state back.

// GET /api/vaults/:id/onchain — decoded live program state for a real
// vault. `?authority=<base58>` also returns that key's VaultDepositor
// record (defaults to the server key, which is the depositor of record
// for server-signed devnet deposits).
vaultsRouter.get("/:id/onchain", async (req, res, next) => {
  try {
    const dbVault = await prisma.vault.findUnique({ where: { id: req.params.id } });
    if (!dbVault) {
      res.status(404).json({ error: "vault not found" });
      return;
    }
    if (dbVault.mode !== "real") {
      res.status(409).json({ error: "paper vaults have no on-chain state" });
      return;
    }
    if (!dbVault.onchainVaultPda) {
      res.status(409).json({ error: "vault has no on-chain account (init_vault never landed)" });
      return;
    }
    const authorityParam = req.query.authority;
    let authority: string | undefined;
    if (typeof authorityParam === "string" && authorityParam.length > 0) {
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(authorityParam)) {
        res.status(400).json({ error: "authority must be a base58 pubkey" });
        return;
      }
      authority = authorityParam;
    } else {
      const key = tryGetServerKeypair();
      authority = "error" in key ? undefined : key.keypair.publicKey.toBase58();
    }
    const view = await readOnChainVault(dbVault.onchainVaultPda, authority);
    if (!view) {
      res.status(502).json({
        error: "on-chain vault account not found",
        vaultPda: dbVault.onchainVaultPda,
      });
      return;
    }
    res.json({ id: dbVault.id, initSig: dbVault.onchainInitSig, ...view });
  } catch (err) {
    next(err);
  }
});

// POST /api/vaults/:id/onchain/deposit { sol } — REAL on-chain deposit.
//
// ⚠ DEVNET PROOF PATH: the SERVER keypair signs, so the shares are
// credited to the platform's own key, not to a user. This is deliberate
// and temporary — it proves init_depositor + deposit execute against the
// deployed program. USER deposits (signed by the user's Privy embedded
// wallet, so the VaultDepositor PDA belongs to the USER) are a separate
// task: the instructions built here are already byte-for-byte the ones
// the user would sign; what is missing is the signature, not the client.
vaultsRouter.post("/:id/onchain/deposit", async (req, res, next) => {
  try {
    const sol = Number((req.body ?? {}).sol);
    if (!Number.isFinite(sol) || sol <= 0) {
      res.status(400).json({ error: "sol must be a positive number" });
      return;
    }
    if (sol > 1_000) {
      res.status(400).json({ error: "sol exceeds the on-chain deposit ceiling (1000)" });
      return;
    }
    const lamports = solToLamports(sol);
    if (lamports < MIN_DEPOSIT_LAMPORTS) {
      res.status(400).json({ error: `deposit must be at least ${MIN_DEPOSIT_LAMPORTS} lamports` });
      return;
    }
    const dbVault = await prisma.vault.findUnique({ where: { id: req.params.id } });
    if (!dbVault) {
      res.status(404).json({ error: "vault not found" });
      return;
    }
    if (dbVault.mode !== "real") {
      res.status(409).json({ error: "this route is on-chain only; paper vaults use /deposit" });
      return;
    }
    if (!dbVault.onchainVaultPda) {
      res.status(409).json({ error: "vault has no on-chain account (init_vault never landed)" });
      return;
    }
    const key = tryGetServerKeypair();
    if ("error" in key) {
      res.status(503).json({ error: `server signer unavailable: ${key.error}` });
      return;
    }
    const result = await depositOnChain({
      vaultPda: dbVault.onchainVaultPda,
      amountLamports: lamports,
    });
    res.status(201).json({
      vaultId: dbVault.id,
      vaultPda: dbVault.onchainVaultPda,
      signedBy: getServerPublicKey().toBase58(),
      signerRole: "server_keypair_devnet_proof",
      ...result,
    });
  } catch (err) {
    if (err instanceof OnChainError) {
      res.status(502).json({ error: "on-chain deposit failed", ...err.toJson() });
      return;
    }
    next(err);
  }
});
