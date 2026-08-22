// ── Perfect API Service Layer ───────────────────────────────────────
import { prisma } from '../db.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';

export class VaultService {
  static async getVaultWithDetails(id: string) {
    const vault = await prisma.vault.findUnique({
      where: { id },
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
        positions: {
          select: {
            id: true,
            token: true,
            amount: true,
            value: true,
            pnl: true,
            pnlPercent: true
          },
          orderBy: { value: 'desc' },
          take: 10
        },
        _count: {
          select: {
            positions: true,
            activity: true
          }
        }
      }
    });

    if (!vault) {
      throw new NotFoundError('Vault');
    }

    return vault;
  }

  static async getVaultsList(filters: any = {}, pagination: any = {}) {
    const { page = 1, limit = 20, sort = 'tvl', order = 'desc' } = pagination;
    const { traderId, minTvl, maxTvl, token } = filters;

    const where: any = {};
    if (traderId) where.traderId = traderId;
    if (token) where.positions = { some: { token } };
    if (minTvl || maxTvl) {
      where.tvl = {};
      if (minTvl) where.tvl.gte = minTvl;
      if (maxTvl) where.tvl.lte = maxTvl;
    }

    const skip = (page - 1) * limit;

    const [vaults, total] = await Promise.all([
      prisma.vault.findMany({
        where,
        include: {
          trader: {
            select: {
              id: true,
              name: true,
              avatar: true,
              xHandle: true,
              xVerified: true
            }
          }
        },
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.vault.count({ where })
    ]);

    return {
      vaults,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  static async createVault(data: any) {
    const { traderId, name, description, strategy } = data;

    // Validate trader exists
    const trader = await prisma.trader.findUnique({
      where: { id: traderId }
    });

    if (!trader) {
      throw new NotFoundError('Trader');
    }

    // Create vault with initial values
    const vault = await prisma.vault.create({
      data: {
        traderId,
        name: name || `${trader.name}'s Vault`,
        description: description || '',
        strategy: strategy || '',
        tvl: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalPnl: 0,
        totalPnlPercent: 0,
        status: 'active'
      },
      include: {
        trader: {
          select: {
            id: true,
            name: true,
            avatar: true,
            xHandle: true,
            xVerified: true
          }
        }
      }
    });

    return vault;
  }

  static async updateVaultMetrics(vaultId: string) {
    // Calculate updated metrics from positions and activity
    const positions = await prisma.position.findMany({
      where: { vaultId }
    });

    const totalValue = positions.reduce((sum, pos) => sum + (pos.value || 0), 0);
    const totalPnl = positions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);

    const vault = await prisma.vault.findUnique({
      where: { id: vaultId }
    });

    if (!vault) {
      throw new NotFoundError('Vault');
    }

    const totalDeposits = await prisma.activity.count({
      where: { vaultId, type: 'deposit' }
    });

    const totalWithdrawals = await prisma.activity.count({
      where: { vaultId, type: 'withdrawal' }
    });

    const totalPnlPercent = vault.totalDeposits > 0 
      ? (totalPnl / vault.totalDeposits) * 100 
      : 0;

    const updatedVault = await prisma.vault.update({
      where: { id: vaultId },
      data: {
        tvl: totalValue,
        totalPnl,
        totalPnlPercent,
        totalDeposits,
        totalWithdrawals
      },
      include: {
        trader: {
          select: {
            id: true,
            name: true,
            avatar: true,
            xHandle: true,
            xVerified: true
          }
        }
      }
    });

    return updatedVault;
  }

  static async getVaultPerformance(vaultId: string, timeframe: string = '7d') {
    const vault = await this.getVaultWithDetails(vaultId);
    
    // Calculate performance metrics based on timeframe
    const now = new Date();
    let startDate = new Date();
    
    switch (timeframe) {
      case '1d':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    const activities = await prisma.activity.findMany({
      where: {
        vaultId,
        timestamp: { gte: startDate }
      },
      orderBy: { timestamp: 'asc' }
    });

    const performanceData = activities.map(activity => ({
      timestamp: activity.timestamp,
      value: activity.amount,
      type: activity.type
    }));

    return {
      vault,
      performance: {
        timeframe,
        data: performanceData,
        totalReturn: vault.totalPnlPercent,
        totalPnl: vault.totalPnl,
        currentTvl: vault.tvl
      }
    };
  }
}