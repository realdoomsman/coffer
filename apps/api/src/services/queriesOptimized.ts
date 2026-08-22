// ── Database query optimizations ───────────────────────────────────────
import { prisma } from '../db.js';
import { EquityPoint, Position, Trade, Vault } from '@prisma/client';

// ── Optimized vault queries with selective field loading ─────────────
export async function getVaultsList(filters: {
  type?: string;
  mode?: string;
  limit?: number;
  offset?: number;
}) {
  return prisma.vault.findMany({
    where: {
      ...(filters.type && { type: filters.type }),
      ...(filters.mode && { mode: filters.mode }),
      status: 'active',
    },
    select: {
      id: true,
      name: true,
      type: true,
      mode: true,
      status: true,
      tvlSol: true,
      sharePriceSol: true,
      perfFeeBps: true,
      createdAt: true,
      trader: {
        select: {
          id: true,
          handle: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      // Only count relationships, don't load full data
      _count: {
        select: {
          deposits: true,
          trades: true,
        },
      },
    },
    orderBy: { tvlSol: 'desc' },
    take: filters.limit || 50,
    skip: filters.offset || 0,
  });
}

// ── Optimized vault detail with parallel queries ───────────────────
export async function getVaultDetailOptimized(vaultId: string) {
  const [vault, positions, recentTrades, equityPoints] = await Promise.all([
    // Main vault data
    prisma.vault.findUnique({
      where: { id: vaultId },
      select: {
        id: true,
        name: true,
        type: true,
        mode: true,
        status: true,
        tvlSol: true,
        sharePriceSol: true,
        totalShares: true,
        perfFeeBps: true,
        thesis: true,
        createdAt: true,
        trader: {
          select: {
            id: true,
            handle: true,
            displayName: true,
            avatarUrl: true,
            xHandle: true,
            xVerified: true,
            bio: true,
          },
        },
      },
    }),
    
    // Positions with minimal fields
    prisma.position.findMany({
      where: { vaultId },
      select: {
        id: true,
        mint: true,
        symbol: true,
        name: true,
        amountTokens: true,
        costSol: true,
        valueSol: true,
        pnlSol: true,
        markStale: true,
        updatedAt: true,
      },
      orderBy: { valueSol: 'desc' },
      take: 20,
    }),
    
    // Recent trades only
    prisma.trade.findMany({
      where: { vaultId },
      select: {
        id: true,
        ts: true,
        side: true,
        mint: true,
        symbol: true,
        solAmount: true,
        tokenAmount: true,
        priceSol: true,
        source: true,
        copyLagSlots: true,
      },
      orderBy: { ts: 'desc' },
      take: 50,
    }),
    
    // Downsampled equity curve (last 100 points)
    prisma.equityPoint.findMany({
      where: { vaultId },
      select: { t: true, v: true },
      orderBy: { t: 'desc' },
      take: 100,
    }),
  ]);

  if (!vault) return null;

  return {
    vault,
    positions,
    trades: recentTrades,
    equityCurve: equityPoints.reverse(), // Return in chronological order
  };
}

// ── Optimized trade history with pagination ─────────────────────────
export async function getTradesPaginated(vaultId: string, page: number = 1, limit: number = 50) {
  const skip = (page - 1) * limit;

  const [trades, total] = await Promise.all([
    prisma.trade.findMany({
      where: { vaultId },
      select: {
        id: true,
        ts: true,
        side: true,
        mint: true,
        symbol: true,
        solAmount: true,
        tokenAmount: true,
        priceSol: true,
        txSig: true,
        source: true,
        copyLagSlots: true,
      },
      orderBy: { ts: 'desc' },
      take: limit,
      skip,
    }),
    prisma.trade.count({ where: { vaultId } }),
  ]);

  return {
    trades,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + trades.length < total,
    },
  };
}

// ── Optimized portfolio aggregation ─────────────────────────────────
export async function getUserPortfolioOptimized(userId: string) {
  const [deposits, vaults, withdrawRequests] = await Promise.all([
    prisma.deposit.findMany({
      where: { userId },
      select: {
        id: true,
        vaultId: true,
        shares: true,
        costSol: true,
        createdAt: true,
        vault: {
          select: {
            id: true,
            name: true,
            sharePriceSol: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.vaultDepositor.findMany({
      where: { userId },
      select: {
        id: true,
        vaultId: true,
        shares: true,
        costSol: true,
        cumulativeTraderFeeSol: true,
        vault: {
          select: {
            id: true,
            name: true,
            sharePriceSol: true,
            tvlSol: true,
            status: true,
            type: true,
            mode: true,
          },
        },
      },
    }),
    prisma.withdrawRequest.findMany({
      where: { 
        userId,
        status: { in: ['pending', 'executable'] },
      },
      select: {
        id: true,
        vaultId: true,
        shares: true,
        valueAtRequestSol: true,
        requestedAt: true,
        executableAt: true,
        status: true,
      },
      orderBy: { requestedAt: 'desc' },
    }),
  ]);

  // Calculate holdings in memory (faster than complex DB queries)
  const holdings = vaults.map((vd) => {
    const vault = vd.vault;
    const currentValue = vd.shares * vault.sharePriceSol;
    const pnl = currentValue - vd.costSol;
    const pnlPct = vd.costSol > 0 ? (pnl / vd.costSol) * 100 : 0;

    return {
      vaultId: vault.id,
      vaultName: vault.name,
      shares: vd.shares,
      costSol: vd.costSol,
      valueSol: currentValue,
      pnlSol: pnl,
      pnlPct,
      traderFeesSol: vd.cumulativeTraderFeeSol,
      vaultStatus: vault.status,
      vaultType: vault.type,
      vaultMode: vault.mode,
    };
  });

  return {
    holdings,
    totalValueSol: holdings.reduce((sum, h) => sum + h.valueSol, 0),
    totalPnlSol: holdings.reduce((sum, h) => sum + h.pnlSol, 0),
    totalCostSol: holdings.reduce((sum, h) => sum + h.costSol, 0),
    pendingWithdrawals: withdrawRequests,
  };
}

// ── Optimized activity feed with caching ────────────────────────────
export async function getActivityFeedOptimized(limit: number = 30, vaultId?: string) {
  const whereClause = vaultId ? { vaultId } : {};

  const [trades, deposits, withdrawals] = await Promise.all([
    prisma.trade.findMany({
      where: whereClause,
      select: {
        id: true,
        vaultId: true,
        ts: true,
        side: true,
        mint: true,
        symbol: true,
        solAmount: true,
        tokenAmount: true,
        source: true,
        vault: {
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: { ts: 'desc' },
      take: Math.ceil(limit / 3),
    }),
    prisma.deposit.findMany({
      where: whereClause,
      select: {
        id: true,
        vaultId: true,
        shares: true,
        costSol: true,
        createdAt: true,
        vault: {
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.ceil(limit / 3),
    }),
    prisma.withdrawRequest.findMany({
      where: {
        ...whereClause,
        status: { in: ['paid', 'executable'] },
      },
      select: {
        id: true,
        vaultId: true,
        shares: true,
        valueAtRequestSol: true,
        requestedAt: true,
        status: true,
        vault: {
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: { requestedAt: 'desc' },
      take: Math.ceil(limit / 3),
    }),
  ]);

  // Combine and sort by timestamp
  const activities = [
    ...trades.map(t => ({
      type: 'trade' as const,
      id: t.id,
      vaultId: t.vaultId,
      vaultName: t.vault.name,
      vaultType: t.vault.type,
      timestamp: t.ts * 1000, // Convert to milliseconds
      data: t,
    })),
    ...deposits.map(d => ({
      type: 'deposit' as const,
      id: d.id,
      vaultId: d.vaultId,
      vaultName: d.vault.name,
      vaultType: d.vault.type,
      timestamp: d.createdAt.getTime(),
      data: d,
    })),
    ...withdrawals.map(w => ({
      type: 'withdrawal' as const,
      id: w.id,
      vaultId: w.vaultId,
      vaultName: w.vault.name,
      vaultType: w.vault.type,
      timestamp: w.requestedAt * 1000,
      data: w,
    })),
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);

  return activities;
}

// ── Query performance monitoring ─────────────────────────────────────
export function logQueryPerformance(label: string, startTime: number) {
  const duration = Date.now() - startTime;
  if (duration > 100) {
    console.warn(`[DB] Slow query detected: ${label} took ${duration}ms`);
  }
}
