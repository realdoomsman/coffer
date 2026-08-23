# Going live

Status of every dependency between the app as it runs today and a real,
on-chain platform holding real SOL. Nothing here is guesswork — each item
says exactly what is done, what is missing, and who has to do it.

## Already done for you (no action needed)

| Piece | State |
| --- | --- |
| Rust toolchain | **installed** natively (rustup, stable 1.98) |
| Solana CLI + SBF compiler | **installed** natively (agave 4.2.1, platform-tools v1.54) — no WSL used |
| Devnet connectivity | **verified** (cluster reachable, live slot) |
| Program keypair | **generated**, gitignored — id in `programs/vault/PROGRAM_ID.txt` |
| Deployer keypair | **generated** at `~/.config/solana/id.json`, gitignored |
| Deploy script | `scripts/deploy-devnet.sh` — one command |
| Security blockers H1/H2 | **fixed in source** (see `programs/vault/REVIEW-FINDINGS.md`) |

## 1. Program — DEPLOYED TO MAINNET

Program id `8315nL9tGA3TdYC6jr2jRiB1ccDepRKdXpBVmNybtW2U`.
https://explorer.solana.com/address/8315nL9tGA3TdYC6jr2jRiB1ccDepRKdXpBVmNybtW2U

**The authoritative record — cluster, upgrade authority, PDAs, deploy
signatures and the sha256 of each deployed `.so` — is
[docs/DEPLOYMENTS.md](DEPLOYMENTS.md).** This section used to name devnet and
upgrade authority `7UxfASUx…`; both were wrong, and a record that is wrong
about the cluster and the key is worse than no record. Deploy facts live in
one file so there is one thing to keep true.

Built natively on Windows (no WSL — its virtualization gate never cleared):
MSVC Build Tools + Windows SDK, with `LIB` set to the MSVC and SDK lib
dirs. `scripts/wsl-build-deploy.sh` is kept only as the Linux/CI path.

### Historical: the WSL route that did not work

The vault program's dependencies (serde, zerocopy…) run build scripts that
must link a native Windows executable. That needs a host C linker, and this
machine has no Visual Studio and no Windows SDK. This is the only reason the
program is not deployed yet.

Run **one** of these in an **Administrator** terminal:

```powershell
wsl --install
```

(reboot when it asks, then tell me — I'll do the rest inside WSL), **or** install
"Visual Studio Build Tools" with the *Desktop development with C++* workload,
which provides `link.exe` and the Windows SDK.

Then deployment is:

```bash
bash scripts/deploy-devnet.sh
```

The deployer needs ~3-5 devnet SOL. `solana airdrop 5` is rate-limited most of
the time; https://faucet.solana.com is the reliable source.

## 2. Real accounts

- **Privy — DONE.** App "Coffer" (`cmt3yc8rl00j60cl7newtkhok`) is live in `.env`.
  Configured: allowed origins (`localhost:5173`, `coffer.fun`, `www.coffer.fun`),
  **email + Google login**, and **external wallets turned OFF** — this platform is
  account-creation, never wallet-connect. Verified end-to-end: the login modal
  opens on localhost with exactly those two methods.
  - Still yours: sign up once to create the first real user, and flip the app from
    DEVELOPMENT to production in the Privy dashboard when you launch (dev mode
    caps at 150 users).
- **Helius API key** (free tier is fine) → helius.dev, set `MAINNET_RPC_URL`.
  Unblocks full-depth wallet scans and the token top-10 holder read, which the
  public RPC rate-limits.
- **Domain** — `coffer.fun` is registered. Point it at the app when you deploy.

## 3. Before real money (not optional)

- **Audit.** The custody core has never been audited. The review in
  `programs/vault/REVIEW-FINDINGS.md` was a source review by an AI, not a
  substitute. Three surfaces need professional eyes: share mint/burn rounding,
  the NAV posting path, and `execute_swap`'s account constraints.
- **Legal.** Pooled third-party capital + a manager + performance fees is the
  shape of a collective investment scheme in most jurisdictions. Get counsel and
  geo-fence before taking outside deposits.
- **Postgres.** Dev runs SQLite. Switch `provider` in
  `apps/api/prisma/schema.prisma` to `postgresql`, set `DATABASE_URL`, run
  `prisma db push`. Nothing else changes.
- **Keeper funding.** The NAV keeper must hold SOL and run continuously; a dead
  keeper degrades withdrawals to the emergency path (by design, but it is a
  worse deal for depositors).

## Order of operations

1. `wsl --install` (or Build Tools) → tell me → I build, test and deploy to devnet
2. Privy App ID → real accounts and real deposits on devnet
3. Devnet soak: run real vaults with real trades until nothing surprises you
4. Audit + legal
5. Mainnet
