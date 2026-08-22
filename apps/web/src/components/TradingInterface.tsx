// ── Professional Trading Interface Component ───────────────────────
import { useState } from 'react';
import { fmtSol, fmtPct } from '@coffer/shared';
import { cn } from '../utils/cn';

interface TradingInterfaceProps {
  vaultName: string;
  balance: number;
  currentPrice: number;
  className?: string;
}

export function TradingInterface({ vaultName, balance, currentPrice, className }: TradingInterfaceProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const handleTrade = async () => {
    setIsProcessing(true);
    // Trade execution logic here
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsProcessing(false);
    setAmount('');
  };
  
  return (
    <div className={cn(
      "rounded-2xl border border-gray-800 bg-gray-900/50 backdrop-blur-xl p-6",
      "shadow-2xl shadow-blue-500/5",
      className
    )}>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white mb-1">{vaultName}</h2>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>Balance: {fmtSol(balance)}</span>
          <span>•</span>
          <span>Price: {fmtSol(currentPrice)}</span>
        </div>
      </div>
      
      {/* Trade Side Toggle */}
      <div className="flex gap-2 mb-6 p-1 bg-gray-800 rounded-xl">
        <button
          onClick={() => setSide('buy')}
          className={cn(
            "flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-300",
            "text-sm",
            side === 'buy' 
              ? "bg-green-600 text-white shadow-lg shadow-green-500/25 scale-100" 
              : "text-gray-400 hover:text-white hover:bg-gray-700 scale-95"
          )}
        >
          Buy
        </button>
        <button
          onClick={() => setSide('sell')}
          className={cn(
            "flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-300",
            "text-sm",
            side === 'sell' 
              ? "bg-red-600 text-white shadow-lg shadow-red-500/25 scale-100" 
              : "text-gray-400 hover:text-white hover:bg-gray-700 scale-95"
          )}
        >
          Sell
        </button>
      </div>
      
      {/* Amount Input */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-gray-400">Amount (SOL)</label>
          <span className="text-xs text-gray-500">{fmtSol(balance)} available</span>
        </div>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={cn(
              "w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700",
              "text-white placeholder-gray-500 text-lg font-medium tabular-nums",
              "focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
              "transition-all duration-300",
              "hover:border-gray-600"
            )}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
            {['25%', '50%', '100%'].map((percent) => (
              <button
                key={percent}
                onClick={() => setAmount(((balance * parseFloat(percent)) / 100).toFixed(4))}
                className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-blue-600 hover:text-white transition-all duration-200"
              >
                {percent}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Trade Summary */}
      {amount && (
        <div className="mb-6 p-4 rounded-xl bg-gray-800/50 border border-gray-700/50">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">You {side}</span>
            <span className="text-white font-medium">{fmtSol(parseFloat(amount))}</span>
          </div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">At price</span>
            <span className="text-white font-medium">{fmtSol(currentPrice)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">You receive</span>
            <span className="text-white font-medium tabular-nums">
              {fmtSol(parseFloat(amount) / currentPrice)}
            </span>
          </div>
        </div>
      )}
      
      {/* Execute Button */}
      <button
        onClick={handleTrade}
        disabled={!amount || isProcessing}
        className={cn(
          "w-full py-4 rounded-xl font-bold text-white text-lg",
          "transition-all duration-300 transform active:scale-98",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
          side === 'buy'
            ? "bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 shadow-lg shadow-green-500/25 hover:shadow-green-500/50"
            : "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-lg shadow-red-500/25 hover:shadow-red-500/50",
          isProcessing && "animate-pulse"
        )}
      >
        {isProcessing ? 'Processing...' : `${side === 'buy' ? 'Buy' : 'Sell'} SOL`}
      </button>
      
      {/* Additional Info */}
      <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500">
        <span>Slippage: 1%</span>
        <span>•</span>
        <span>Fee: 0.3%</span>
        <span>•</span>
        <span>Route: Jupiter</span>
      </div>
    </div>
  );
}

// ── Professional Chart Component with Enhanced Features ───────────
interface ProfessionalChartProps {
  data: Array<{ time: number; value: number }>;
  symbol: string;
  timeframe: string;
  onTimeframeChange: (tf: string) => void;
  className?: string;
}

export function ProfessionalChart({ data, symbol, timeframe, onTimeframeChange, className }: ProfessionalChartProps) {
  const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d'];
  
  return (
    <div className={cn(
      "rounded-2xl border border-gray-800 bg-gray-900/50 backdrop-blur-xl p-6",
      "shadow-2xl shadow-blue-500/5",
      className
    )}>
      {/* Chart Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-white">{symbol}</h3>
          <div className="text-2xl font-bold text-white tabular-nums mt-1">
            {data.length > 0 ? fmtSol(data[data.length - 1].value) : '0.00'}
          </div>
        </div>
        
        <div className="flex gap-2">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                timeframe === tf
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/25"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              )}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      
      {/* Chart Area */}
      <div className="h-64 relative">
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          {/* Chart rendering would go here */}
          <div className="text-center">
            <div className="text-sm mb-2">Professional Chart Component</div>
            <div className="text-xs text-gray-600">Integrate with your charting library</div>
          </div>
        </div>
      </div>
      
      {/* Chart Stats */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">24h High</div>
          <div className="text-sm font-semibold text-white tabular-nums">
            {data.length > 0 ? fmtSol(Math.max(...data.map(d => d.value))) : '0.00'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">24h Low</div>
          <div className="text-sm font-semibold text-white tabular-nums">
            {data.length > 0 ? fmtSol(Math.min(...data.map(d => d.value))) : '0.00'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">Volume</div>
          <div className="text-sm font-semibold text-white tabular-nums">
            {fmtSol(data.length * 1000)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">Change</div>
          <div className={cn(
            "text-sm font-semibold tabular-nums",
            data.length > 1 && data[data.length - 1].value > data[0].value 
              ? "text-green-500" 
              : "text-red-500"
          )}>
            {data.length > 1 ? fmtPct((data[data.length - 1].value - data[0].value) / data[0].value) : '0.00%'}
          </div>
        </div>
      </div>
    </div>
  );
}