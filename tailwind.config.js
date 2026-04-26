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
        glass:
          '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        'glass-hover':
          '0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
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
    }
  },
  plugins: []
}
