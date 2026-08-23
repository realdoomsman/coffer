// ── Production Fixes ───────────────────────────────────────────────
import { Router } from 'express';
import { prisma } from '../db.js';

export const productionFixesRouter = Router();

// GET /api/fixes/meta - Fix stale meta data
productionFixesRouter.get('/meta', async (_req, res) => {
  try {
    // Get fresh data from database
    const [vaultsCount, totalTvl] = await Promise.all([
      prisma.vault.count({ where: { status: 'active', mode: 'real' } }),
      prisma.vault.aggregate({
        where: { status: 'active', mode: 'real' },
        _sum: { tvlSol: true }
      })
    ]);

    const meta = {
      tvlSol: totalTvl._sum.tvlSol || 0,
      vaults: vaultsCount,
      timestamp: new Date().toISOString()
    };

    res.json(meta);
  } catch (error) {
    console.error('Meta fix error:', error);
    res.status(500).json({ error: 'Failed to get meta data' });
  }
});

// GET /api/fixes/leaderboards - Direct leaderboard routes
productionFixesRouter.get('/leaderboards/traders', async (req, res) => {
  try {
    const { limit = '50', offset = '0', period = 'all', sort = 'pnl' } = req.query;
    
    const limitNum = Math.min(parseInt(limit as string), 100);
    const offsetNum = parseInt(offset as string);

    // Get traders with performance metrics
    const users = await prisma.user.findMany({
      include: {
        _count: {
          select: { vaults: true }
        },
        vaults: {
          where: { status: 'active' },
          select: {
            tvlSol: true,
            traderFeesAccruedSol: true,
            vestedFeesAccruedSol: true
          }
        }
      },
      skip: offsetNum,
      take: limitNum,
      orderBy: {
        id: 'desc'
      }
    });

    // Calculate additional metrics
    const tradersWithMetrics = users.map(user => {
      const totalTvl = user.vaults.reduce((sum, v) => sum + (v.tvlSol || 0), 0);
      const totalFees = user.vaults.reduce((sum, v) => sum + (v.traderFeesAccruedSol || 0) + (v.vestedFeesAccruedSol || 0), 0);

      return {
        id: user.id,
        handle: user.handle,
        displayName: user.displayName,
        xHandle: user.xHandle,
        xVerified: user.xVerified,
        totalTvl,
        totalFees,
        vaultsCount: user._count.vaults
      };
    });

    res.json({
      traders: tradersWithMetrics,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: tradersWithMetrics.length
      }
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// GET /api/fixes/leaderboards/vaults
productionFixesRouter.get('/leaderboards/vaults', async (req, res) => {
  try {
    const { limit = '50', offset = '0', sort = 'tvl' } = req.query;
    
    const limitNum = Math.min(parseInt(limit as string), 100);
    const offsetNum = parseInt(offset as string);

    const orderByMap: Record<string, any> = {
      tvl: { tvlSol: 'desc' },
      fees: { traderFeesAccruedSol: 'desc' },
      shares: { totalShares: 'desc' },
    };

    const orderBy = orderByMap[sort as string] || orderByMap.tvl;

    const vaults = await prisma.vault.findMany({
      include: {
        trader: {
          select: {
            id: true,
            handle: true,
            displayName: true,
            xHandle: true,
            xVerified: true
          }
        },
        _count: {
          select: { positions: true }
        }
      },
      where: { status: 'active' },
      skip: offsetNum,
      take: limitNum,
      orderBy,
    });

    res.json({
      vaults,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: vaults.length
      }
    });
  } catch (error) {
    console.error('Vaults leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get vaults leaderboard' });
  }
});