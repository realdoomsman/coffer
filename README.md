<div align="center">

# Coffer

**Trader vaults on Solana.**
Deposit into a vault. The trader trades it — and cannot withdraw it.

[coffer.fun](https://coffer.fun) · [@CofferFun](https://x.com/CofferFun)

</div>

---

> **Status: devnet.** Real deposits work and the program is deployed and
> executing. Live trading, withdrawals and a professional audit are **not**
> done. Read [Where this actually is](#where-this-actually-is) before you
> read anything else. Nothing here is an invitation to send real money.

## The idea

Anyone can open a vault, even with zero SOL of their own. Investors deposit
into it. The trader trades the pooled capital and takes a cut of the profit.

The part that matters is what the trader *can't* do.

Custody lives in a program-owned PDA. The program exposes a scoped swap
instruction and a withdrawal path that pays **depositors**. There is no
instruction that moves funds from the vault to an arbitrary account — not for
the trader, and not for us. That isn't a policy or a promise anyone has to
trust. It's the absence of a function.

Everything else on the site follows from trying not to undermine that:

- **Accounts, not wallet-connect.** Sign up with email or Google and you get a
  self-custodial Solana wallet with exportable keys. The custody story falls
  apart the moment we hold your keys, so we don't.
- **Paper trading is walled off.** The sandbox runs the full engine at live
  prices, but its fills are ledger entries that never touch a real track
  record, and no real vault ever routes through the simulator. A track record
  you can fake isn't a track record.
- **Sources are named.** Every price and chart says where it came from and how
  often it refreshes. When an upstream fails you get a stale marker, never a
  fabricated number.

## Economics

70% of profit stays with depositors. 30% goes to the trader. **The platform
takes no cut of profit.**

A third of the trader's fee is routed to escrow and unlocks after 60 days, so
a trader who blows up a vault in week two can't walk away with the whole fee
on day one.

Fees are charged **per depositor**, above that depositor's own high-water
mark, and only on realised profit — so a vault that drops and recovers costs
you nothing on the recovery, and you never pay twice for the same gain.

> These are the terms the paper ledger enforces today. The deployed devnet
> program still implements an older split; real vaults follow once it is
> upgraded and redeployed. See [BACKLOG.md](BACKLOG.md).

## Where this actually is

| | |
|---|---|
| Vault program | **Deployed to devnet and executing** — `8315nL9tGA3TdYC6jr2jRiB1ccDepRKdXpBVmNybtW2U` |
| Deposits | **Real**, signed by the depositor via their embedded wallet |
| Charts, discovery, paper terminal | **Live** |
| Live trading | Not built |
| Withdrawals | Still walled |
| Professional audit | **Not done.** Before mainnet, not after |
| Mainnet | No |

Building in public means publishing the second half of that table too.

## Charts

pump.fun serves sub-minute candles natively, so the terminal offers
**1s / 15s / 30s / 1m / 5m / 15m / 1h**, in USD, SOL or market cap.

One-second bars are **trade-time, not clock-time**: a bar exists only for a
second that actually traded. Forward-filling flat bars would look tidier and
would fabricate the large majority of the chart on a quiet token, so the gaps
are left in. Measured on an active token, roughly 92% of seconds carry a bar
and the feed runs 2–7s behind live.

Honest limit: our floor is an HTTP poll, so call it **sub-4-second**, not
real-time. Terminals with co-located validators and a geyser stream are
faster, and that gap is transport, not tuning.

## Layout

| Path | What |
|---|---|
| `apps/web` | React + Vite — investor side, trader side, terminal, discovery |
| `apps/api` | Express + Prisma (SQLite dev / Postgres prod) |
| `packages/shared` | Shared TypeScript types — the contract between the two |
| `programs/vault` | The Anchor program that holds custody |

## Run it

```bash
npm install
npm run db:setup   # prisma generate + db push + seed
npm run dev        # api :8787 + web :5173
```

Without env config it runs in demo mode: a seeded local dataset with live
token prices from keyless API tiers. Copy `.env.example` → `.env` to point it
at your own Privy app, database and RPC. Mainnet execution stays gated behind
an explicit opt-in flag; devnet is the default everywhere.

## Security

Please read [SECURITY.md](SECURITY.md) before reporting anything. Short
version: the program has **not** been professionally audited, we know it, and
that is the gate on mainnet.

## Licence

MIT — see [LICENSE](LICENSE).
