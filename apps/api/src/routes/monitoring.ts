// ── Perfect Production Monitoring System ─────────────────────────────
import { Router } from 'express';

export const monitoringRouter = Router();

// GET /api/monitoring/health - Comprehensive health check
monitoringRouter.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    services: {
      api: true,
      database: false,
      redis: false,
      external: {
        jupiter: false,
        privy: false,
        solana: false
      }
    },
    performance: {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      responseTime: 0
    }
  };

  // Database health
  try {
    const { prisma } = await import('../db.js');
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = true;
    health.performance.responseTime = Date.now() - startTime;
  } catch (error) {
    health.status = 'degraded';
    health.services.database = false;
  }

  // External services health
  try {
    const { checkJupiterHealth } = await import('../services/jupiter.js');
    health.services.external.jupiter = await checkJupiterHealth();
  } catch (error) {
    health.services.external.jupiter = false;
  }

  try {
    const { checkPrivyHealth } = await import('../services/privy.js');
    health.services.external.privy = await checkPrivyHealth();
  } catch (error) {
    health.services.external.privy = false;
  }

  try {
    const { checkSolanaHealth } = await import('../services/solana.js');
    health.services.external.solana = await checkSolanaHealth();
  } catch (error) {
    health.services.external.solana = false;
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// GET /api/monitoring/metrics - Application metrics
monitoringRouter.get('/metrics', async (_req, res) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    system: {
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: process.memoryUsage().rss,
        heapTotal: process.memoryUsage().heapTotal,
        heapUsed: process.memoryUsage().heapUsed,
        external: process.memoryUsage().external
      },
      cpu: process.cpuUsage()
    },
    application: {
      requests: {
        total: global.requestCount || 0,
        errors: global.errorCount || 0,
        slow: global.slowRequestCount || 0
      },
      performance: {
        avgResponseTime: global.avgResponseTime || 0,
        p95ResponseTime: global.p95ResponseTime || 0,
        p99ResponseTime: global.p99ResponseTime || 0
      }
    }
  };

  res.json(metrics);
});

// GET /api/monitoring/status - Status for load balancers
monitoringRouter.get('/status', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});