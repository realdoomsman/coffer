// ── Professional Animated Vault Card Component ─────────────────────────
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Vault, fmtSol, fmtPct, type TraderProfile } from '@coffer/shared';
import { Delta, Sparkline, TypePill } from './bits';
import { AnimatedCard, AnimatedBadge, AnimatedCounter, AnimatedStatus } from './AnimatedComponents';
import { cn } from '../utils/cn';

interface VaultCardProps {
  vault: Vault & { trader: TraderProfile };
  className?: string;
  index?: number;
}

export function VaultCard({ vault, className, index = 0 }: VaultCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Link
      to={`/vault/${vault.id}`}
      className="block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <AnimatedCard 
        className={className}
        hover={true}
        glow={true}
        delay={index * 50}
      >
        <div className="p-6 space-y-4">
          {/* Header with animated elements */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-white truncate transition-colors duration-300 group-hover:text-blue-400">
                  {vault.name}
                </h3>
                <TypePill mode={vault.mode} />
              </div>
              <p className="text-sm text-gray-400 truncate">
                by {vault.trader.displayName}
              </p>
            </div>

            {/* TVL with animated counter */}
            <div className="text-right ml-4">
              <div className="text-2xl font-bold text-white tabular-nums">
                <AnimatedCounter 
                  value={vault.tvlSol} 
                  formatFn={(n) => fmtSol(n)}
                  duration={800}
                />
              </div>
              <div className="text-xs text-gray-500">TVL</div>
            </div>
          </div>

          {/* Performance metrics grid */}
          <div className="grid grid-cols-3 gap-3">
            <MetricCard
              label="All Time"
              value={fmtPct(vault.sharePriceSol - 1)}
              isPositive={vault.sharePriceSol >= 1}
              delay={index * 50 + 100}
            />
            <MetricCard
              label="Shares"
              value={vault.totalShares.toFixed(1)}
              isPositive={true}
              delay={index * 50 + 150}
            />
            <MetricCard
              label="Fee"
              value={`${(vault.perfFeeBps / 100).toFixed(0)}%`}
              isPositive={true}
              delay={index * 50 + 200}
            />
          </div>

          {/* Animated sparkline */}
          <div className="h-16 relative">
            <div className={cn(
              'transition-all duration-300',
              isHovered ? 'opacity-100' : 'opacity-70'
            )}>
              <Sparkline
                data={vault.equity || []}
                className="w-full h-full"
              />
            </div>
            
            {/* Hover overlay with gradient */}
            {isHovered && (
              <div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/10 to-transparent animate-pulse"
                style={{
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s linear infinite',
                }}
              />
            )}
          </div>

          {/* Footer with status and action */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-800">
            <AnimatedStatus
              status={vault.status === 'active' ? 'active' : 'inactive'}
              label={vault.status}
            />

            <button className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300",
              "bg-blue-600 hover:bg-blue-700 text-white",
              "hover:shadow-lg hover:shadow-blue-500/25",
              "transform hover:scale-105 active:scale-95",
              "hover:translate-y-[-2px]"
            )}>
              {vault.mode === 'real' ? 'Trade' : 'Explore'}
            </button>
          </div>
        </div>

        {/* Animated border glow effect */}
        <div className={cn(
          "absolute inset-0 rounded-2xl pointer-events-none",
          "border-2 border-transparent transition-all duration-300",
          isHovered && "border-blue-500/30"
        )} />

        {/* Corner accent */}
        <div className={cn(
          "absolute top-0 right-0 w-8 h-8",
          "bg-gradient-to-bl from-blue-500/20 to-transparent",
          "rounded-tr-2xl transition-opacity duration-300",
          isHovered ? 'opacity-100' : 'opacity-0'
        )} />
      </AnimatedCard>
    </Link>
  );
}

// ── Animated Metric Card ─────────────────────────────────────────────
interface MetricCardProps {
  label: string;
  value: string;
  isPositive: boolean;
  delay?: number;
}

function MetricCard({ label, value, isPositive, delay = 0 }: MetricCardProps) {
  return (
    <div className={cn(
      "text-center p-3 rounded-lg bg-gray-800/50",
      "transition-all duration-300",
      "hover:bg-gray-800 hover:scale-105",
      "animate-in fade-in zoom-in-95 duration-300",
      `style-[animation-delay:${delay}ms]`
    )}>
      <div className={cn(
        "text-lg font-semibold tabular-nums",
        isPositive ? "text-green-400" : "text-red-400"
      )}>
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

// ── Leaderboard Card Component ───────────────────────────────────────
interface LeaderboardCardProps {
  rank: number;
  name: string;
  value: string;
  change: number;
  avatar?: string;
  isHovered?: boolean;
  className?: string;
  index?: number;
}

export function LeaderboardCard({ 
  rank, 
  name, 
  value, 
  change, 
  avatar, 
  isHovered = false,
  className,
  index = 0
}: LeaderboardCardProps) {
  const [localHovered, setLocalHovered] = useState(false);
  const hovered = isHovered || localHovered;
  const isTop3 = rank <= 3;

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border bg-gray-900/50",
        "transition-all duration-300 ease-out",
        "hover:border-gray-700 hover:bg-gray-900/80",
        hovered && "border-blue-500/50 bg-blue-500/5",
        isTop3 && "border-amber-500/30",
        "animate-in fade-in slide-in-from-left-2 duration-300",
        `style-[animation-delay:${index * 50}ms]`,
        className
      )}
      onMouseEnter={() => setLocalHovered(true)}
      onMouseLeave={() => setLocalHovered(false)}
    >
      {/* Animated rank badge */}
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300",
        isTop3 
          ? "bg-gradient-to-br from-yellow-500 to-orange-500 text-white shadow-lg shadow-amber-500/20" 
          : "bg-gray-800 text-gray-400 border border-gray-700",
        hovered && "scale-110"
      )}>
        {rank}
      </div>

      {/* Animated avatar */}
      <div className={cn(
        "w-10 h-10 rounded-full bg-gray-800 overflow-hidden",
        "ring-2 ring-gray-700 ring-offset-2 ring-offset-gray-900",
        "transition-all duration-300",
        "hover:ring-blue-500 hover:scale-110",
        "animate-in zoom-in-95 duration-300",
        `style-[animation-delay:${index * 50 + 50}ms]`
      )}>
        {avatar ? (
          <img 
            src={avatar} 
            alt={name} 
            className="w-full h-full object-cover" 
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-lg font-semibold">
            {name[0].toUpperCase()}
          </div>
        )}
      </div>

      {/* Name and value */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate transition-colors duration-300">
          {name}
        </div>
        <div className="text-xs text-gray-500">{value}</div>
      </div>

      {/* Animated change indicator */}
      <div className="animate-in fade-in duration-300" style={{ animationDelay: `${index * 50 + 100}ms` }}>
        <Delta value={change} className="text-sm font-medium" />
      </div>
    </div>
  );
}
