/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#061512',
        surface: '#0D1F1A',
        'surface-2': '#142A23',
        fg: '#F0FDF4',
        'fg-muted': '#94A3B8',
        accent: '#10B981',
        'accent-hover': '#059669',
        'on-accent': '#022C22',
        warn: '#F59E0B',
        danger: '#EF4444'
      },
      boxShadow: {
        // Top edge highlight (light) + bottom edge shadow (dark) gives a glass
        // pane the impression of being lit from above. Outer drop shadow
        // separates the card from the ambient bg.
        glass:
          '0 8px 32px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.20)',
        'glass-hover':
          '0 16px 44px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.22)',
        cta: '0 8px 24px rgba(16,185,129,0.28)'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      borderRadius: {
        card: '16px',
        btn: '12px'
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' }
        },
        'toast-out': {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-4px) scale(0.96)' }
        }
      },
      animation: {
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        'toast-in': 'toast-in 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        'toast-out': 'toast-out 240ms cubic-bezier(0.4, 0, 1, 1) forwards'
      }
    }
  },
  plugins: []
}
