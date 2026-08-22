// ── Enhanced UI Integration Example ─────────────────────────────────
// This file demonstrates how to use the enhanced UI components together

import React, { useState, useMemo } from 'react';
import { 
  AnimatedCard, 
  AnimatedCounter, 
  AnimatedStatus, 
  AnimatedProgress, 
  AnimatedBadge, 
  Skeleton 
} from './components/AnimatedComponents';
import { VaultCard, LeaderboardCard } from './components/VaultCard';
import { CandleChart, CandleChartSkeleton } from './components/CandleChart';
import { PositionsTable, PositionsTableSkeleton } from './components/PositionsTable';
import { TradeTape, TradeTapeSkeleton } from './components/TradeTape';
import { useBreakpoint } from './styles/responsive';
import { animationPresets } from './styles/theme';

// ── Example: Enhanced Vault Dashboard Component ─────────────────────
export function EnhancedVaultDashboard({ vaultId }: { vaultId: string }) {
  const { isMobile, isDesktop } = useBreakpoint();
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'trades'>('overview');

  // Simulate data loading
  React.useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  const vaultData = {
    name: "Alpha Strategy Vault",
    tvl: 125000.50,
    allTimeReturn: 0.4532,
    shares: 1234.5,
    fee: 15,
    status: 'active' as const,
  };

  const positionsData = [
    { id: '1', symbol: 'SOL', amountTokens: 100, costSol: 5000, valueSol: 5200, pnlSol: 200, pnlPct: 0.04, markStale: false },
    { id: '2', symbol: 'BTC', amountTokens: 0.5, costSol: 15000, valueSol: 14800, pnlSol: -200, pnlPct: -0.0133, markStale: true },
  ];

  const tradesData = [
    { id: '1', ts: Date.now() / 1000 - 300, side: 'buy' as const, symbol: 'SOL', solAmount: 1000, priceSol: 150, txSig: 'abc123' },
    { id: '2', ts: Date.now() / 1000 - 600, side: 'sell' as const, symbol: 'BTC', solAmount: 500, priceSol: 30000, txSig: 'def456' },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      {/* Header Section */}
      <div className={`pagehead ${animationPresets.fadeInUp}`}>
        <div>
          <h1>{vaultData.name}</h1>
          <div className="sub">Real-time vault performance and management</div>
        </div>
        <AnimatedStatus status={vaultData.status} label={vaultData.status} />
      </div>

      {/* Main Statistics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-in">
        <StatCard
          label="Total Value Locked"
          value={vaultData.tvl}
          formatFn={(n) => `◎${n.toLocaleString()}`}
          delay={0}
        />
        <StatCard
          label="All-Time Return"
          value={vaultData.allTimeReturn * 100}
          formatFn={(n) => `${n.toFixed(2)}%`}
          isPositive={vaultData.allTimeReturn >= 0}
          delay={50}
        />
        <StatCard
          label="Total Shares"
          value={vaultData.shares}
          formatFn={(n) => n.toFixed(1)}
          delay={100}
        />
        <StatCard
          label="Performance Fee"
          value={vaultData.fee}
          formatFn={(n) => `${n}%`}
          delay={150}
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-800 pb-4">
        {(['overview', 'positions', 'trades'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${activeTab === tab 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
                : 'bg-gray-800 text-gray-400 hover:text-white'
              }
              hover:scale-105 active:scale-95
            `}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="animate-in fade-in slide-in-from-top-2 duration-300">
        {isLoading ? (
          <LoadingState activeTab={activeTab} />
        ) : (
          <>
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart Section */}
                <div className="lg:col-span-2 space-y-4">
                  <AnimatedCard>
                    <div className="p-4">
                      <h3 className="text-lg font-semibold mb-4">Performance Chart</h3>
                      <CandleChart mint="9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump" tf="5m" />
                    </div>
                  </AnimatedCard>
                  
                  {/* Risk Metrics */}
                  <div className="grid grid-cols-3 gap-4">
                    <RiskMetricCard label="Max Drawdown" value="-12.5%" severity="warning" />
                    <RiskMetricCard label="Sharpe Ratio" value="2.3" severity="success" />
                    <RiskMetricCard label="Win Rate" value="67%" severity="info" />
                  </div>
                </div>

                {/* Side Panel */}
                <div className="space-y-4">
                  <AnimatedCard>
                    <div className="p-4">
                      <h3 className="text-lg font-semibold mb-4">Quick Stats</h3>
                      <div className="space-y-3">
                        <QuickStat label="Trades Today" value="23" />
                        <QuickStat label="Win Rate" value="67%" />
                        <QuickStat label="Avg Hold Time" value="4.2h" />
                        <QuickStat label="Risk Score" value="Medium" />
                      </div>
                    </div>
                  </AnimatedCard>

                  <AnimatedCard>
                    <div className="p-4">
                      <h3 className="text-lg font-semibold mb-4">Performance</h3>
                      <AnimatedProgress value={67} max={100} color="blue" showLabel />
                      <div className="mt-2 text-sm text-gray-400 text-center">
                        67% of monthly target achieved
                      </div>
                    </div>
                  </AnimatedCard>
                </div>
              </div>
            )}

            {activeTab === 'positions' && (
              <AnimatedCard>
                <div className="p-4">
                  <h3 className="text-lg font-semibold mb-4">Current Positions</h3>
                  <PositionsTable positions={positionsData} />
                </div>
              </AnimatedCard>
            )}

            {activeTab === 'trades' && (
              <AnimatedCard>
                <div className="p-4">
                  <h3 className="text-lg font-semibold mb-4">Recent Trades</h3>
                  <TradeTape trades={tradesData} showLag />
                </div>
              </AnimatedCard>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Supporting Components ───────────────────────────────────────────

function StatCard({ 
  label, 
  value, 
  formatFn, 
  isPositive = true, 
  delay = 0 
}: { 
  label: string; 
  value: number; 
  formatFn: (n: number) => string; 
  isPositive?: boolean; 
  delay?: number; 
}) {
  return (
    <AnimatedCard delay={delay} className="text-center">
      <div className="p-4">
        <div className={`text-2xl font-bold tabular-nums ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          <AnimatedCounter value={value} formatFn={formatFn} />
        </div>
        <div className="text-xs text-gray-500 mt-2 uppercase tracking-wide">{label}</div>
      </div>
    </AnimatedCard>
  );
}

function RiskMetricCard({ 
  label, 
  value, 
  severity 
}: { 
  label: string; 
  value: string; 
  severity: 'success' | 'warning' | 'error' | 'info' 
}) {
  const colorMap = {
    success: 'bg-green-500/20 text-green-400 border-green-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  return (
    <AnimatedCard className="text-center">
      <div className={`p-4 rounded-lg border ${colorMap[severity]}`}>
        <div className="text-lg font-semibold">{value}</div>
        <div className="text-xs mt-1 opacity-80">{label}</div>
      </div>
    </AnimatedCard>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function LoadingState({ activeTab }: { activeTab: string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={100} variant="rectangular" className="rounded-2xl" />
        ))}
      </div>
      
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <CandleChartSkeleton />
          </div>
          <div className="space-y-4">
            <Skeleton height={200} variant="rectangular" className="rounded-2xl" />
            <Skeleton height={150} variant="rectangular" className="rounded-2xl" />
          </div>
        </div>
      )}
      
      {activeTab === 'positions' && (
        <PositionsTableSkeleton />
      )}
      
      {activeTab === 'trades' && (
        <TradeTapeSkeleton showLag />
      )}
    </div>
  );
}

// ── Example: Enhanced Leaderboard Component ─────────────────────────
export function EnhancedLeaderboard() {
  const leaderboardData = [
    { rank: 1, name: "Alpha Trader", value: "◎125,000", change: 45.3, avatar: "/avatar1.jpg" },
    { rank: 2, name: "Beta Strategy", value: "◎98,500", change: 32.1 },
    { rank: 3, name: "Gamma Fund", value: "◎87,200", change: 28.7 },
    { rank: 4, name: "Delta Vault", value: "◎76,800", change: 15.2 },
    { rank: 5, name: "Epsilon Trader", value: "◎65,400", change: 12.8 },
  ];

  return (
    <div className="space-y-4">
      <div className={`pagehead ${animationPresets.fadeInUp}`}>
        <div>
          <h1>Leaderboard</h1>
          <div className="sub">Top performing vaults this month</div>
        </div>
        <AnimatedBadge variant="success">Live</AnimatedBadge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-in">
        {leaderboardData.map((trader, index) => (
          <LeaderboardCard
            key={trader.rank}
            {...trader}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

// ── Example: Enhanced Token Page Component ─────────────────────────
export function EnhancedTokenPage({ mint }: { mint: string }) {
  const [isLoading, setIsLoading] = useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-6">
      {/* Token Header */}
      <div className={`pagehead ${animationPresets.fadeInUp}`}>
        <div>
          <h1>Token Overview</h1>
          <div className="sub">Real-time price and trading data</div>
        </div>
        <AnimatedStatus status="loading" label="Live" />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Section */}
        <div className="lg:col-span-2">
          <AnimatedCard>
            <div className="p-4">
              <h3 className="text-lg font-semibold mb-4">Price Chart</h3>
              {isLoading ? (
                <CandleChartSkeleton />
              ) : (
                <CandleChart mint={mint} tf="5m" />
              )}
            </div>
          </AnimatedCard>
        </div>

        {/* Side Panel */}
        <div className="space-y-4">
          <AnimatedCard>
            <div className="p-4">
              <h3 className="text-lg font-semibold mb-4">Token Stats</h3>
              <div className="space-y-3">
                <TokenStat label="Price" value="◎0.000000123" change={12.5} />
                <TokenStat label="24h Volume" value="◎1.2M" change={8.3} />
                <TokenStat label="Market Cap" value="◎45.6M" change={-2.1} />
                <TokenStat label="Holders" value="12,345" change={5.7} />
              </div>
            </div>
          </AnimatedCard>

          <AnimatedCard>
            <div className="p-4">
              <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
              {isLoading ? (
                <TradeTapeSkeleton />
              ) : (
                <TradeTape 
                  trades={[
                    { id: '1', ts: Date.now() / 1000 - 60, side: 'buy', symbol: 'TOKEN', solAmount: 100, priceSol: 0.000000123, txSig: 'abc123' },
                    { id: '2', ts: Date.now() / 1000 - 120, side: 'sell', symbol: 'TOKEN', solAmount: 50, priceSol: 0.000000122, txSig: 'def456' },
                  ]} 
                />
              )}
            </div>
          </AnimatedCard>
        </div>
      </div>
    </div>
  );
}

function TokenStat({ 
  label, 
  value, 
  change 
}: { 
  label: string; 
  value: string; 
  change: number 
}) {
  const isPositive = change >= 0;
  
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="text-right">
        <div className="text-sm font-medium tabular-nums">{value}</div>
        <div className={`text-xs ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          {isPositive ? '+' : ''}{change.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

// ── Export All Components ───────────────────────────────────────────
export default {
  EnhancedVaultDashboard,
  EnhancedLeaderboard,
  EnhancedTokenPage,
};
