import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#261b07',
        stone: '#61594a',
        'off-white': '#f8f7f5',
        pearl: '#ffffff',
        'faded-stone': '#e3dfd5',
        'shadow-tint': '#aca89f',
        amber: '#f9a600',
        'sunset-orange': '#e89b01',
        'warning-red': '#f0624f',
        grape: '#d5befa',
        sunshine: '#f8da9d',
        // Semantic aliases
        bg: '#f8f7f5',
        surface: '#ffffff',
        border: '#e3dfd5',
        fg: '#261b07',
        muted: '#61594a',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
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
        'heading-lg': ['56px', { lineHeight: '1.13', letterSpacing: '-1.06px' }],
        display: ['72px', { lineHeight: '1', letterSpacing: '-1.58px' }],
      },
      fontWeight: {
        normal: '400',
        medium: '492',
        semibold: '584',
      },
      spacing: {
        '4.5': '18px',
        '7.5': '30px',
        '14': '56px',
        '16': '63px',
        '26': '105px',
      },
      maxWidth: {
        page: '1216px',
      },
      borderRadius: {
        card: '12px',
        badge: '6px',
        btn: '8px',
        field: '4px',
      },
      boxShadow: {
        card: '0px 4px 8px 0px rgba(38, 27, 7, 0.06)',
        elevated:
          'inset 0px 2px 4px 0px rgba(255, 255, 255, 0.56), 0px 4px 8px 0px rgba(38, 27, 7, 0.06), 0px 1px 2px 0px rgba(38, 27, 7, 0.36)',
      },
      gap: {
        section: '56px',
        element: '4px',
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
