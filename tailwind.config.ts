import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Material Design 3 inspired palette (from Stitch design system)
        primary: '#4648d4',
        'primary-container': '#6063ee',
        'primary-fixed': '#e1e0ff',
        'primary-fixed-dim': '#c0c1ff',
        'on-primary': '#ffffff',
        'on-primary-container': '#fffbff',
        'on-primary-fixed': '#07006c',
        'on-primary-fixed-variant': '#2f2ebe',

        secondary: '#8127cf',
        'secondary-container': '#9c48ea',
        'secondary-fixed': '#f0dbff',
        'secondary-fixed-dim': '#ddb7ff',
        'on-secondary': '#ffffff',
        'on-secondary-container': '#fffbff',
        'on-secondary-fixed': '#2c0051',
        'on-secondary-fixed-variant': '#6900b3',

        tertiary: '#6d4e8f',
        'tertiary-container': '#8766aa',
        'tertiary-fixed': '#efdbff',
        'tertiary-fixed-dim': '#dbb8ff',
        'on-tertiary': '#ffffff',
        'on-tertiary-container': '#fffbff',
        'on-tertiary-fixed': '#29074a',
        'on-tertiary-fixed-variant': '#573878',

        background: '#f8f9ff',
        'background-subtle': '#F9FAFB',
        'on-background': '#121c2a',

        surface: '#f8f9ff',
        'surface-bright': '#f8f9ff',
        'surface-dim': '#d0dbed',
        'surface-tint': '#494bd6',
        'surface-variant': '#d9e3f6',
        'surface-card': '#FFFFFF',
        'surface-container': '#e6eeff',
        'surface-container-low': '#eff4ff',
        'surface-container-high': '#dee9fc',
        'surface-container-highest': '#d9e3f6',
        'surface-container-lowest': '#ffffff',
        'on-surface': '#121c2a',
        'on-surface-variant': '#464554',

        'inverse-surface': '#27313f',
        'inverse-on-surface': '#eaf1ff',
        'inverse-primary': '#c0c1ff',

        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error': '#ffffff',
        'on-error-container': '#93000a',

        outline: '#767586',
        'outline-variant': '#c7c4d7',
        'border-muted': '#E5E7EB',

        'success-green': '#22C55E',

        // Legacy aliases (for gradual migration — maps old names to new)
        ink: '#121c2a',
        stone: '#464554',
        'off-white': '#f8f9ff',
        pearl: '#ffffff',
        'faded-stone': '#c7c4d7',
        'shadow-tint': '#767586',
        amber: '#4648d4',         // primary now = indigo
        'amber-hover': '#6063ee', // primary-container
        'warning-red': '#ba1a1a',
        grape: '#f0dbff',
        sunshine: '#e1e0ff',

        // Semantic aliases
        bg: '#f8f9ff',
        'surface-hover': '#eff4ff',
        border: '#E5E7EB',
        fg: '#121c2a',
        muted: '#464554',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        headline: ['Hanken Grotesk', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Geist', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Stitch design system type scale
        'display-lg': ['64px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '800' }],
        'headline-lg': ['48px', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-lg-mobile': ['32px', { lineHeight: '1.2', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '1.4', fontWeight: '600' }],
        'stat-value': ['32px', { lineHeight: '1', fontWeight: '700' }],
        'body-lg': ['18px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'label-mono': ['13px', { lineHeight: '1', letterSpacing: '0.05em', fontWeight: '500' }],
        // Legacy sizes
        caption: ['12px', { lineHeight: '1.13', letterSpacing: '0.6px' }],
        'body-sm': ['14px', { lineHeight: '1.25', letterSpacing: '-0.14px' }],
        body: ['16px', { lineHeight: '1.25', letterSpacing: '-0.16px' }],
        subheading: ['20px', { lineHeight: '1.25', letterSpacing: '-0.2px' }],
        'heading-sm': ['24px', { lineHeight: '1.25', letterSpacing: '-0.29px' }],
        heading: ['36px', { lineHeight: '1.25', letterSpacing: '-0.61px' }],
      },
      spacing: {
        section: '56px',
        'card-pad': '32px',
        'stack-sm': '8px',
        'stack-md': '16px',
        'stack-lg': '32px',
        gutter: '24px',
        'margin-mobile': '16px',
        'section-gap': '96px',
        'container-max': '1280px',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        card: '0.75rem',
        badge: '9999px',
        btn: '0.5rem',
        field: '0.5rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(18, 28, 42, 0.04), 0 1px 2px -1px rgba(18, 28, 42, 0.04)',
        elevated: '0 4px 6px -1px rgba(18, 28, 42, 0.06), 0 2px 4px -2px rgba(18, 28, 42, 0.04)',
        glass: '0 8px 32px rgba(18, 28, 42, 0.08)',
      },
      maxWidth: {
        page: '1280px',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
