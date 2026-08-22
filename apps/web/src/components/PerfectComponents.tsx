// ── Perfect Frontend Components ─────────────────────────────────────
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { fmtSol, fmtPct, type Vault, type TraderProfile } from '@coffer/shared';

// ── Perfect Vault Card Component ───────────────────────────────────
export interface VaultCardProps {
  vault: Vault;
  showTrader?: boolean;
  onTraderClick?: (traderId: string) => void;
}

export function VaultCard({ vault, showTrader = true, onTraderClick }: VaultCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const performanceColor = vault.totalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400';
  const performanceSign = vault.totalPnlPercent >= 0 ? '+' : '';

  return (
    <div
      ref={cardRef}
      className={`
        bg-gray-900 border border-gray-800 rounded-xl p-6 
        transition-all duration-300 ease-out
        hover:border-gray-700 hover:shadow-2xl hover:shadow-gray-900/20
        ${isHovered ? 'transform -translate-y-1' : ''}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-white mb-1">{vault.name}</h3>
          {vault.description && (
            <p className="text-sm text-gray-400 line-clamp-2">{vault.description}</p>
          )}
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          vault.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {vault.status}
        </div>
      </div>

      {/* Trader Info */}
      {showTrader && vault.trader && (
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-xs font-bold text-black">
            {vault.trader.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">{vault.trader.name}</span>
              {vault.trader.xVerified && (
                <span className="text-blue-400" title="X Verified">✓</span>
              )}
            </div>
            {vault.trader.xHandle && (
              <span className="text-xs text-gray-500">@{vault.trader.xHandle}</span>
            )}
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">TVL</p>
          <p className="text-lg font-bold text-white">{fmtSol(vault.tvl)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">PnL</p>
          <p className={`text-lg font-bold ${performanceColor}`}>
            {performanceSign}{fmtPct(vault.totalPnlPercent)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Deposits</p>
          <p className="text-sm font-medium text-white">{vault.totalDeposits}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Positions</p>
          <p className="text-sm font-medium text-white">{vault._count.positions}</p>
        </div>
      </div>

      {/* Footer */}
      <Link
        to={`/vaults/${vault.id}`}
        className="block w-full text-center py-2 px-4 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors duration-200"
      >
        View Vault
      </Link>
    </div>
  );
}

// ── Perfect Trader Profile Card ───────────────────────────────────
export interface TraderProfileProps {
  trader: TraderProfile;
  showStats?: boolean;
  onFollow?: (traderId: string) => void;
  isFollowing?: boolean;
}

export function TraderProfileCard({ 
  trader, 
  showStats = true, 
  onFollow,
  isFollowing = false 
}: TraderProfileProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`
        bg-gray-900 border border-gray-800 rounded-xl p-6
        transition-all duration-300 ease-out
        hover:border-gray-700 hover:shadow-2xl hover:shadow-gray-900/20
        ${isHovered ? 'transform -translate-y-1' : ''}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-2xl font-bold text-black flex-shrink-0">
          {trader.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-bold text-white truncate">{trader.name}</h3>
            {trader.xVerified && (
              <span className="text-blue-400 flex-shrink-0" title="X Verified">✓</span>
            )}
          </div>
          {trader.xHandle && (
            <p className="text-sm text-gray-400">@{trader.xHandle}</p>
          )}
        </div>
      </div>

      {/* Bio */}
      {trader.bio && (
        <p className="text-sm text-gray-300 mb-4 line-clamp-2">{trader.bio}</p>
      )}

      {/* Stats */}
      {showStats && (
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-2xl font-bold text-white">{trader.totalVaults}</p>
            <p className="text-xs text-gray-500">Vaults</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{fmtSol(trader.totalTvl)}</p>
            <p className="text-xs text-gray-500">TVL</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{fmtPct(trader.avgPnlPercent)}</p>
            <p className="text-xs text-gray-500">Avg PnL</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Link
          to={`/traders/${trader.id}`}
          className="flex-1 text-center py-2 px-4 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors duration-200"
        >
          View Profile
        </Link>
        {onFollow && (
          <button
            onClick={() => onFollow(trader.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${
              isFollowing
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Perfect Loading Skeleton ───────────────────────────────────────
export function VaultCardSkeleton() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 animate-pulse">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="h-6 bg-gray-800 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-800 rounded w-1/2"></div>
        </div>
        <div className="h-6 bg-gray-800 rounded-full w-16"></div>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-gray-800"></div>
        <div className="flex-1">
          <div className="h-4 bg-gray-800 rounded w-1/3 mb-1"></div>
          <div className="h-3 bg-gray-800 rounded w-1/4"></div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i}>
            <div className="h-3 bg-gray-800 rounded w-1/2 mb-1"></div>
            <div className="h-6 bg-gray-800 rounded w-2/3"></div>
          </div>
        ))}
      </div>
      <div className="h-10 bg-gray-800 rounded-lg"></div>
    </div>
  );
}

// ── Perfect Empty State Component ─────────────────────────────────
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {icon && (
        <div className="text-gray-600 mb-4 text-6xl">
          {icon}
        </div>
      )}
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      {description && (
        <p className="text-gray-400 text-center mb-6 max-w-md">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors duration-200"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}