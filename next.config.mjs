// 기본 보안 헤더 — BJJ-log에서 검증된 구성 (CSP는 기능 안정화 후 추가)
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // exceljs는 CommonJS + Node 내장모듈 의존 — 서버 라우트에서 그대로 쓰도록 번들 제외
  experimental: {
    serverComponentsExternalPackages: ['exceljs'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}
export default nextConfig
