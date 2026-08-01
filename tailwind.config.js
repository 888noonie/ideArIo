/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Theme-aware colors — channels live in src/styles/themes.css and
        // switch via the `data-theme` attribute on <html>.
        'ario-dark': 'rgb(var(--bg-primary) / <alpha-value>)',
        'ario-grey': 'rgb(var(--bg-secondary) / <alpha-value>)',
        'ario-card': 'rgb(var(--bg-card) / <alpha-value>)',
        'ario-turquoise': 'rgb(var(--accent-primary) / <alpha-value>)',
        'ario-red': 'rgb(var(--accent-secondary) / <alpha-value>)',
        'ario-text': 'rgb(var(--text-primary) / <alpha-value>)',
        'ario-muted': 'rgb(var(--text-muted) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse-slow 3s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'dust': 'dust 8s linear infinite',
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.05)', opacity: '0.9' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
        'glow': {
          '0%': { boxShadow: '0 0 20px rgba(0, 245, 212, 0.3)' },
          '100%': { boxShadow: '0 0 60px rgba(0, 245, 212, 0.6)' },
        },
        'dust': {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      minWidth: {
        'touch': '72px',
      },
      minHeight: {
        'touch': '72px',
      },
    },
  },
  plugins: [],
}
