// ── Coffer Design System ───────────────────────────────────────────
// Modern dark theme with professional styling and animations

// Color Palette - Dark Theme
export const colors = {
  // Primary colors
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
  },
  
  // Accent colors
  accent: {
    purple: '#a855f7',
    pink: '#ec4899',
    emerald: '#10b981',
    amber: '#f59e0b',
    red: '#ef4444',
  },
  
  // Dark theme background
  background: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
  
  // Foreground
  foreground: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
  
  // Status colors
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
};

// Typography
export const typography = {
  fontFamily: {
    sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
    mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
};

// Spacing
export const spacing = {
  xs: '0.5rem',
  sm: '0.75rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
  '3xl': '4rem',
};

// Border radius
export const borderRadius = {
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  full: '9999px',
};

// Shadows
export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  glow: '0 0 20px rgba(14, 165, 233, 0.3)',
  glowSuccess: '0 0 20px rgba(16, 185, 129, 0.3)',
  glowError: '0 0 20px rgba(239, 68, 68, 0.3)',
};

// Animations
export const animations = {
  // Fade in
  fadeIn: 'fadeIn 0.2s ease-in-out',
  fadeInUp: 'fadeInUp 0.3s ease-out',
  fadeInDown: 'fadeInDown 0.3s ease-out',
  
  // Slide
  slideIn: 'slideIn 0.3s ease-out',
  slideOut: 'slideOut 0.3s ease-in',
  
  // Scale
  scaleIn: 'scaleIn 0.2s ease-out',
  scaleOut: 'scaleOut 0.2s ease-in',
  
  // Pulse
  pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  
  // Shimmer
  shimmer: 'shimmer 1.5s infinite',
  
  // Bounce
  bounce: 'bounce 1s infinite',
};

// Animation keyframes
export const keyframes = {
  fadeIn: `
    from { opacity: 0; }
    to { opacity: 1; }
  `,
  fadeInUp: `
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  `,
  fadeInDown: `
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  `,
  slideIn: `
    from { transform: translateX(-10px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  `,
  slideOut: `
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(-10px); opacity: 0; }
  `,
  scaleIn: `
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  `,
  scaleOut: `
    from { transform: scale(1); opacity: 1; }
    to { transform: scale(0.95); opacity: 0; }
  `,
  pulse: `
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  `,
  shimmer: `
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  `,
  bounce: `
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  `,
};

// Transitions
export const transitions = {
  fast: '0.1s ease-in-out',
  normal: '0.2s ease-in-out',
  slow: '0.3s ease-in-out',
  bounce: '0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
};

// Z-index scale
export const zIndex = {
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  modalBackdrop: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
};

// Breakpoints
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

// Export theme object
export const theme = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  animations,
  keyframes,
  transitions,
  zIndex,
  breakpoints,
};

// CSS utility functions
export const css = {
  // Flexbox utilities
  flex: {
    center: 'display: flex; align-items: center; justify-content: center;',
    between: 'display: flex; align-items: center; justify-content: space-between;',
    start: 'display: flex; align-items: center; justify-content: flex-start;',
    end: 'display: flex; align-items: center; justify-content: flex-end;',
    column: 'display: flex; flex-direction: column;',
  },
  
  // Grid utilities
  grid: {
    cols: (cols: number) => `display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr));`,
    gap: (gap: string) => `gap: ${gap};`,
  },
  
  // Text utilities
  text: {
    gradient: 'background: linear-gradient(135deg, #0ea5e9 0%, #a855f7 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;',
    glow: 'text-shadow: 0 0 10px rgba(14, 165, 233, 0.5);',
  },
  
  // Background utilities
  bg: {
    gradient: 'background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);',
    glass: 'background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);',
  },
  
  // Border utilities
  border: {
    gradient: 'border-image: linear-gradient(135deg, #0ea5e9 0%, #a855f7 100%) 1;',
    glow: 'box-shadow: 0 0 10px rgba(14, 165, 233, 0.3);',
  },
  
  // Animation utilities
  animate: {
    fadeIn: `animation: ${keyframes.fadeIn} 0.2s ease-in-out;`,
    slideIn: `animation: ${keyframes.slideIn} 0.3s ease-out;`,
    pulse: `animation: ${keyframes.pulse} 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;`,
  },
  
  // Responsive utilities
  responsive: {
    mobile: '@media (max-width: 768px)',
    desktop: '@media (min-width: 769px)',
  },
};

export default theme;