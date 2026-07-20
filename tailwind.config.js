/** @type {import('tailwindcss').Config} */
module.exports = {
  // 'class' = .dark가 붙은 곳만 다크모드. <html>의 .dark는 layout 인라인 스크립트가
  // 쿠키(airlog_theme)를 읽어 첫 페인트 전에 붙인다. (BJJ-log 패턴)
  darkMode: 'class',
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 표면 색 — globals.css의 CSS 변수를 읽으므로 .dark에서 자동으로 뒤집힌다
        app: {
          bg: 'rgb(var(--app-bg-rgb) / <alpha-value>)',
          surface: 'rgb(var(--app-surface-rgb) / <alpha-value>)',
          line: 'rgb(var(--app-line-rgb) / <alpha-value>)',
          text: 'rgb(var(--app-text-rgb) / <alpha-value>)',
          sub: 'rgb(var(--app-sub-rgb) / <alpha-value>)',
          hint: 'rgb(var(--app-hint-rgb) / <alpha-value>)',
          accent: 'rgb(var(--app-accent-rgb) / <alpha-value>)',
          btn: 'rgb(var(--app-btn-rgb) / <alpha-value>)',
          'accent-soft': 'rgb(var(--app-accent-soft-rgb) / <alpha-value>)',
        },
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
