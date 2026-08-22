// ── Perfect Page Layouts ───────────────────────────────────────────
import { useState, useEffect } from 'react';
import { VaultCard, EmptyState, VaultCardSkeleton } from './PerfectComponents';
import type { Vault, TraderProfile } from '@coffer/shared';

// ── Perfect Vaults Page ───────────────────────────────────────────
export function VaultsPage() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    sortBy: 'tvl',
    sortOrder: 'desc'
  });

  useEffect(() => {
    async function fetchVaults() {
      try {
        setLoading(true);
        const response = await fetch(`/api/vaults?sort=${filters.sortBy}&order=${filters.sortOrder}`);
        if (!response.ok) throw new Error('Failed to fetch vaults');
        const data = await response.json();
        setVaults(data.vaults || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchVaults();
  }, [filters]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <VaultCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Error Loading Vaults"
          description={error}
          action={{
            label: 'Retry',
            onClick: () => window.location.reload()
          }}
        />
      </div>
    );
  }

  if (vaults.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="No Vaults Found"
          description="Create your first vault to get started with copy trading."
          action={{
            label: 'Create Vault',
            onClick: () => window.location.href = '/create-vault'
          }}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Explore Vaults</h1>
          <p className="text-gray-400">
            {vaults.length} vault{vaults.length !== 1 ? 's' : ''} available for copy trading
          </p>
        </div>
        
        {/* Filters */}
        <div className="flex gap-2 mt-4 md:mt-0">
          <select
            value={filters.sortBy}
            onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="tvl">Sort by TVL</option>
            <option value="totalPnlPercent">Sort by PnL</option>
            <option value="totalDeposits">Sort by Deposits</option>
          </select>
          <select
            value={filters.sortOrder}
            onChange={(e) => setFilters(prev => ({ ...prev, sortOrder: e.target.value }))}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="desc">Highest First</option>
            <option value="asc">Lowest First</option>
          </select>
        </div>
      </div>

      {/* Vaults Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vaults.map((vault) => (
          <VaultCard key={vault.id} vault={vault} />
        ))}
      </div>
    </div>
  );
}

// ── Perfect Trading Page ─────────────────────────────────────────
export function TradingPage() {
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);
  const [amount, setAmount] = useState('');
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [loading, setLoading] = useState(false);

  const handleTrade = async () => {
    if (!selectedVault || !amount) return;

    try {
      setLoading(true);
      const response = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultId: selectedVault.id,
          type: tradeType,
          amount: parseFloat(amount)
        })
      });

      if (!response.ok) throw new Error('Trade failed');
      
      // Clear form on success
      setAmount('');
      setSelectedVault(null);
    } catch (err) {
      console.error('Trade error:', err);
      // Show error to user
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Trade Panel */}
        <div className="lg:col-span-1">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 sticky top-8">
            <h2 className="text-xl font-bold text-white mb-6">Trade</h2>
            
            {/* Trade Type Toggle */}
            <div className="flex bg-gray-800 rounded-lg p-1 mb-6">
              <button
                onClick={() => setTradeType('buy')}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  tradeType === 'buy'
                    ? 'bg-green-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setTradeType('sell')}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  tradeType === 'sell'
                    ? 'bg-red-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Sell
              </button>
            </div>

            {/* Amount Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-400 mb-2">Amount (SOL)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Vault Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-400 mb-2">Vault</label>
              <select
                value={selectedVault?.id || ''}
                onChange={(e) => {
                  const vault = vaults.find(v => v.id === e.target.value);
                  setSelectedVault(vault || null);
                }}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
              >
                <option value="">Select a vault</option>
                {vaults.map((vault) => (
                  <option key={vault.id} value={vault.id}>
                    {vault.name} - {vault.tvl} SOL
                  </option>
                ))}
              </select>
            </div>

            {/* Trade Button */}
            <button
              onClick={handleTrade}
              disabled={!selectedVault || !amount || loading}
              className={`w-full py-3 rounded-lg font-medium transition-colors ${
                !selectedVault || !amount || loading
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : tradeType === 'buy'
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
            >
              {loading ? 'Processing...' : `${tradeType === 'buy' ? 'Buy' : 'Sell'} Shares`}
            </button>
          </div>
        </div>

        {/* Market Overview */}
        <div className="lg:col-span-2">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-6">Market Overview</h2>
            {/* Add market overview charts and data here */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-400 mb-1">Total TVL</p>
                <p className="text-2xl font-bold text-white">12,345 SOL</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-400 mb-1">24h Volume</p>
                <p className="text-2xl font-bold text-white">1,234 SOL</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-400 mb-1">Active Vaults</p>
                <p className="text-2xl font-bold text-white">45</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}