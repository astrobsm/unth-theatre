import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e6f7ed',
          100: '#c2ebd4',
          200: '#9ddfbb',
          300: '#78d3a2',
          400: '#53c789',
          500: '#2ebb70',
          600: '#25965a',
          700: '#1d7044',
          800: '#144a2e',
          900: '#0c2418',
        },
        secondary: {
          50: '#e6f2ff',
          100: '#c2dfff',
          200: '#9dccff',
          300: '#78b9ff',
          400: '#53a6ff',
          500: '#2e93ff',
          600: '#2576cc',
          700: '#1d5999',
          800: '#143c66',
          900: '#0c1f33',
        },
        accent: {
          50: '#fff9e6',
          100: '#ffefb8',
          200: '#ffe58a',
          300: '#ffdb5c',
          400: '#ffd12e',
          500: '#ffc700',
          600: '#cc9f00',
          700: '#997700',
          800: '#665000',
          900: '#332800',
        },
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #2eac95 0%, #3596b6 100%)',
        'gradient-secondary': 'linear-gradient(135deg, #3596b6 0%, #2a788f 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
