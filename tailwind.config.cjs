module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'Inter', 'sans-serif'],
        inter: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'Inter', 'sans-serif'],
      },
      boxShadow: { card: '0 18px 48px rgba(15, 23, 42, 0.08)' },
    },
  },
  plugins: [],
}
