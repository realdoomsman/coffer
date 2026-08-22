// ── Advanced Vault Card Component with Animations ─────────────────
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Vault, fmtSol, fmtPct, type TraderProfile } from '@coffer/shared';
import { Delta, Sparkline, TypePill } from './bits';
import { cn } from '../utils/cn';

interface VaultCardProps {
  vault: Vault & { trader: TraderProfile };
  className?: string;
}

export function VaultCard({ vault, className }: VaultCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <Link
      to={`/vault/${vault.id}`}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/50 p-6",
        "hover:border-gray-700 hover:shadow-2xl hover:shadow-blue-500/10",
        "transition-all duration-300 ease-out hover:-translate-y-1",
        "before:absolute before:inset-0 before:bg-gradient-to-br before:from-blue-500/5 before:to-purple-500/5",
        "before:opacity-0 before:transition-opacity before:duration-300",
        "hover:before:opacity-100",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Animated border glow effect */}
      <div className={cn(
        "absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20",
        "opacity-0 transition-opacity duration-300",
        isHovered && "opacity-100"
      )} />
      
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                {vault.name}
              </h3>
              <TypePill mode={vault.mode} />
            </div>
            <p className="text-sm text-gray-400">by {vault.trader.displayName}</p>
          </div>
          
          {/* TVL with animation */}
          <div className="text-right">
            <div className="text-2xl font-bold text-white tabular-nums">
              {fmtSol(vault.tvlSol)}
            </div>
            <div className="text-xs text-gray-500">TVL</div>
          </div>
        </div>
        
        {/* Performance stats */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 rounded-lg bg-gray-800/50 group-hover:bg-gray-800 transition-colors">
            <div className="text-lg font-semibold text-white tabular-nums">
              {fmtPct(vault.sharePriceSol - 1)}
            </div>
            <div className="text-xs text-gray-500">All Time</div>
          </div>
          
          <div className="text-center p-3 rounded-lg bg-gray-800/50 group-hover:bg-gray-800 transition-colors">
            <div className="text-lg font-semibold text-white tabular-nums">
              {vault.totalShares.toFixed(1)}
            </div>
            <div className="text-xs text-gray-500">Shares</div>
          </div>
          
          <div className="text-center p-3 rounded-lg bg-gray-800/50 group-hover:bg-gray-800 transition-colors">
            <div className="text-lg font-semibold text-white tabular-nums">
              {(vault.perfFeeBps / 100).toFixed(0)}%
            </div>
            <div className="text-xs text-gray-500">Fee</div>
          </div>
        </div>
        
        {/* Sparkline with hover animation */}
        <div className="h-16 mb-4">
          <Sparkline
            data={vault.equity || []}
            className={cn(
              "transition-all duration-300",
              isHovered && "opacity-100",
              !isHovered && "opacity-70"
            )}
          />
        </div>
        
        {/* Status and action */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full transition-colors duration-300",
              vault.status === 'active' ? 'bg-green-500' : 'bg-gray-500'
            )} />
            <span className="text-sm text-gray-400 capitalize">{vault.status}</span>
          </div>
          
          <button className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300",
            "bg-blue-600 hover:bg-blue-700 text-white",
            "hover:shadow-lg hover:shadow-blue-500/25",
            "transform hover:scale-105 active:scale-95"
          )}>
            {vault.mode === 'real' ? 'Trade' : 'Explore'}
          </button>
        </div>
      </div>
    </Link>
  );
}

// ── Leaderboard Card Component ─────────────────────────────────────
interface LeaderboardCardProps {
  rank: number;
  name: string;
  value: string;
  change: number;
  avatar?: string;
  isHovered?: boolean;
  className?: string;
}

export function LeaderboardCard({ 
  rank, 
  name, 
  value, 
  change, 
  avatar, 
  isHovered = false,
  className 
}: LeaderboardCardProps) {
  return (
    <div className={cn(
      "flex items-center gap-4 p-4 rounded-xl border border-gray-800 bg-gray-900/50",
      "transition-all duration-300 ease-out hover:border-gray-700 hover:bg-gray-900/80",
      isHovered && "border-blue-500/50 bg-blue-500/5",
      className
    )}>
      {/* Rank badge */}
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
        "transition-all duration-300",
        rank <= 3 ? "bg-gradient-to-br from-yellow-500 to-orange-500 text-white" : "bg-gray-800 text-gray-400",
        isHovered && "scale-110"
      )}>
        {rank}
      </div>
      
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-gray-800 overflow-hidden ring-2 ring-gray-700 ring-offset-2 ring-offset-gray-900 transition-all duration-300 hover:ring-blue-500">
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-lg font-semibold">
            {name[0].toUpperCase()}
          </div>
        )}
      </div>
      
      {/* Name and value */}
      <div className="flex-1">
        <div className="text-sm font-medium text-white">{name}</div>
        <div className="text-xs text-gray-500">{value}</div>
      </div>
      
      {/* Change with delta */}
      <Delta value={change} className="text-sm font-medium" />
    </div>
  );
}