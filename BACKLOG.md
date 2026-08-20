# Coffer — the honest gap list

What "crazy good and everything works" actually requires, measured against Axiom / GMGN /
Photon / Padre feature-for-feature. Ordered by what moves trust and money first. ✅ = done,
🔶 = partial/demo-grade, ⬜ = not started.

## The core (nothing else matters if this isn't real)

- 🔶 **On-chain vault program** — full Anchor source written + adversarially reviewed
  (REVIEW-FINDINGS.md), but NOT compiled or deployed. Needs: WSL/CI toolchain build,
  fix H1 (permissionless stale-NAV withdrawal) + H2 (forced unwind), devnet deploy,
  `anchor keys sync`, integration tests, then the audit.
- 🔶 **Real execution** — trades currently settle against the demo ledger at live oracle
  prices. Needs: server builds Jupiter Router `/swap/v2/build` route → wraps in
  `execute_swap` → lands via Sender/Jito. The UI ticket is already shaped for it.
- 🔶 **Real deposits/withdrawals** — demo ledger today. Needs Privy signing (client SDK is
  wired, needs a real `VITE_PRIVY_APP_ID`) against the deployed program.
- ⬜ **NAV keeper service** — posts bounded NAV on-chain per the program's rules.
- ⬜ **Mirror engine** — the copytrader port: gRPC detection, local decoders, sizing,
  landing, reconciliation, public copy-lag metric. Biggest remaining service.

## Terminal parity (vs Axiom/Photon/GMGN token pages)

- ✅ Live candles (GeckoTerminal pools), live price, timeframe strip, buys/sells pressure,
  pool tape, presets P1-P3, gas receipt, pinned positions, sell-initials, subscript prices
- ✅ Token security: mint/freeze authority + largest accounts from mainnet RPC
- ⬜ Market-cap-denominated chart toggle (Price/MCap) — memecoin traders think in mcap
- ⬜ Chart trade markers (your fills as B/S bubbles, tracked-wallet markers)
- ⬜ Draggable limit-order lines on the chart
- ⬜ Top traders / holders tabs with wallet-type badges (sniper/insider/bundler/dev)
- ⬜ Bubble map holder-cluster view; bundle analysis (trench.bot-style two-number honesty:
  total bundled % vs still-held %)
- ⬜ Multi-leg exit strategy on the buy ticket (up to 5 TP/SL legs at entry)
- ⬜ Position-based (auto-rescaling) limit orders; OCO auto-cancel
- ⬜ Token tabs (browser-style chips of open tokens with live mcap)

## Discovery

- ✅ Pulse 3-column lifecycle board on real pump.fun bonding data + GT pools
- ⬜ Per-column filters (age, mcap, dev%, top10%, bundle%) + saved filter presets
- ⬜ Column sound alerts; dev-forensics badges (dev funded via, fresh-wallet buys)
- ⬜ Icon risk-glyph strip on cards (needs holder/sniper data per new token)

## Trust & social

- ✅ Trader profiles (on-chain record separated from paper record), wallet tracking with
  real mainnet scans, activity wire, PnL share cards, watchlist pill
- ⬜ X (Twitter) OAuth linking — currently display-only
- ⬜ PaperApe live import (API bridge from the Firestore data)
- ⬜ KOL claim flow for mirror vaults; scout rewards
- ⬜ Leaderboards page (traders, vaults, tracked wallets) — data exists, page missing
- ⬜ Tamper-evident record (hash-chained trade history à la paper.trade)

## Platform

- ⬜ Points/cashback ledger surfaces (fees are logged, UI missing)
- ⬜ Buyback-and-lock automation + public lock address page
- ⬜ Notifications (fills, TP/SL, vault events) beyond toasts — PWA push
- ⬜ Real auth end-to-end (Privy app id, session signers, key export UI)
- ⬜ Postgres migration + deploy story (Render/Vercel like PaperApe)
- ⬜ Legal: entity, ToS, geo-fencing before real depositors

## Known bugs / debt

- GT free-tier budgeter smooths 429s but a paid key (or Birdeye) is the real fix
- lightweight-charts region breaks the a11y tree on terminal (cosmetic, affects tooling)
- usePoll pauses in hidden tabs by design (refetches on visibility) — headless tooling
  that keeps the pane hidden sees stale lists; not a user-facing issue

Fixed by the 2026-08-20 QA sweep (kept for history): frozen sharePriceSol corrupting
all depositor math · equity curve counting flows as performance (now per-share value) ·
paper TVL leaking into /api/meta headline · 500s for malformed/oversized request bodies ·
untrimmed upstream symbols · mcap pair-selection poisoning (earlier) · same-second
equity-point constraint crashes (earlier)
