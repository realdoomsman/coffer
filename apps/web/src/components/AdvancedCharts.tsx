// ── Advanced Price Chart Component ─────────────────────────────────
import { useState, useRef, useEffect } from 'react';
import { fmtSol, fmtPct } from '@coffer/shared';
import { cn } from '../utils/cn';

interface PriceChartProps {
  data: Array<{ time: number; value: number; volume?: number }>;
  symbol: string;
  className?: string;
}

export function PriceChart({ data, symbol, className }: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Canvas dimensions
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    const width = rect.width;
    const height = rect.height;
    const padding = { top: 20, right: 60, bottom: 30, left: 10 };
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Calculate scales
    const values = data.map(d => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const valRange = maxVal - minVal;
    
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Draw grid lines
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.3)';
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      
      // Y-axis labels
      const value = maxVal - (valRange / 5) * i;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(fmtSol(value), width - padding.right + 5, y + 3);
    }
    
    // Draw price line
    ctx.beginPath();
    ctx.strokeStyle = data[data.length - 1].value >= data[0].value ? '#10b981' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    data.forEach((point, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartWidth;
      const y = padding.top + chartHeight - ((point.value - minVal) / valRange) * chartHeight;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Fill gradient under the line
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    const isPositive = data[data.length - 1].value >= data[0].value;
    
    gradient.addColorStop(0, isPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)');
    gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
    
    ctx.lineTo(padding.left + chartWidth, height - padding.bottom);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Draw hover crosshair
    if (hoveredPoint !== null && mousePosition) {
      const point = data[hoveredPoint];
      const x = padding.left + (hoveredPoint / (data.length - 1)) * chartWidth;
      const y = padding.top + chartHeight - ((point.value - minVal) / valRange) * chartHeight;
      
      // Vertical line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.5)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Horizontal line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.5)';
      ctx.setLineDash([5, 5]);
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Point circle
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#0ea5e9';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Tooltip
      const tooltipX = x + 15;
      const tooltipY = y - 15;
      
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath();
      ctx.roundRect(tooltipX, tooltipY - 40, 120, 50, 6);
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      ctx.fillStyle = '#fff';
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Price: ${fmtSol(point.value)}`, tooltipX + 10, tooltipY - 20);
      
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText(new Date(point.time).toLocaleTimeString(), tooltipX + 10, tooltipY - 5);
    }
  }, [data, hoveredPoint, mousePosition]);
  
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    const padding = { top: 20, right: 60, bottom: 30, left: 10 };
    const chartWidth = rect.width - padding.left - padding.right;
    
    const xInChart = x - padding.left;
    const index = Math.round((xInChart / chartWidth) * (data.length - 1));
    
    if (index >= 0 && index < data.length) {
      setHoveredPoint(index);
      setMousePosition({ x, y: e.clientY - rect.top });
    } else {
      setHoveredPoint(null);
      setMousePosition(null);
    }
  };
  
  const handleMouseLeave = () => {
    setHoveredPoint(null);
    setMousePosition(null);
  };
  
  return (
    <div className={cn("relative w-full h-64", className)}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
}

// ── Advanced Order Book Component ───────────────────────────────────
interface OrderBookProps {
  asks: Array<{ price: number; amount: number; total: number }>;
  bids: Array<{ price: number; amount: number; total: number }>;
  className?: string;
}

export function OrderBook({ asks, bids, className }: OrderBookProps) {
  const maxTotal = Math.max(
    ...asks.map(o => o.total),
    ...bids.map(o => o.total)
  );
  
  return (
    <div className={cn(
      "rounded-2xl border border-gray-800 bg-gray-900/50 backdrop-blur-xl p-4",
      "shadow-2xl shadow-blue-500/5",
      className
    )}>
      {/* Header */}
      <div className="flex justify-between text-xs text-gray-500 mb-3 px-2">
        <span>Price (SOL)</span>
        <span>Amount</span>
        <span>Total</span>
      </div>
      
      {/* Asks (red, reversed) */}
      <div className="space-y-1 mb-2">
        {asks.slice(0, 8).reverse().map((ask, i) => (
          <div
            key={`ask-${i}`}
            className="relative flex justify-between items-center px-2 py-1 rounded-lg hover:bg-gray-800/50 transition-colors group"
          >
            <div 
              className="absolute right-0 top-0 bottom-0 bg-red-500/10 rounded-lg"
              style={{ width: `${(ask.total / maxTotal) * 100}%` }}
            />
            <span className="relative text-red-400 text-sm font-medium tabular-nums">
              {fmtSol(ask.price)}
            </span>
            <span className="relative text-gray-400 text-xs tabular-nums w-20 text-right">
              {ask.amount.toFixed(2)}
            </span>
            <span className="relative text-gray-500 text-xs tabular-nums w-20 text-right">
              {fmtSol(ask.total)}
            </span>
          </div>
        ))}
      </div>
      
      {/* Spread */}
      <div className="flex justify-between items-center py-2 px-2 border-t border-b border-gray-700 my-2">
        <span className="text-lg font-bold text-white tabular-nums">
          {fmtSol(bids[0]?.price || 0)}
        </span>
        <span className="text-xs text-gray-500">
          Spread: {asks[0] && bids[0] ? fmtPct((asks[0].price - bids[0].price) / bids[0].price) : '0.00%'}
        </span>
        <span className="text-lg font-bold text-white tabular-nums">
          {fmtSol(asks[0]?.price || 0)}
        </span>
      </div>
      
      {/* Bids (green) */}
      <div className="space-y-1 mt-2">
        {bids.slice(0, 8).map((bid, i) => (
          <div
            key={`bid-${i}`}
            className="relative flex justify-between items-center px-2 py-1 rounded-lg hover:bg-gray-800/50 transition-colors group"
          >
            <div 
              className="absolute right-0 top-0 bottom-0 bg-green-500/10 rounded-lg"
              style={{ width: `${(bid.total / maxTotal) * 100}%` }}
            />
            <span className="relative text-green-400 text-sm font-medium tabular-nums">
              {fmtSol(bid.price)}
            </span>
            <span className="relative text-gray-400 text-xs tabular-nums w-20 text-right">
              {bid.amount.toFixed(2)}
            </span>
            <span className="relative text-gray-500 text-xs tabular-nums w-20 text-right">
              {fmtSol(bid.total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}