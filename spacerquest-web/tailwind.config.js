/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/frontend/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'terminal-green': '#00ff00',
        'terminal-dark': '#001100',
        'terminal-bg': '#000000',
      },
      fontFamily: {
        'terminal': ['"Courier New"', 'Courier', 'monospace'],
      },
    },
  },
  plugins: [],
}
