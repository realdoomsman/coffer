import type { Holding } from "@coffer/shared";
import { Router } from "express";
import { prisma } from "../db.js";
import { getDemoUser, toWithdrawRequest } from "../services/vaults.js";

export const portfolioRouter = Router();

// GET /api/portfolio — demo user's holdings + withdraw requests.
// Holdings are derived from the Deposit/WithdrawRequest ledger:
// shares held = deposited − withdrawn (any non-cancelled request
// escrows its shares), cost basis reduced proportionally.
portfolioRouter.get("/", async (_req, res, next) => {
  try {
    const user = await getDemoUser();
    const [deposits, withdrawals] = await Promise.all([
      prisma.deposit.findMany({ where: { userId: user.id }, include: { vault: true } }),
      prisma.withdrawRequest.findMany({
        where: { userId: user.id },
        orderBy: { requestedAt: "desc" },
      }),
    ]);

    const byVault = new Map<
      string,
      { name: string; type: string; sharePriceSol: number; shares: number; costSol: number }
    >();
    for (const d of deposits) {
      const entry = byVault.get(d.vaultId) ?? {
        name: d.vault.name,
        type: d.vault.type,
        sharePriceSol: d.vault.sharePriceSol,
        shares: 0,
        costSol: 0,
      };
      entry.shares += d.shares;
      entry.costSol += d.costSol;
      byVault.set(d.vaultId, entry);
    }
    for (const w of withdrawals) {
      if (w.status === "cancelled") continue;
      const entry = byVault.get(w.vaultId);
      if (!entry || entry.shares <= 0) continue;
      const ratio = Math.min(1, w.shares / entry.shares);
      entry.costSol -= entry.costSol * ratio;
      entry.shares -= w.shares;
    }

    const holdings: Holding[] = [...byVault.entries()]
      .filter(([, e]) => e.shares > 1e-9)
      .map(([vaultId, e]) => {
        const valueSol = e.shares * e.sharePriceSol;
        const pnlSol = valueSol - e.costSol;
        return {
          vaultId,
          vaultName: e.name,
          vaultType: e.type as Holding["vaultType"],
          shares: e.shares,
          valueSol,
          costSol: e.costSol,
          pnlSol,
          pnlPct: e.costSol > 0 ? (pnlSol / e.costSol) * 100 : 0,
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
