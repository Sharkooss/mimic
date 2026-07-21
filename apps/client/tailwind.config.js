/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Design system Mimic (#34) — direction « galerie / musée ».
        canvas: '#f6f2ec', // papier chaud
        surface: '#fffdfa',
        ink: '#1b1714', // encre chaude
        muted: '#8c8178',
        line: '#e9e2d8',
        accent: {
          DEFAULT: '#5b53e0',
          soft: '#ecebfe',
          dark: '#4038c4',
        },
        gold: {
          DEFAULT: '#c2982f',
          soft: '#f6edd6',
        },
        // Tons sombres « salle de musée » (hero, pied de page).
        night: {
          DEFAULT: '#17131d',
          800: '#221c2b',
          700: '#2e2739',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(27,23,20,0.04), 0 6px 20px rgba(27,23,20,0.06)',
        pop: '0 10px 34px rgba(64,56,196,0.20)',
        frame: '0 2px 4px rgba(0,0,0,0.20), 0 18px 40px rgba(0,0,0,0.30)',
        glow: '0 0 0 1px rgba(255,255,255,0.06), 0 20px 60px rgba(0,0,0,0.45)',
      },
      borderRadius: {
        xl2: '1.25rem',
        '3xl': '1.75rem',
      },
      backgroundImage: {
        'night-radial':
          'radial-gradient(120% 120% at 50% -10%, #2e2739 0%, #1c1725 45%, #141019 100%)',
        'gold-line': 'linear-gradient(90deg, transparent, #c2982f, transparent)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '60%': { transform: 'scale(1.03)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        // --- Feedback de jeu (juice) ---
        shake: {
          '0%,100%': { transform: 'translate(0,0)' },
          '15%': { transform: 'translate(-6px,3px)' },
          '30%': { transform: 'translate(5px,-4px)' },
          '45%': { transform: 'translate(-5px,-2px)' },
          '60%': { transform: 'translate(4px,4px)' },
          '75%': { transform: 'translate(-3px,2px)' },
        },
        ripple: {
          '0%': { transform: 'translate(-50%,-50%) scale(0.2)', opacity: '0.85' },
          '100%': { transform: 'translate(-50%,-50%) scale(1)', opacity: '0' },
        },
        'pop-in': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '70%': { transform: 'scale(1.18)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        rise: {
          '0%': { transform: 'translateY(14px) scale(0.85)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' },
        },
        'float-up': {
          '0%': { transform: 'translate(-50%,0) scale(0.7)', opacity: '0' },
          '25%': { transform: 'translate(-50%,-14px) scale(1.1)', opacity: '1' },
          '100%': { transform: 'translate(-50%,-56px) scale(1)', opacity: '0' },
        },
        'pulse-ring': {
          '0%': { transform: 'translate(-50%,-50%) scale(0.6)', opacity: '0.6' },
          '100%': { transform: 'translate(-50%,-50%) scale(1.6)', opacity: '0' },
        },
        heartbeat: {
          '0%,100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.09)' },
        },
        sheen: {
          '0%': { backgroundPosition: '-150% 0' },
          '60%,100%': { backgroundPosition: '250% 0' },
        },
        'confetti-fall': {
          '0%': { transform: 'translateY(-10vh) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(105vh) rotate(720deg)', opacity: '0.9' },
        },
        'grow-bar': { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
        wiggle: {
          '0%,100%': { transform: 'rotate(-6deg)' },
          '50%': { transform: 'rotate(6deg)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
        'slide-up': 'slide-up 0.5s cubic-bezier(0.22,1,0.36,1)',
        pop: 'pop 0.4s cubic-bezier(0.22,1,0.36,1)',
        float: 'float 6s ease-in-out infinite',
        marquee: 'marquee 40s linear infinite',
        shake: 'shake 0.45s ease-in-out',
        ripple: 'ripple 0.6s ease-out forwards',
        'pop-in': 'pop-in 0.45s cubic-bezier(0.34,1.56,0.64,1) both',
        rise: 'rise 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'float-up': 'float-up 1.1s cubic-bezier(0.22,1,0.36,1) forwards',
        'pulse-ring': 'pulse-ring 1.5s ease-out infinite',
        heartbeat: 'heartbeat 0.85s ease-in-out infinite',
        sheen: 'sheen 2.6s ease-in-out infinite',
        confetti: 'confetti-fall 2.4s ease-in forwards',
        'grow-bar': 'grow-bar 0.7s cubic-bezier(0.22,1,0.36,1) both',
        wiggle: 'wiggle 0.5s ease-in-out',
      },
    },
  },
  plugins: [],
};
