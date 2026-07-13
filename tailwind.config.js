/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        ingreso: '#16a34a',
        gasto: '#dc2626',
      },
    },
  },
  plugins: [],
}
