# Coffer — the honest gap list

What "crazy good and everything works" actually requires, measured against Axiom / GMGN /
Photon / Padre feature-for-feature. Ordered by what moves trust and money first. ✅ = done,
🔶 = partial/demo-grade, ⬜ = not started.

## The core (nothing else matters if this isn't real)
- ✅ **On-chain vault program** — written, adversarially reviewed, H1/H2 liveness blockers
  fixed, compiled natively (MSVC, not WSL), **deployed to devnet**
  `8315nL9tGA3TdYC6jr2jRiB1ccDepRKdXpBVmNybtW2U`, and **proven executing**: init_platform
  ran on-chain and its state decodes exactly as the source describes. Still needs a
  professional audit before mainnet.
- ⬜ **Real deposits/withdrawals** — THE next milestone. Privy is live and the program is
  live; what's missing is the client half: build init_vault / init_depositor / deposit
  instructions (no IDL — see scripts/onchain-smoke.mjs for the hand-rolled pattern) and
  sign them as the user via Privy session signers.
- ⬜ **Real execution (trading)** — server builds a Jupiter Router `/swap/v2/build` route,
  wraps it in `execute_swap`, lands it. The UI ticket and the program instruction both
  already exist; nothing connects them yet.
- ⬜ **NAV keeper service** — posts bounded NAV on-chain per the program's rules. Until it
  runs, share price on real vaults can't move and withdrawals fall to the emergency path.
- ✅ **Mirror engine (paper)** — copies a real mainnet leader's trades: balance-diff
  detection, attach-forward, proportional sells, published copy-lag. Runs live.

## Terminal parity (vs Axiom/Photon/GMGN token pages)

- ✅ **1s / 15s / 30s candles** — pump.fun serves sub-minute natively. Bars are
  trade-time (one per second that traded), delta-polled via `?since=`, and the
  chart refuses to synthesize a bar below a 1m width
- ✅ **USD / SOL chart denomination** — the vault books PnL in SOL, so a USD
  chart moves when SOL moves. MCap mode is USD-only (supply x SOL price is not
  a market cap) and the avg-entry line re-quotes per denomination
- ✅ Live candles (GeckoTerminal pools), live price, timeframe strip, buys/sells pressure,
  pool tape, presets P1-P3, gas receipt, pinned positions, sell-initials, subscript prices
- ✅ Token security: mint/freeze authority + largest accounts from mainnet RPC
- ✅ Market-cap-denominated chart toggle (Price/MCap), driven by real on-chain supply
- ✅ Chart trade markers (your fills as B/S bubbles; same-second fills merge)
- ⬜ Draggable limit-order lines on the chart
- ⬜ Top traders / holders tabs with wallet-type badges (sniper/insider/bundler/dev)
- ⬜ Bubble map holder-cluster view; bundle analysis (trench.bot-style two-number honesty:
  total bundled % vs still-held %)
- ⬜ Multi-leg exit strategy on the buy ticket (up to 5 TP/SL legs at entry)
- ✅ Position-based (auto-rescaling) limit orders — a sell order stores a
  FRACTION and resolves it against the live position at fire time
  (trading.ts: `tokenAmount = existing.amountTokens * fraction`), so topping
  up or partially exiting rescales the order automatically. GMGN sells this
  as "Holdings Percentage Limit Orders". Previously listed here as missing.
- ⬜ OCO auto-cancel; multi-leg TP/SL ladder at entry; trailing stop
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
- ~~Buyback-and-lock automation + public lock address page~~ — **dropped.** The 10% platform
  cut that funded it no longer exists; those points are now the trader's 60-day vested fee.
- ⬜ Fee escrow on-chain: move the vested third to FEE_ESCROW_WALLET for real (devnet ledger
  entries are bookkeeping today), and back a claim with an actual transfer signature
- ⬜ Program upgrade for the new split — see README; the deployed bytecode still charges the
  old trader fee + 10% platform cut with no vesting
- ⬜ Notifications (fills, TP/SL, vault events) beyond toasts — PWA push
- ⬜ Real auth end-to-end (Privy app id, session signers, key export UI)
- ⬜ Postgres migration + deploy story (Render/Vercel like PaperApe)
- ⬜ Legal: entity, ToS, geo-fencing before real depositors

## Competitor teardown (2026-08-22: Axiom, GMGN, Padre, Bloom)

Shipped from it:
- ✅ **Layered chart overlays** (Axiom "Display Options") — my fills / tracked
  wallets / whale prints toggleable, plus a dashed average-entry line labelled
  with live PnL. All layers merge into one strictly-ordered marker series.
- ✅ **Tabbed trade feed** (All / Tracked / You) beside the chart
- ✅ **Token facts panel** — liquidity, mcap, supply, period high, 24h buy/sell
  split, mint + freeze authority, top-10 concentration
- ✅ **On-chain checks popover** on discovery cards, loaded on inspect
- ✅ **Daily realized-pnl calendar** (Bloom) on the vault page

Wanted but blocked on an indexer we don't have. All four run private
indexers; we have Helius RPC + pump.fun + GeckoTerminal, which is fine for
ONE token on demand and far too expensive for 70+ cards every 10s:
- ⬜ Per-card sparkline — needs a candle series per card per refresh
- ⬜ Holders count / "pro traders" count per card
- ⬜ **Sniper / insider / bundler classification** — the real moat. Needs
  tx-level bundle analysis and wallet funding graphs, not just balances.
- ⬜ Dev history ("Dev Tokens (3689)") + dev wallet age/balance hovercard
- ⬜ Reused-token-image detection (Axiom flags duplicate artwork — cheap and
  genuinely good; needs an image hash index)
- ⬜ DexScreener-paid badge per card
- ⬜ X/Twitter mention feed wired into discovery (GMGN's X Tracker)
- ⬜ Strategy automation taxonomy (Bloom: Spot / Copy Trade / AFK / Twitter) —
  we have Copy Trade as mirror vaults; AFK and Twitter triggers are open
- ⬜ Multi-leg TP/SL at entry; draggable limit lines on the chart

## Honest limits of the 1s chart

Measured, not guessed — keep these in product copy:
- **Sub-4-second, not real-time.** Our floor is client poll + server TTL + two
  HTTP round trips: swap-api RTT 270-680ms, upstream candles trail the trade
  feed by 1-3s, client polls at 1.2s. Axiom/Photon/GMGN run co-located
  validators on Yellowstone geyser near Solana's ~400ms slot boundary. The gap
  is transport, not tuning. Closing it means a WebSocket price feed (Helius
  `accountSubscribe` at commitment=processed, bonding-curve account decoding)
  — a separate project.
- **Bars are trade-time, not clock-time.** On our own default token only ~6% of
  seconds have a 1s bar; two adjacent bars can be minutes apart. Forward-filling
  flat bars would fabricate prints for ~94% of the chart, so we don't.
- **Sub-minute has no fallback.** GeckoTerminal's floor is 1 minute. If pump.fun
  fails, a 1s chart shows the stale pill rather than silently serving 1m bars.
- **No forward pagination upstream.** Six param names tested, all ignored — every
  refresh re-reads a window. `?since=` moves that cost server-side only.
- **The header mark can disagree with the chart** (chart ~2s old, mark up to ~8s).
  Invisible at 5m, visible at 1s.

## Known bugs / debt

- **`apps/api` has 68 type errors** and `npm run build -w apps/api` is `tsc`,
  so the API half of the build is red. Pre-existing, from the "production
  fixes / monitoring" sessions. 39 are in live files (productionFixes 12,
  monitoring 9, xOAuth 7, logging 4, errorHandler 4, validation 3); 29 are in
  four orphans with zero references (vaultService 21, queryOptimization 4,
  errorTracker 3, queriesOptimized 1) which can simply be deleted. Railway's
  build currently succeeds and the healthcheck passes, so production is fine
  today — but the local build cannot verify anything until this is cleared.
  Web was the same story and is now at 0.
- **Never trust `cd X && npx tsc` in a persistent shell.** The Bash tool keeps
  its cwd between calls; once already in the target dir the `cd` fails, `&&`
  short-circuits, and a trailing `; echo "clean"` prints anyway. Use
  `npx tsc --noEmit --project apps/web/tsconfig.json` from a known root.

- GT free-tier budgeter smooths 429s but a paid key (or Birdeye) is the real fix
- lightweight-charts region breaks the a11y tree on terminal (cosmetic, affects tooling)
- usePoll pauses in hidden tabs by design (refetches on visibility) — headless tooling
  that keeps the pane hidden sees stale lists; not a user-facing issue

Fixed by the 2026-08-20 QA sweep (kept for history): frozen sharePriceSol corrupting
all depositor math · equity curve counting flows as performance (now per-share value) ·
paper TVL leaking into /api/meta headline · 500s for malformed/oversized request bodies ·
untrimmed upstream symbols · mcap pair-selection poisoning (earlier) · same-second
equity-point constraint crashes (earlier)
