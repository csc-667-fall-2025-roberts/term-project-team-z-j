/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        poker: {
          dark: '#0a0e27',
          blue: '#1a2332',
          accent: '#2563eb',
          gold: '#fbbf24',
        }
      }
    },
  },
  plugins: [],
}
