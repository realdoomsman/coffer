// ── Enhanced UI Components with Professional Animations ─────────────
// Modern, animated UI components for Coffer vault cards and trading interfaces

import { ReactNode, useState, useRef, useEffect } from 'react';
import { cn } from '../utils/cn';

// ── Animated Card Container ─────────────────────────────────────────
interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  click?: boolean;
  glow?: boolean;
  delay?: number;
}

export function AnimatedCard({ 
  children, 
  className, 
  hover = true, 
  click = true,
  glow = true,
  delay = 0 
}: AnimatedCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={cardRef}
      className={cn(
        // Base styles
        'relative overflow-hidden rounded-2xl',
        'bg-gradient-to-br from-gray-900/80 to-gray-950/90',
        'border border-gray-800',
        'transition-all duration-300 ease-out',
        
        // Hover effects
        hover && [
          'hover:border-blue-500/50',
          'hover:shadow-xl',
          'hover:-translate-y-1',
          glow && 'hover:shadow-blue-500/20',
        ],
        
        // Click effects
        click && [
          'active:scale-[0.98]',
          'active:translate-y-0',
        ],
        
        // Animation on mount
        'animate-in fade-in slide-in-from-bottom-4 duration-500',
        `style-[animation-delay:${delay}ms]`,
        
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
    >
      {/* Animated gradient background on hover */}
      {glow && (
        <div 
          className={cn(
            'absolute inset-0 rounded-2xl bg-gradient-to-br',
            'from-blue-500/10 via-purple-500/10 to-pink-500/10',
            'opacity-0 transition-opacity duration-300',
            isHovered && 'opacity-100'
          )}
        />
      )}
      
      {/* Subtle inner glow */}
      {glow && isHovered && (
        <div 
          className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-blue-500/5 to-transparent"
          style={{
            animation: 'glow-pulse 2s ease-in-out infinite',
          }}
        />
      )}
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

// ── Animated Counter for Numbers ─────────────────────────────────────
interface AnimatedCounterProps {
  value: number;
  duration?: number;
  formatFn?: (n: number) => string;
  className?: string;
}

export function AnimatedCounter({ 
  value, 
  duration = 1000, 
  formatFn = (n) => n.toFixed(2),
  className 
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const startTimeRef = useRef<number>();
  const startValueRef = useRef(0);
  const requestRef = useRef<number>();

  useEffect(() => {
    startValueRef.current = displayValue;
    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTimeRef.current!;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = startValueRef.current + (value - startValueRef.current) * easedProgress;
      setDisplayValue(currentValue);

      if (progress < 1) {
        requestRef.current = requestAnimationFrame(animate);
      }
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [value, duration]);

  return (
    <span className={cn('tabular-nums', className)}>
      {formatFn(displayValue)}
    </span>
  );
}

// ── Animated Status Indicator ───────────────────────────────────────
interface AnimatedStatusProps {
  status: 'active' | 'inactive' | 'warning' | 'error' | 'loading';
  label?: string;
  className?: string;
}

export function AnimatedStatus({ status, label, className }: AnimatedStatusProps) {
  const statusConfig = {
    active: {
      color: 'bg-green-500',
      shadow: 'shadow-green-500/50',
      animation: 'status-active 2s ease-in-out infinite',
    },
    inactive: {
      color: 'bg-gray-500',
      shadow: '',
      animation: '',
    },
    warning: {
      color: 'bg-amber-500',
      shadow: 'shadow-amber-500/50',
      animation: 'status-warning 1.5s ease-in-out infinite',
    },
    error: {
      color: 'bg-red-500',
      shadow: 'shadow-red-500/50',
      animation: 'status-active 1s ease-in-out infinite',
    },
    loading: {
      color: 'bg-blue-500',
      shadow: 'shadow-blue-500/50',
      animation: 'spin 1s linear infinite',
    },
  };

  const config = statusConfig[status];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'w-2 h-2 rounded-full',
          config.color,
          config.shadow && `${config.shadow} shadow-lg`,
        )}
        style={{
          animation: config.animation,
        }}
      />
      {label && (
        <span className="text-sm text-gray-400 capitalize">
          {label}
        </span>
      )}
    </div>
  );
}

// ── Animated Progress Bar ───────────────────────────────────────────
interface AnimatedProgressProps {
  value: number;
  max?: number;
  color?: 'blue' | 'green' | 'red' | 'amber' | 'purple';
  showLabel?: boolean;
  className?: string;
}

export function AnimatedProgress({ 
  value, 
  max = 100, 
  color = 'blue',
  showLabel = false,
  className 
}: AnimatedProgressProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const [displayPercentage, setDisplayPercentage] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayPercentage(percentage);
    }, 50);
    return () => clearTimeout(timer);
  }, [percentage]);

  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
    amber: 'bg-amber-500',
    purple: 'bg-purple-500',
  };

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between mb-1">
        {showLabel && (
          <span className="text-sm text-gray-400">
            {Math.round(displayPercentage)}%
          </span>
        )}
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            colorClasses[color]
          )}
          style={{
            width: `${displayPercentage}%`,
          }}
        />
      </div>
    </div>
  );
}

// ── Animated Tooltip ───────────────────────────────────────────────
interface AnimatedTooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function AnimatedTooltip({ 
  content, 
  children, 
  position = 'top',
  className 
}: AnimatedTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setIsVisible(true), 200);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 -mt-1 border-t-gray-800 border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-1 border-b-gray-800 border-l-transparent border-r-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 -ml-1 border-l-gray-800 border-t-transparent border-r-transparent border-b-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 -mr-1 border-r-gray-800 border-t-transparent border-l-transparent border-b-transparent',
  };

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div
          className={cn(
            'absolute z-50 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl',
            'text-sm text-gray-200 whitespace-nowrap',
            'animate-in fade-in zoom-in-95 duration-200',
            positionClasses[position],
            className
          )}
        >
          {content}
          <div
            className={cn(
              'absolute w-2 h-2 border-4',
              arrowClasses[position]
            )}
          />
        </div>
      )}
    </div>
  );
}

// ── Animated Badge ─────────────────────────────────────────────────
interface AnimatedBadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  pulse?: boolean;
  className?: string;
}

export function AnimatedBadge({ 
  children, 
  variant = 'default',
  pulse = false,
  className 
}: AnimatedBadgeProps) {
  const variantClasses = {
    default: 'bg-gray-800 text-gray-300 border-gray-700',
    success: 'bg-green-500/20 text-green-400 border-green-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        'transition-all duration-200',
        'hover:scale-105 active:scale-95',
        variantClasses[variant],
        pulse && 'animate-pulse',
        className
      )}
    >
      {children}
    </span>
  );
}

// ── Animated Table Row ─────────────────────────────────────────────
interface AnimatedRowProps {
  children: ReactNode;
  index: number;
  isHovered?: boolean;
  onClick?: () => void;
  className?: string;
}

export function AnimatedRow({ 
  children, 
  index, 
  isHovered = false,
  onClick,
  className 
}: AnimatedRowProps) {
  const [localHovered, setLocalHovered] = useState(false);
  const hovered = isHovered || localHovered;

  return (
    <tr
      className={cn(
        'transition-all duration-200 ease-out',
        'border-b border-gray-800',
        'hover:bg-blue-500/5',
        onClick && 'cursor-pointer',
        hovered && 'bg-blue-500/5',
        // Staggered animation on mount
        'animate-in fade-in slide-in-from-left-4 duration-300',
        `style-[animation-delay:${index * 50}ms]`,
        className
      )}
      onMouseEnter={() => setLocalHovered(true)}
      onMouseLeave={() => setLocalHovered(false)}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

// ── Skeleton Loading Component ─────────────────────────────────────
interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({ 
  className, 
  variant = 'text',
  width,
  height,
  animation = 'wave'
}: SkeletonProps) {
  const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-md',
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800 bg-[length:200%_100%]',
    none: '',
  };

  return (
    <div
      className={cn(
        'bg-gray-800',
        variantClasses[variant],
        animationClasses[animation],
        className
      )}
      style={{ 
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export default {
  AnimatedCard,
  AnimatedCounter,
  AnimatedStatus,
  AnimatedProgress,
  AnimatedTooltip,
  AnimatedBadge,
  AnimatedRow,
  Skeleton,
};
