import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Runway-inspired warm palette
        ink: '#261b07',
        stone: '#61594a',
        'off-white': '#f8f7f5',
        pearl: '#ffffff',
        'faded-stone': '#e3dfd5',
        'shadow-tint': '#aca89f',
        amber: '#f9a600',
        'amber-hover': '#e89b01',
        'warning-red': '#f0624f',
        grape: '#d5befa',
        sunshine: '#f8da9d',

        // Semantic aliases (used across the app)
        bg: '#f8f7f5',
        surface: '#ffffff',
        'surface-hover': '#f8f7f5',
        border: '#e3dfd5',
        primary: '#f9a600',
        'primary-hover': '#e89b01',
        fg: '#261b07',
        muted: '#61594a',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      fontSize: {
        caption: ['12px', { lineHeight: '1.13', letterSpacing: '0.6px' }],
        'body-sm': ['14px', { lineHeight: '1.25', letterSpacing: '-0.14px' }],
        body: ['16px', { lineHeight: '1.25', letterSpacing: '-0.16px' }],
        subheading: ['20px', { lineHeight: '1.25', letterSpacing: '-0.2px' }],
        'heading-sm': ['24px', { lineHeight: '1.25', letterSpacing: '-0.29px' }],
        heading: ['36px', { lineHeight: '1.25', letterSpacing: '-0.61px' }],
      },
      spacing: {
        'section': '56px',
        'card-pad': '32px',
      },
      borderRadius: {
        card: '12px',
        badge: '6px',
        btn: '8px',
        field: '4px',
      },
      boxShadow: {
        card: '0px 4px 8px 0px rgba(38,27,7,0.06)',
        elevated:
          'inset 0px 2px 4px 0px rgba(255,255,255,0.56), 0px 4px 8px 0px rgba(38,27,7,0.06), 0px 1px 2px 0px rgba(38,27,7,0.36)',
      },
      maxWidth: {
        page: '1216px',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
