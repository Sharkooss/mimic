/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Design system Mimic (#34) — atelier clair, accent indigo.
        canvas: '#faf9f7',
        surface: '#ffffff',
        ink: '#1c1917',
        muted: '#78716c',
        line: '#e7e5e4',
        accent: {
          DEFAULT: '#6366f1',
          soft: '#eef2ff',
          dark: '#4f46e5',
        },
        gold: '#eab308',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(28,25,23,0.04), 0 4px 16px rgba(28,25,23,0.06)',
        pop: '0 8px 30px rgba(79,70,229,0.18)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '60%': { transform: 'scale(1.03)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.35s cubic-bezier(0.22,1,0.36,1)',
        pop: 'pop 0.4s cubic-bezier(0.22,1,0.36,1)',
      },
    },
  },
  plugins: [],
};
