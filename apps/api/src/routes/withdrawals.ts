import { Router } from "express";
import { prisma } from "../db.js";
import { REAL_VAULT_WALL } from "../services/trading.js";
import { assembleVault, toWithdrawRequest } from "../services/vaults.js";

export const withdrawalsRouter = Router();

const EPS = 1e-9;
const nowSec = () => Math.floor(Date.now() / 1000);

// POST /api/withdrawals/:id/execute — pay out a matured withdraw
// request. Payout is worse-of: min(value at request, shares × current
// share price). Requires the vault's SOL buffer to cover it — the
// trader has to unwind positions first otherwise.
withdrawalsRouter.post("/:id/execute", async (req, res, next) => {
  try {
    const request = await prisma.withdrawRequest.findUnique({
      where: { id: req.params.id },
      include: { vault: true },
    });
    if (!request) {
      res.status(404).json({ error: "withdraw request not found" });
      return;
    }
    if (request.vault.mode === "real") {
      // THE WALL: real-vault payouts are on-chain, never ledger entries
      res.status(409).json(REAL_VAULT_WALL);
      return;
    }
    const now = nowSec();
    if (request.status !== "pending" && request.status !== "executable") {
      res.status(409).json({ error: `request is ${request.status}` });
      return;
    }
    if (now < request.executableAt) {
      res.status(409).json({
        error: `request is not executable until ${request.executableAt} (redeem window)`,
      });
      return;
    }

    const vault = request.vault;
    const paidSol = Math.min(request.valueAtRequestSol, request.shares * vault.sharePriceSol);
    if (vault.solBufferSol + EPS < paidSol) {
      res.status(409).json({ error: "vault buffer insufficient — trader must unwind" });
      return;
    }

    // worse-of payouts can pay below fair value — the difference accrues to
    // remaining holders, so recompute per-share value after the exit
    const newShares = Math.max(0, vault.totalShares - request.shares);
    const newTvl = Math.max(0, vault.tvlSol - paidSol);
    const newSharePrice = newShares > 0 ? newTvl / newShares : 1;
    const [updated] = await prisma.$transaction([
      prisma.withdrawRequest.update({
        where: { id: request.id },
        data: { status: "paid", paidAt: now },
      }),
      prisma.vault.update({
        where: { id: vault.id },
        data: {
          tvlSol: newTvl,
          totalShares: newShares,
          solBufferSol: { decrement: paidSol },
          sharePriceSol: newSharePrice,
        },
      }),
      prisma.equityPoint.upsert({
        where: { vaultId_t: { vaultId: vault.id, t: now } },
        update: { v: newSharePrice },
        create: { vaultId: vault.id, t: now, v: newSharePrice },
      }),
    ]);

    const assembled = await assembleVault(vault.id);
    res.json({ request: toWithdrawRequest(updated), paidSol, vault: assembled });
  } catch (err) {
    next(err);
  }
});
