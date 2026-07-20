import type { Metadata, Viewport } from 'next'
import './globals.css'
import SWRegister from '@/components/SWRegister'
import { THEME_INIT_SCRIPT } from '@/lib/theme'

export const metadata: Metadata = {
  title: 'AirLog10',
  description: '파일럿 로그북 — 비행 기록, 통계, 어디서나.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'AirLog10',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0D3D6E',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning: 인라인 스크립트가 서버 HTML에 없던 .dark를 붙이므로
  // <html> 클래스는 서버/클라이언트가 다를 수 있다 — 의도된 것 (BJJ-log 패턴)
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 첫 페인트 전에 테마 적용 — 나이트 사용자의 흰 화면 번쩍임 방지 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <SWRegister />
      </body>
    </html>
  )
}
