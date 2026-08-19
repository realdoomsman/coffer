import { Router } from "express";
import { prisma } from "../db.js";
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

    const [updated] = await prisma.$transaction([
      prisma.withdrawRequest.update({
        where: { id: request.id },
        data: { status: "paid", paidAt: now },
      }),
      prisma.vault.update({
        where: { id: vault.id },
        data: {
          tvlSol: { decrement: paidSol },
          totalShares: { decrement: request.shares },
          solBufferSol: { decrement: paidSol },
        },
      }),
      prisma.equityPoint.upsert({
        where: { vaultId_t: { vaultId: vault.id, t: now } },
        update: { v: Math.max(0, vault.tvlSol - paidSol) },
        create: { vaultId: vault.id, t: now, v: Math.max(0, vault.tvlSol - paidSol) },
      }),
    ]);

    const assembled = await assembleVault(vault.id);
    res.json({ request: toWithdrawRequest(updated), paidSol, vault: assembled });
  } catch (err) {
    next(err);
  }
});
