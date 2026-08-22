// ── Database Query Optimizations ─────────────────────────────────
import { Prisma } from '@prisma/client';

// Optimized vault queries with minimal fields
export const vaultSelectMinimal = {
  id: true,
  name: true,
  type: true,
  mode: true,
  status: true,
  tvlSol: true,
  sharePriceSol: true,
  totalShares: true,
  perfFeeBps: true,
  createdAt: true,
  trader: {
    select: {
      id: true,
      handle: true,
      displayName: true,
      xHandle: true,
      xVerified: true,
    },
  },
} as const;

// Optimized trader profile queries
export const traderSelectMinimal = {
  id: true,
  handle: true,
  displayName: true,
  xHandle: true,
  xVerified: true,
  avatarUrl: true,
  createdAt: true,
  vaults: {
    where: { status: 'active' },
    select: {
      id: true,
      name: true,
      tvlSol: true,
      sharePriceSol: true,
      totalShares: true,
    },
    take: 10,
  },
} as const;

// Optimized trade queries with pagination
export const tradeSelectMinimal = {
  id: true,
  ts: true,
  side: true,
  mint: true,
  symbol: true,
  solAmount: true,
  tokenAmount: true,
  priceSol: true,
} as const;

// Batch vault updates using raw SQL for performance
export async function batchUpdateVaultTvl(
  vaultUpdates: Array<{ vaultId: string; tvl: number; sharePrice: number }>
) {
  const updates = vaultUpdates.map(
    (v, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
  ).join(',');
  
  const values = vaultUpdates.flatMap(v => [v.vaultId, v.tvl, v.sharePrice]);
  
  return prisma.$queryRaw`
    INSERT INTO "Vault" (id, "tvlSol", "sharePriceSol")
    VALUES ${Prisma.raw(updates)}
    ON CONFLICT (id) DO UPDATE SET
      "tvlSol" = EXCLUDED."tvlSol",
      "sharePriceSol" = EXCLUDED."sharePriceSol",
      "updatedAt" = NOW()
  `;
}

// Materialized view for vault performance stats
export const createVaultStatsView = `
CREATE MATERIALIZED VIEW IF NOT EXISTS "VaultStats" AS
SELECT 
  v.id as "vaultId",
  v.name,
  v."tvlSol",
  v."sharePriceSol",
  v."totalShares",
  v.perfFeeBps,
  v.status,
  v."createdAt",
  t.handle as "traderHandle",
  t.displayName as "traderName",
  COUNT(DISTINCT d.id) as "depositorsCount",
  COUNT(DISTINCT tr.id) as "tradesCount",
  SUM(CASE WHEN tr.side = 'buy' THEN tr.solAmount ELSE 0 END) as "buyVolume",
  SUM(CASE WHEN tr.side = 'sell' THEN tr.solAmount ELSE 0 END) as "sellVolume",
  v."sharePriceSol" - 1.0 as "allTimeReturn"
FROM "Vault" v
LEFT JOIN "User" t ON v."traderId" = t.id
LEFT JOIN "VaultDepositor" d ON v.id = d."vaultId"
LEFT JOIN "Trade" tr ON v.id = tr."vaultId"
GROUP BY v.id, t.handle, t.displayName
`;

// Refresh materialized view
export async function refreshVaultStats() {
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW "VaultStats"`;
}

// Optimized leaderboard queries
export async function getTopVaultsByTVL(limit: number = 50) {
  return prisma.$queryRaw`
    SELECT * FROM "VaultStats"
    WHERE status = 'active'
    ORDER BY "tvlSol" DESC
    LIMIT ${limit}
  `;
}

export async function getTopTradersByPnL(limit: number = 50) {
  return prisma.$queryRaw`
    SELECT 
      "traderHandle",
      "traderName",
      SUM("tvlSol") as "totalTvl",
      SUM("allTimeReturn") as "totalReturn",
      COUNT(*) as "vaultCount"
    FROM "VaultStats"
    WHERE status = 'active'
    GROUP BY "traderHandle", "traderName"
    ORDER BY "totalTvl" DESC
    LIMIT ${limit}
  `;
}

// Index recommendations for performance
export const recommendedIndexes = [
  'CREATE INDEX IF NOT EXISTS "idx_vault_status_tvl" ON "Vault"(status, "tvlSol" DESC);',
  'CREATE INDEX IF NOT EXISTS "idx_trade_vault_ts" ON "Trade"("vaultId", ts DESC);',
  'CREATE INDEX IF NOT EXISTS "idx_trade_mint_ts" ON "Trade"(mint, ts DESC);',
  'CREATE INDEX IF NOT EXISTS "idx_vault_trader_status" ON "Vault"("traderId", status);',
  'CREATE INDEX IF NOT EXISTS "idx_deposit_vault_user" ON "VaultDepositor"("vaultId", "userId");',
];