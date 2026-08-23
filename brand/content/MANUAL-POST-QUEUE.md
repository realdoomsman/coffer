# Coffer X queue — every claim verified against the codebase

Replaces the previous queue, which was withdrawn. It claimed "Real SOL, real
execution, via Jupiter Router" (unbuilt — BACKLOG.md:17), sourced the 1s charts
to Birdeye (they are pump.fun), and carried a fabricated Birdeye testimonial.
Coffer takes deposits; publishing an untrue capability claim about a financial
product is not a copy mistake.

## The fact base — check any post against this before it goes out

TRUE, verified:
- 1s / 15s / 30s candles, native from pump.fun swap-api. Live on coffer.fun.
- Chart denominations: price/mcap and USD/SOL.
- Vault program deployed to devnet `8315nL9tGA3TdYC6jr2jRiB1ccDepRKdXpBVmNybtW2U`,
  executable, and proven executing on-chain.
- Deposits into a real vault are signed by the depositor via a Privy embedded
  wallet. Real devnet transactions have landed.
- Custody is a program-owned PDA. No code path moves funds to a non-vault
  account — that is the product.
- Accounts are email/Google; no wallet-connect required.
- Paper terminal runs the full engine at live prices, walled off from real
  track records.
- Pulse discovery board on real pump.fun bonding data.
- Site live at coffer.fun.

TERMS (true as the deal, not as deployed bytecode — phrase as terms, never as
"executing on-chain right now"):
- 70% of profit to depositors, 30% to the trader; a third of the trader's cut
  is escrowed 60 days. Live on the paper ledger. The deployed devnet program
  still runs the older split until it is upgraded.

DO NOT CLAIM:
- Real execution / live trading / Jupiter routing — not built.
- Mainnet — devnet only.
- Real withdrawals — still walled.
- Birdeye as a data source — not used.
- Audited — not audited.
- Any user numbers, TVL, testimonials, or partnerships.

## Post 1 — what it is  [IMAGE: banner or 1s chart screenshot]

Anyone can open a vault on Coffer. Investors deposit into it. The trader trades
it — and cannot withdraw it.

Custody is a program-owned PDA. There is no code path that moves funds to a
non-vault account. Not a promise. The absence of a function.

coffer.fun

## Post 2 — 1s charts  [IMAGE: 1s chart screenshot]

Shipped 1-second candles.

pump.fun serves sub-minute natively — we were one parameter away and didn't
know it. Its own error message lists the set: 1s, 15s, 30s, 1m, 5m...

Measured on an active token: ~92% of seconds have a bar, 2-7s behind live.

## Post 3 — the honest part of the 1s chart

A 1s bar only exists for a second that actually traded.

We could forward-fill flat bars to make the axis pretty. On our own default
token that would mean fabricating ~94% of the chart.

So there are gaps. The gaps are the truth.

## Post 4 — no wallet connect

No wallet-connect. Sign up with email or Google and you get a real Solana
wallet, keys exportable, held by you.

The custody story doesn't work if we hold your keys. So we don't.

## Post 5 — the fee deal

70% of profit to depositors. 30% to the trader.

A third of the trader's cut is escrowed for 60 days before they can claim it.
A trader who blows up or vanishes doesn't walk with the whole fee on day one.

Platform takes no cut of profit.

## Post 6 — paper is separate  [IMAGE: paper terminal screenshot]

Paper trading is a sandbox and it's labelled as one everywhere.

Fills are ledger entries at live market prices. They never touch a real track
record, and no real vault ever routes through the simulator.

A track record you can fake isn't a track record.

## Post 7 — status, stated plainly

Where Coffer actually is:

- vault program: deployed to devnet, executing
- deposits: real, depositor-signed, devnet
- charts, discovery, paper terminal: live
- live trading + withdrawals: not yet
- audit: not yet. Before mainnet, not after

Building in public means saying the second half too.

## Reply policy

Draft only. No unprompted replies to strangers, no reply automation — that is
what X's platform-manipulation rules target and the account carries the risk.
Reply where Dooms asks, in specific conversations.
