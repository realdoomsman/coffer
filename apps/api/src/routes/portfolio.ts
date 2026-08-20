import type { Holding } from "@coffer/shared";
import { Router } from "express";
import { prisma } from "../db.js";
import { getDemoUser, toWithdrawRequest } from "../services/vaults.js";

export const portfolioRouter = Router();

// GET /api/portfolio — demo user's holdings + withdraw requests.
// Holdings read the per-depositor ledger (VaultDepositor), the same
// rows fee crystallization maintains — one source of truth for shares
// held and remaining cost basis. Pending requests escrow their shares.
portfolioRouter.get("/", async (_req, res, next) => {
  try {
    const user = await getDemoUser();
    const [depositors, withdrawals] = await Promise.all([
      prisma.vaultDepositor.findMany({
        where: { userId: user.id },
        include: { vault: true },
      }),
      prisma.withdrawRequest.findMany({
        where: { userId: user.id },
        orderBy: { requestedAt: "desc" },
      }),
    ]);

    const holdings: Holding[] = depositors
      .filter((d) => d.shares > 1e-9)
      .map((d) => {
        const valueSol = d.shares * d.vault.sharePriceSol;
        const pnlSol = valueSol - d.costSol;
        return {
          vaultId: d.vaultId,
          vaultName: d.vault.name,
          vaultType: d.vault.type as Holding["vaultType"],
          shares: d.shares,
          valueSol,
          costSol: d.costSol,
          pnlSol,
          pnlPct: d.costSol > 0 ? (pnlSol / d.costSol) * 100 : 0,
        };
      })
      .sort((a, b) => b.valueSol - a.valueSol);

    res.json({
      holdings,
      withdrawRequests: withdrawals.map(toWithdrawRequest),
    });
  } catch (err) {
    next(err);
  }
});
