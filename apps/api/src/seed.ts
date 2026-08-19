// ── demo seed ──────────────────────────────────────────────────────
// Idempotent: wipes and recreates all demo data (safe to re-run any
// time). Uses a fixed RNG seed so every run produces the same world.
// Run: npm run db:seed  (after db:push)

import "./env.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── deterministic RNG ──────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0xc0ffe4);
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function randBase58(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += BASE58[Math.floor(rng() * BASE58.length)]!;
  return out;
}

/** rough normal(0,1) via sum of uniforms */
function gauss(): number {
  return rng() + rng() + rng() + rng() + rng() + rng() - 3;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

// ── token catalog ──────────────────────────────────────────────────
// Real, well-known mints (oracle will price these live) plus two
// invented memecoins the oracle will report as source:"none".

interface TokenDef {
  mint: string;
  symbol: string;
  name: string;
  priceSol: number; // plausible seed mark, SOL per token
  invented?: boolean;
}

const TOKENS: TokenDef[] = [
  { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", symbol: "BONK", name: "Bonk", priceSol: 1.1e-7 },
  { mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", symbol: "WIF", name: "dogwifhat", priceSol: 4.2e-3 },
  { mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", symbol: "POPCAT", name: "Popcat", priceSol: 1.8e-3 },
  { mint: "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn", symbol: "PUMP", name: "Pump", priceSol: 2.6e-5 },
  { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", symbol: "JUP", name: "Jupiter", priceSol: 2.4e-3 },
  { mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", symbol: "RAY", name: "Raydium", priceSol: 1.3e-2 },
  { mint: "GoonERd3mZqK7vXpWyTbNcFhJaUsRe2Mk9LDfB4gVwn6", symbol: "GOONER", name: "Goonpocalypse", priceSol: 3e-8, invented: true },
  { mint: "SnaiLtrKm8xQwZyVu5cThE3fRbG7jN2aUeMD4kHsPv9B", symbol: "SNAIL", name: "Snailposting", priceSol: 8e-7, invented: true },
];

// ── traders ────────────────────────────────────────────────────────

const TRADERS = [
  {
    handle: "wagyu",
    displayName: "Wagyu",
    xHandle: "wagyucapital",
    bio: "Size is the thesis. A5 entries only.",
  },
  {
    handle: "0xNarrative",
    displayName: "0xNarrative",
    xHandle: "0xNarrative",
    bio: "Rotating before the rotation exists. Meta-chaser, unapologetic.",
  },
  {
    handle: "slotmachine",
    displayName: "slotmachine",
    xHandle: null,
    bio: "Mirror operator. I don't trade — I select who trades.",
  },
  {
    handle: "kimchi_premium",
    displayName: "Kimchi Premium",
    xHandle: "kimchipremium",
    bio: "Seoul session scalper. The overnight candle pays my rent.",
  },
  {
    handle: "blocksmith",
    displayName: "blocksmith",
    xHandle: null,
    bio: "Ex-validator ops. Slow hands, deep liquidity, no leverage.",
  },
  {
    handle: "exit_liquidity",
    displayName: "exit liquidity",
    xHandle: "exit_liq",
    bio: "I am the exit liquidity (it's a strategy, trust the process).",
  },
] as const;

// leader wallets for mirror vaults + tracked-wallet list
const LEADER_WALLET_A = randBase58(44);
const LEADER_WALLET_B = randBase58(44);
const LEADER_WALLET_C = randBase58(44);

// ── vault definitions ──────────────────────────────────────────────

interface VaultDef {
  key: string;
  name: string;
  type: "managed" | "mirror";
  trader: string; // handle
  tvlSol: number;
  pnlAllPct: number; // curve endpoint target
  perfFeeBps: number;
  managerStakePct: number; // of TVL
  redeemWindowHours: number;
  bufferPct: number; // of TVL held as instant-withdraw SOL
  vol: number; // hourly log-vol of the equity curve
  winProb: number; // probability a seeded round-trip closes green
  blowupAt?: number; // fraction of the curve where a big drop lands
  leaderWallet?: string;
  thesis: string;
}

const VAULTS: VaultDef[] = [
  {
    key: "wagyu-prime", name: "Wagyu Prime", type: "managed", trader: "wagyu",
    tvlSol: 2600, pnlAllPct: 240, perfFeeBps: 2000, managerStakePct: 8,
    redeemWindowHours: 48, bufferPct: 4, vol: 0.022, winProb: 0.62,
    thesis: "Concentrated majors-of-the-trenches book. 3–5 names, no dust. Cut fast, press winners.",
  },
  {
    key: "narrative-rotation", name: "Narrative Rotation", type: "managed", trader: "0xNarrative",
    tvlSol: 840, pnlAllPct: 38, perfFeeBps: 2500, managerStakePct: 5,
    redeemWindowHours: 24, bufferPct: 6, vol: 0.028, winProb: 0.55,
    thesis: "Ride each meta for 48–96h, exit into strength, sit in SOL between rotations.",
  },
  {
    key: "degen-dumpster", name: "Degen Dumpster", type: "managed", trader: "exit_liquidity",
    tvlSol: 40, pnlAllPct: -62, perfFeeBps: 3000, managerStakePct: 15,
    redeemWindowHours: 12, bufferPct: 8, vol: 0.038, winProb: 0.36, blowupAt: 0.8,
    thesis: "Max-degen microcaps. This vault WILL drawdown 50%+. Size accordingly.",
  },
  {
    key: "kimchi-overnight", name: "Kimchi Overnight", type: "managed", trader: "kimchi_premium",
    tvlSol: 310, pnlAllPct: 12, perfFeeBps: 1500, managerStakePct: 6,
    redeemWindowHours: 24, bufferPct: 7, vol: 0.008, winProb: 0.54,
    thesis: "Asia-session mean reversion on liquid memes. Small edges, many at-bats.",
  },
  {
    key: "blocksmith-core", name: "Blocksmith Core", type: "managed", trader: "blocksmith",
    tvlSol: 620, pnlAllPct: 55, perfFeeBps: 1000, managerStakePct: 12,
    redeemWindowHours: 72, bufferPct: 3, vol: 0.011, winProb: 0.66,
    thesis: "Boring on purpose: JUP/RAY/BONK core with opportunistic adds on capitulation wicks.",
  },
  {
    key: "mirror-cupseyy", name: "Mirror: cupseyy", type: "mirror", trader: "slotmachine",
    tvlSol: 1450, pnlAllPct: 85, perfFeeBps: 2000, managerStakePct: 3,
    redeemWindowHours: 24, bufferPct: 5, vol: 0.02, winProb: 0.58, leaderWallet: LEADER_WALLET_A,
    thesis: "Copies cupseyy's wallet slot-for-slot. Proportional sizing, 35% per-position cap.",
  },
  {
    key: "mirror-waddles", name: "Mirror: waddles", type: "mirror", trader: "slotmachine",
    tvlSol: 520, pnlAllPct: 21, perfFeeBps: 1500, managerStakePct: 4,
    redeemWindowHours: 24, bufferPct: 6, vol: 0.015, winProb: 0.52, leaderWallet: LEADER_WALLET_B,
    thesis: "Mirrors waddles with a 2-slot delay tolerance. Skips buys past 20% price impact.",
  },
  {
    key: "mirror-orangecat", name: "Mirror: orange cat", type: "mirror", trader: "blocksmith",
    tvlSol: 95, pnlAllPct: -18, perfFeeBps: 1000, managerStakePct: 10,
    redeemWindowHours: 12, bufferPct: 8, vol: 0.026, winProb: 0.44, leaderWallet: LEADER_WALLET_C,
    thesis: "Experimental mirror of an anon cat-poster. High variance, tiny cap while we evaluate.",
  },
];

// ── equity-curve generator ─────────────────────────────────────────
// Detrended random walk pinned to exact start/end values, with flat
// stretches (low-activity days) and occasional shock candles. The
// blowup vault takes one −45% candle partway through.

function equityCurve(def: VaultDef, startTs: number, hours: number): { t: number; v: number }[] {
  const endV = def.tvlSol;
  const startV = endV / (1 + def.pnlAllPct / 100);
  const n = hours;

  // raw noise with regime changes
  const noise: number[] = [0];
  let regime = 1;
  let postBlowup = false;
  for (let i = 1; i <= n; i++) {
    if (rng() < 0.01) regime = pick([0.15, 0.4, 1, 1, 1.8]); // flat stretches & hot streaks
    let r = gauss() * def.vol * regime;
    if (rng() < 0.004) r += (rng() < 0.45 ? 1 : -1) * (0.05 + rng() * 0.12); // shock candles
    if (postBlowup) r *= 0.2; // dead-cat drift after the rug, not a v-shape
    if (def.blowupAt !== undefined && i === Math.floor(n * def.blowupAt)) {
      r = Math.log(0.55); // −45% candle
      postBlowup = true;
    }
    noise.push(noise[i - 1]! + r);
  }

  // pin endpoints: subtract linear trend of the noise, add target drift
  const drift = Math.log(endV / startV);
  const endNoise = noise[n]!;
  const points: { t: number; v: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const frac = i / n;
    const detrended = noise[i]! - endNoise * frac;
    const v = startV * Math.exp(drift * frac + detrended);
    const jitter = Math.floor(rng() * 480 - 240); // hourly-ish spacing
    points.push({ t: startTs + i * 3600 + (i === n ? 0 : jitter), v: Math.max(0.5, v) });
  }
  const lastPoint = points[n]!;
  lastPoint.v = endV; // exact current TVL
  return points;
}

// ── trade generator ────────────────────────────────────────────────
// Round-trip based: every sell follows an earlier buy of the same
// token, sized against it, with the outcome drawn from the vault's
// winProb — so paired win rates come out coherent per vault instead
// of random-walk noise. Some buys stay open (they're the positions).

interface TradeRow {
  ts: number; side: string; mint: string; symbol: string;
  solAmount: number; tokenAmount: number; priceSol: number;
  txSig: string; source: string; copyLagSlots: number | null;
}

function tradesFor(def: VaultDef, vaultMints: TokenDef[]): TradeRow[] {
  const rows: TradeRow[] = [];
  const lag = () => (def.type === "mirror" ? pick([0, 1, 1, 1, 2, 2, 2, 3]) : null);
  const roundTrips = 26 + Math.floor(rng() * 8); // → ~55–65 rows incl. open buys
  for (let i = 0; i < roundTrips; i++) {
    const token = pick(vaultMints);
    const buyTs = NOW - Math.floor((0.2 + rng() * 29.5) * DAY);
    const buyPrice = token.priceSol * (0.7 + rng() * 0.65); // price wandered over the month
    const buySol = +(def.tvlSol * (0.002 + rng() * 0.028)).toFixed(4); // 0.2–3% of TVL
    const tokenAmount = +(buySol / buyPrice).toFixed(2);
    rows.push({
      ts: buyTs, side: "buy",
      mint: token.mint, symbol: token.symbol,
      solAmount: buySol, tokenAmount,
      priceSol: buySol / tokenAmount,
      txSig: randBase58(88), source: def.type, copyLagSlots: lag(),
    });
    // hold 30min–3d; if that runs past "now" the position is still open
    const sellTs = buyTs + Math.floor((0.02 + rng() * 3) * DAY);
    if (sellTs >= NOW - 600) continue;
    const win = rng() < def.winProb;
    const sellPrice =
      (buySol / tokenAmount) * (win ? 1.04 + rng() * 0.85 : 0.5 + rng() * 0.44);
    const sellFrac = 0.45 + rng() * 0.55;
    const sellTokens = +(tokenAmount * sellFrac).toFixed(2);
    rows.push({
      ts: sellTs, side: "sell",
      mint: token.mint, symbol: token.symbol,
      solAmount: +(sellTokens * sellPrice).toFixed(4), tokenAmount: sellTokens,
      priceSol: sellPrice,
      txSig: randBase58(88), source: def.type, copyLagSlots: lag(),
    });
  }
  rows.sort((a, b) => a.ts - b.ts);
  return rows;
}

// ── main ───────────────────────────────────────────────────────────

async function main() {
  console.log("[seed] wiping existing data…");
  // FK-safe order (children first)
  await prisma.trackedWallet.deleteMany();
  await prisma.withdrawRequest.deleteMany();
  await prisma.deposit.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.position.deleteMany();
  await prisma.equityPoint.deleteMany();
  await prisma.vault.deleteMany();
  await prisma.user.deleteMany();

  // traders
  console.log("[seed] creating traders…");
  const users = new Map<string, string>(); // handle → id
  for (const t of TRADERS) {
    const u = await prisma.user.create({
      data: {
        handle: t.handle,
        displayName: t.displayName,
        xHandle: t.xHandle,
        bio: t.bio,
        avatarUrl: `https://api.dicebear.com/9.x/identicon/svg?seed=${t.handle}`,
        createdAt: new Date((NOW - 120 * DAY) * 1000),
      },
    });
    users.set(t.handle, u.id);
  }

  // demo user + a pool of anonymous depositors
  const demo = await prisma.user.create({
    data: {
      handle: "you",
      displayName: "You (demo)",
      bio: "Local demo account. Deposits and withdrawals here are ledger entries, not transactions.",
      avatarUrl: "https://api.dicebear.com/9.x/identicon/svg?seed=you",
    },
  });
  const depositorIds: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const u = await prisma.user.create({
      data: {
        handle: `anon_${i}`,
        displayName: `anon ${i}`,
        avatarUrl: `https://api.dicebear.com/9.x/identicon/svg?seed=anon${i}`,
      },
    });
    depositorIds.push(u.id);
  }

  // vaults
  console.log("[seed] creating vaults + curves + trades…");
  const vaultIds = new Map<string, string>(); // key → id
  const startTs = NOW - 90 * DAY;

  for (const def of VAULTS) {
    const sharePriceSol = +(1 + def.pnlAllPct / 100).toFixed(6);
    const totalShares = +(def.tvlSol / sharePriceSol).toFixed(4);
    const managerStakeSol = +((def.tvlSol * def.managerStakePct) / 100).toFixed(2);
    const vault = await prisma.vault.create({
      data: {
        name: def.name,
        type: def.type,
        status: "active",
        traderId: users.get(def.trader)!,
        leaderWallet: def.leaderWallet ?? null,
        createdAt: new Date(startTs * 1000),
        tvlSol: def.tvlSol,
        sharePriceSol,
        totalShares,
        managerStakeSol,
        perfFeeBps: def.perfFeeBps,
        redeemWindowHours: def.redeemWindowHours,
        solBufferSol: +((def.tvlSol * def.bufferPct) / 100).toFixed(2),
        thesis: def.thesis,
      },
    });
    vaultIds.set(def.key, vault.id);

    // 90 days of hourly-ish equity
    const curve = equityCurve(def, startTs, 90 * 24);
    await prisma.equityPoint.createMany({
      data: curve.map((p) => ({ vaultId: vault.id, t: p.t, v: +p.v.toFixed(3) })),
    });

    // positions: 4–8 open, mix of real + (sometimes) invented mints
    const shuffled = [...TOKENS].sort(() => rng() - 0.5);
    const posCount = 4 + Math.floor(rng() * 5);
    const posTokens = shuffled.slice(0, posCount);
    const investable = def.tvlSol * (1 - def.bufferPct / 100);
    await prisma.position.createMany({
      data: posTokens.map((token, i) => {
        const costSol = +((investable / posCount) * (0.5 + rng())).toFixed(3);
        // winners run, losers get held too long — classic
        const mult = rng() < 0.55 ? 0.55 + rng() * 0.5 : 1.05 + rng() * 1.6;
        const valueSol = +(costSol * mult).toFixed(3);
        const priceSol = token.priceSol * (0.8 + rng() * 0.4);
        return {
          vaultId: vault.id,
          mint: token.mint,
          symbol: token.symbol,
          name: token.name,
          amountTokens: +(valueSol / priceSol).toFixed(2),
          costSol,
          valueSol,
          markStale: Boolean(token.invented), // oracle can't mark invented mints
          updatedAt: new Date((NOW - (token.invented ? 3600 * 6 : 60 * (i + 2))) * 1000),
        };
      }),
    });

    // ~60 trades over the last 30 days
    await prisma.trade.createMany({ data: tradesFor(def, posTokens).map((t) => ({ ...t, vaultId: vault.id })) });

    // anonymous depositors (3–9 per vault)
    const dep = 3 + Math.floor(rng() * 7);
    const picked = [...depositorIds].sort(() => rng() - 0.5).slice(0, dep);
    for (const userId of picked) {
      const costSol = +(def.tvlSol * (0.01 + rng() * 0.06)).toFixed(3);
      const entryPrice = sharePriceSol * (0.55 + rng() * 0.5); // entered some time ago
      await prisma.deposit.create({
        data: {
          vaultId: vault.id,
          userId,
          shares: +(costSol / entryPrice).toFixed(4),
          costSol,
          createdAt: new Date((NOW - Math.floor(rng() * 80 * DAY)) * 1000),
        },
      });
    }
  }

  // demo user positions: deposits into 3 vaults + one pending withdrawal
  console.log("[seed] creating demo-user portfolio…");
  const demoDeposits: Array<[string, number, number]> = [
    // [vault key, costSol, entry share price as fraction of current]
    ["wagyu-prime", 25, 0.52],
    ["blocksmith-core", 10, 0.78],
    ["mirror-cupseyy", 40, 0.9],
  ];
  for (const [key, costSol, entryFrac] of demoDeposits) {
    const vault = await prisma.vault.findUniqueOrThrow({ where: { id: vaultIds.get(key)! } });
    await prisma.deposit.create({
      data: {
        vaultId: vault.id,
        userId: demo.id,
        shares: +(costSol / (vault.sharePriceSol * entryFrac)).toFixed(4),
        costSol,
        createdAt: new Date((NOW - Math.floor((20 + rng() * 40) * DAY)) * 1000),
      },
    });
  }
  {
    const vault = await prisma.vault.findUniqueOrThrow({
      where: { id: vaultIds.get("mirror-cupseyy")! },
    });
    const shares = 8;
    await prisma.withdrawRequest.create({
      data: {
        vaultId: vault.id,
        userId: demo.id,
        shares,
        valueAtRequestSol: +(shares * vault.sharePriceSol).toFixed(4),
        requestedAt: NOW - 3 * 3600,
        executableAt: NOW - 3 * 3600 + vault.redeemWindowHours * 3600,
        status: "pending",
      },
    });
  }

  // tracked wallets (2 lead mirror vaults on the platform)
  console.log("[seed] creating tracked wallets…");
  const tracked = [
    { address: LEADER_WALLET_A, label: "cupseyy", winRatePct: 61.4, pnlSol: 2140.5, trades: 412, profitFactor: 2.3, vaultKey: "mirror-cupseyy" },
    { address: LEADER_WALLET_B, label: "waddles", winRatePct: 54.2, pnlSol: 655.1, trades: 288, profitFactor: 1.6, vaultKey: "mirror-waddles" },
    { address: randBase58(44), label: "insider fren", winRatePct: 71.8, pnlSol: 380.9, trades: 64, profitFactor: 3.1, vaultKey: null },
    { address: randBase58(44), label: "reverse indicator", winRatePct: 31.5, pnlSol: -122.4, trades: 501, profitFactor: 0.6, vaultKey: null },
    { address: randBase58(44), label: null, winRatePct: 49.7, pnlSol: 88.2, trades: 173, profitFactor: 1.2, vaultKey: null },
  ];
  for (const w of tracked) {
    await prisma.trackedWallet.create({
      data: {
        userId: demo.id,
        address: w.address,
        label: w.label,
        winRatePct: w.winRatePct,
        pnlSol: w.pnlSol,
        trades: w.trades,
        profitFactor: w.profitFactor,
        lastActiveAt: NOW - Math.floor(rng() * 2 * DAY),
        isVaultLeader: w.vaultKey !== null,
        vaultId: w.vaultKey ? vaultIds.get(w.vaultKey)! : null,
      },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    vaults: await prisma.vault.count(),
    equityPoints: await prisma.equityPoint.count(),
    positions: await prisma.position.count(),
    trades: await prisma.trade.count(),
    deposits: await prisma.deposit.count(),
    withdrawRequests: await prisma.withdrawRequest.count(),
    trackedWallets: await prisma.trackedWallet.count(),
  };
  console.log("[seed] done:", counts);
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
