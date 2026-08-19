# Adversarial source review — 2026-08-18 (pre-compile)

Source-level review before any build/deploy. **Custody invariants verified as holding**
(no path moves vault funds to the trader; share-math rounding favors the pool everywhere;
worse-of is on the correct side; fee ≤ proceeds; re-init guards present; execute_swap's
third-ATA drain guard and post-CPI delta checks are sound). The material findings are
liveness-side and MUST be addressed in P1 before devnet testing with outside depositors.

## Fix before P1 ships

- **H1 — Stale-NAV freeze has no permissionless escape.** All withdrawal paths gate on
  `assert_nav_fresh`; a dead keeper (or a hostile platform declining to rotate/post)
  freezes withdrawals indefinitely. Fix: add a permissionless stale-NAV withdrawal path
  after a grace period — redeem at the last posted mark with a conservative haircut —
  so withdrawal *entitlement* never depends on a live keeper or responsive admin.
- **H2 — No forced unwind for settlement.** A trader can `wrap_sol` the whole buffer and
  simply never `unwrap`; matured withdrawal requests then fail `InsufficientSolBuffer`
  forever. Freeze/kill-switch stop *trading* but cannot compel settlement. Fix: a
  platform-triggered or permissionless unwind/settle path when a matured request cannot
  clear (e.g. permissionless `unwrap_sol` once any matured request is unpaid).

## Fix when convenient (P1)

- **M1** — Token-spend side of `execute_swap` is uncapped (`min_out` can be 1): a hostile
  trader can dump an entire position into an attacker pool in one trade. Within the
  documented trust model, but add a token-side cap or a min-out floor vs a reference
  price, and disclose the residual risk.
- **L1** — `wrap_sol` skips the daily-loss-breaker guard (`execute_swap` has it): add it.
- **L2** — Stale-high marks are arbitrageable until the keeper posts a loss: set
  `nav_staleness_seconds` much tighter than the 1-day max in production; document.
- **L3** — Gain posts relock *all* outstanding locked profit (drip clock restarts):
  decay only the incremental gain.

## Notes / accepted

- **I1** — A hostile keeper yo-yoing NAV within delta caps can push `total_shares`
  toward u128 overflow → safe `MathOverflow` deposit-DoS, not fund loss. Off-chain
  keeper rate-limiting required.
- **I2** — Direct lamport donations aren't in NAV (this is what makes share price
  donation-proof); surplus sits unattributed until a keeper mark absorbs it.
- **I3** — `init_platform` requires an upgradeable deploy with caller as upgrade
  authority; an immutable deploy can never initialize. Deployment-time note.
- Author-tagged `NOTE(api)` items (pubkey! path, div_ceil, programdata_address, spl
  features) remain to verify at first `anchor build`; reviewer found no additional
  likely-miscompile in unmarked code.
