/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // AirLog10 브랜드 — 항공 네이비/스카이 계단 (600 = 메인)
        air: {
          50: '#EDF5FC',
          100: '#D2E6F8',
          200: '#A5CCF0',
          400: '#4A94DB',
          600: '#1B5E9E',
          800: '#0D3D6E',
          900: '#062948',
        },
        // 중립 회색 — 역할 고정 (BJJ-log과 동일 톤)
        ink: {
          bg: '#F9FAFB',
          line: '#E5E7EB',
          hint: '#9CA3AF',
          sub: '#4B5563',
          body: '#111827',
        },
      },
    },
  },
  plugins: [],
}
