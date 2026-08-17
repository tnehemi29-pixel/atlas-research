import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14181c',
        paper: '#ffffff',
        bg: '#f6f7f4',
        accent: {
          DEFAULT: '#1f6f5c',
          soft: '#e3efe9',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Iowan Old Style', 'Palatino', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
