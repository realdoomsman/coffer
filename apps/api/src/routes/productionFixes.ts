// ── Production Fixes ───────────────────────────────────────────────
import { Router } from 'express';
import { prisma } from '../db.js';

export const productionFixesRouter = Router();

// GET /api/fixes/meta - Fix stale meta data
productionFixesRouter.get('/meta', async (_req, res) => {
  try {
    // Get fresh data from database
    const [vaultsCount, totalTvl] = await Promise.all([
      prisma.vault.count(),
      prisma.vault.aggregate({
        _sum: { tvl: true }
      })
    ]);

    const meta = {
      tvlSol: totalTvl._sum.tvl || 0,
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
    const traders = await prisma.trader.findMany({
      include: {
        _count: {
          select: { vaults: true }
        },
        vaults: {
          select: {
            tvl: true,
            totalPnl: true,
            totalPnlPercent: true
          }
        }
      },
      skip: offsetNum,
      take: limitNum,
      orderBy: {
        [sort as string]: 'desc'
      }
    });

    // Calculate additional metrics
    const tradersWithMetrics = traders.map(trader => {
      const totalTvl = trader.vaults.reduce((sum, v) => sum + (v.tvl || 0), 0);
      const totalPnl = trader.vaults.reduce((sum, v) => sum + (v.totalPnl || 0), 0);
      const avgPnlPercent = trader.vaults.length > 0 
        ? trader.vaults.reduce((sum, v) => sum + (v.totalPnlPercent || 0), 0) / trader.vaults.length
        : 0;

      return {
        ...trader,
        totalTvl,
        totalPnl,
        avgPnlPercent,
        vaultsCount: trader._count.vaults
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

    const vaults = await prisma.vault.findMany({
      include: {
        trader: {
          select: {
            id: true,
            name: true,
            avatar: true,
            xHandle: true,
            xVerified: true
          }
        },
        _count: {
          select: { positions: true }
        }
      },
      skip: offsetNum,
      take: limitNum,
      orderBy: {
        [sort as string]: 'desc'
      }
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