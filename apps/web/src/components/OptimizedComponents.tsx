import { lazy, Suspense } from 'react';
import { useOptimizedFetch } from '../hooks/useOptimizedFetch';
import { api } from '../apiOptimized';
import type { Vault } from '@coffer/shared';

// ── Lazy load heavy components ───────────────────────────────────────
const VaultCard = lazy(() => import('./VaultCard'));
const CandleChart = lazy(() => import('./CandleChart'));
const PositionsTable = lazy(() => import('./PositionsTable'));

// ── Optimized loading state component ─────────────────────────────────
interface LoadingStateProps {
  count?: number;
}

function LoadingState({ count = 3 }: LoadingStateProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-32 bg-gray-800 animate-pulse rounded-lg"
          style={{ animationDelay: `${i * 100}ms` }}
        />
      ))}
    </div>
  );
}

// ── Optimized vault list component ───────────────────────────────────
interface OptimizedVaultListProps {
  type?: string;
  sort?: string;
  mode?: 'real' | 'paper';
}

export function OptimizedVaultList({
  type = 'all',
  sort = 'tvl',
  mode,
}: OptimizedVaultListProps) {
  // Use optimized fetch with caching
  const { data: vaults, loading, error, refetch } = useOptimizedFetch<Vault[]>({
    fetcher: () => api.vaults({ type, sort, mode }),
    deps: [type, sort, mode],
    cacheKey: `vaults:${type}:${sort}:${mode}`,
    cacheTTL: 30 * 1000, // 30 seconds
  });

  if (error) {
    return (
      <div className="text-red-400 p-4">
        <p>Failed to load vaults: {error.message}</p>
        <button
          onClick={() => refetch()}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return <LoadingState count={6} />;
  }

  if (!vaults || vaults.length === 0) {
    return (
      <div className="text-gray-400 p-4 text-center">
        No vaults found
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {vaults.map((vault) => (
        <Suspense key={vault.id} fallback={<LoadingState count={1} />}>
          <VaultCard vault={vault} />
        </Suspense>
      ))}
    </div>
  );
}

// ── Optimized vault detail component ─────────────────────────────────
interface OptimizedVaultDetailProps {
  vaultId: string;
}

export function OptimizedVaultDetail({ vaultId }: OptimizedVaultDetailProps) {
  // Use optimized fetch for vault data
  const { data: vaultDetail, loading, error, refetch } = useOptimizedFetch({
    fetcher: () => api.vault(vaultId),
    deps: [vaultId],
    cacheKey: `vault:${vaultId}`,
    cacheTTL: 30 * 1000, // 30 seconds
  });

  // Use optimized fetch for chart data with shorter TTL
  const { data: ohlcvData } = useOptimizedFetch({
    fetcher: () => api.ohlcv(vaultId, '1h'),
    deps: [vaultId],
    cacheKey: `ohlcv:${vaultId}:1h`,
    cacheTTL: 15 * 1000, // 15 seconds for chart data
  });

  if (error) {
    return (
      <div className="text-red-400 p-4">
        <p>Failed to load vault: {error.message}</p>
        <button
          onClick={() => refetch()}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading || !vaultDetail) {
    return <LoadingState count={3} />;
  }

  return (
    <div className="space-y-6">
      {/* Vault header */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h1 className="text-2xl font-bold text-white">{vaultDetail.vault.name}</h1>
        <p className="text-gray-400 mt-2">{vaultDetail.vault.thesis || 'No thesis provided'}</p>
      </div>

      {/* Chart - lazy loaded */}
      <Suspense fallback={<div className="h-96 bg-gray-800 animate-pulse rounded-lg" />}>
        {ohlcvData && ohlcvData.candles.length > 0 && (
          <CandleChart
            data={ohlcvData.candles}
            height={400}
            width="100%"
          />
        )}
      </Suspense>

      {/* Positions - lazy loaded */}
      <Suspense fallback={<LoadingState count={2} />}>
        <PositionsTable
          positions={vaultDetail.positions}
          trades={vaultDetail.trades}
        />
      </Suspense>
    </div>
  );
}

// ── Performance utilities ───────────────────────────────────────────
export function usePerformanceMonitor() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('performance' in window)) return;

    // Monitor Core Web Vitals
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'largest-contentful-paint') {
          console.log(`[Performance] LCP: ${(entry as any).startTime}ms`);
        } else if (entry.entryType === 'first-input') {
          console.log(`[Performance] FID: ${(entry as any).processingStart - (entry as any).startTime}ms`);
        } else if (entry.entryType === 'layout-shift') {
          if (!(entry as any).hadRecentInput) {
            console.log(`[Performance] CLS: ${(entry as any).value}`);
          }
        }
      }
    });

    observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] });

    return () => observer.disconnect();
  }, []);
}
