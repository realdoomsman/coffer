# Coffer

Trader vaults on Solana. Anyone can open a vault — even with zero SOL. Investors fund it,
the trader trades it through a scoped program instruction, and **the trader can never
withdraw**: custody lives in a program-owned PDA with no code path that moves funds to a
non-vault account. Profits split 70% depositors / 30% trader; the platform takes no cut.
A third of the trader's fee is routed to a platform-controlled escrow wallet and locked
for 60 days before they can claim it, so a trader who blows up or disappears cannot walk
away with their whole fee immediately.

> **On-chain status:** the deployed devnet program still implements the PREVIOUS split
> (trader's full `perf_fee_bps` on exit plus a separate 10% platform cut, no escrow). The
> 70/30 vesting economics are live on the paper ledger today; real vaults follow once the
> program is upgraded and redeployed.

Blueprint (decisions, research, roadmap): see the published artifact from the planning
session. Working codename "Coffer" — rename freely.

## Layout

| Path | What |
| --- | --- |
| `apps/web` | React (Vite) — investor side, trader side, terminal, wallet tracking |
| `apps/api` | Express + Prisma (SQLite dev / Postgres prod) + in-memory cache (Redis-ready) |
| `packages/shared` | Shared TypeScript types — the contract between everything |
| `programs/vault` | Anchor vault program (builds in WSL/CI — Rust not required on this machine) |

## Run it

```bash
npm install
npm run db:setup   # prisma generate + db push + seed demo data
npm run dev        # api :8787 + web :5173
```

Open http://localhost:5173. Without env config the app runs in **demo mode**: a fake
signed-in user, seeded vaults/trades, and live token prices from keyless API tiers.

## Environment

Copy `.env.example` → `.env`. Notable:

- `VITE_PRIVY_APP_ID` — accounts are Privy embedded wallets (email/Google → auto Solana
  wallet, exportable key). Absent → demo auth.
- `DATABASE_URL` — SQLite by default; switch `provider` in
  `apps/api/prisma/schema.prisma` to `postgresql` for prod.
- Mainnet execution stays gated behind `I_UNDERSTAND_LIVE_TRADING_RISKS=yes`. Devnet is
  the default everywhere.

## Production Deployment

### Railway Deployment

The project is configured for Railway deployment with automatic CI/CD:

1. **Railway Configuration**: `railway.json` contains health checks and deployment settings
2. **Environment Variables**: See `.env.production.example` for required variables
3. **Database Migration**: Run `bash scripts/migrate-production.sh` after deployment
4. **CI/CD Pipeline**: GitHub Actions in `.github/workflows/deploy.yml` handles:
   - Automated testing on push
   - API deployment to Railway (production branch)
   - Web deployment to Vercel with CloudFront cache invalidation

### Manual Deployment

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project (first time)
railway init

# Add PostgreSQL database
railway add postgresql

# Deploy API
cd apps/api
railway up

# Deploy web (Vercel)
cd apps/web
vercel --prod
```

### Environment Setup

Set these environment variables in Railway:

```bash
# Database (auto-created by Railway)
DATABASE_URL=postgresql://...

# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_CLUSTER=mainnet-beta
VAULT_PROGRAM_ID=8315nL9tGA3TdYC6jr2jRiB1ccDepRKdXpBVmNybtW2U
SERVER_KEYPAIR_BASE64=...

# Privy
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...

# External APIs
JUPITER_API_KEY=...
BIRDEYE_API_KEY=...
HELIUS_API_KEY=...
```

### Migration and Seeding

```bash
# Generate Prisma client
npx prisma generate

# Push schema to production
npx prisma db push --accept-data-loss

# Or run the migration script
bash scripts/migrate-production.sh
```

### Monitoring

- **Health Check**: `https://your-app.railway.app/api/health`
- **Logs**: Railway dashboard logs
- **Database**: Railway PostgreSQL dashboard

## Security & Audit

Security documentation and audit preparation materials are in `AUDIT_PREP.md`:
- Architecture overview
- Threat model
- Known issues
- Security checklist
- Deployment verification
- Vulnerability scan reports

## Status (P0)

- [x] Monorepo, shared types, dark terminal UI (explore / vault / portfolio / terminal /
      trader dashboard / tracking / token pages / create-vault)
- [x] API with demo ledger, seeded vaults, multi-tier price oracle
      (Jupiter Price v3 → Birdeye → DexScreener; never fabricates)
- [x] Anchor program source: shares w/ virtual-share protection, worse-of withdrawals,
      per-depositor HWM fees, NAV bounds + locked-profit drip, scoped `execute_swap`
- [ ] P1: devnet deploy, real deposits via Privy signing, terminal execution through
      Jupiter Router `/build` + `execute_swap`
- [ ] P2: trigger orders, profiles, leaderboards · P3: mirror engine + tracking pipeline
- [ ] Audit before mainnet: share math rounding, NAV bounds, execute_swap constraints
