// ── fee crystallization ─────────────────────────────────────────────
// The 70/20/10 money flow, per-portion (the same design the Anchor
// program uses — see programs/vault/src/instructions/withdraw.rs):
//
//   profit    = gross proceeds − proportional cost basis of the shares
//               being burned (never negative)
//   traderFee = profit × perfFeeBps / 10_000        (creator-set 10–30%)
//   platform  = profit × PLATFORM_PROFIT_BPS / 10_000 (10% → buyback sink)
//   payout    = gross − traderFee − platform
//
// Losses pay gross with zero fees. Fees accrue on the vault OUTSIDE tvl
// (they are owed, not depositor equity), so per-share value is untouched
// by a fair exit and remaining depositors never subsidize fees.

import type { FeeBreakdown } from "@coffer/shared";
import { PLATFORM_PROFIT_BPS } from "@coffer/shared";

export function crystallize(opts: {
  grossSol: number;
  /** depositor's remaining cost basis across their whole position */
  positionCostSol: number;
  /** shares being burned */
  shares: number;
  /** depositor's total shares before this exit */
  positionShares: number;
  perfFeeBps: number;
}): FeeBreakdown {
  const { grossSol, positionCostSol, shares, positionShares, perfFeeBps } = opts;
  const fraction = positionShares > 0 ? Math.min(1, shares / positionShares) : 1;
  const costBasisSol = positionCostSol * fraction;
  const profitSol = Math.max(0, grossSol - costBasisSol);
  const traderFeeSol = (profitSol * perfFeeBps) / 10_000;
  const platformFeeSol = (profitSol * PLATFORM_PROFIT_BPS) / 10_000;
  const paidSol = grossSol - traderFeeSol - platformFeeSol;
  return {
    grossSol,
    costBasisSol,
    profitSol,
    traderFeeSol,
    platformFeeSol,
    paidSol,
  };
}
