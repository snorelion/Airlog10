import type { Metadata, Viewport } from 'next'
import { cookies, headers } from 'next/headers'
import './globals.css'
import SWRegister from '@/components/SWRegister'
import LangProvider from '@/components/LangProvider'
import OfflineWarmup from '@/components/OfflineWarmup'
import { THEME_INIT_SCRIPT } from '@/lib/theme'
import { LANG_COOKIE, resolveLang } from '@/lib/i18n/core'

// 앱 이름·설명은 영어로 고정 — 앱스토어와 공유·홈화면 추가 때 이 문구가 그대로 나가고,
// 쓰는 사람 대부분이 한국어를 못 읽는 외국 파일럿이다.
export const metadata: Metadata = {
  title: 'AirLog10',
  description: 'Pilot logbook — your flights, hours, and stats anywhere.',
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
  // 언어를 서버에서 정해 첫 HTML부터 올바른 말로 그린다(영어가 번쩍였다 바뀌는 것 방지).
  // 설정이 'auto'거나 없으면 브라우저가 보낸 Accept-Language를 따른다.
  const lang = resolveLang(cookies().get(LANG_COOKIE)?.value, headers().get('accept-language'))

  // suppressHydrationWarning: 인라인 스크립트가 서버 HTML에 없던 .dark를 붙이므로
  // <html> 클래스는 서버/클라이언트가 다를 수 있다 — 의도된 것 (BJJ-log 패턴)
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        {/* 첫 페인트 전에 테마 적용 — 나이트 사용자의 흰 화면 번쩍임 방지 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        <LangProvider initial={lang}>{children}</LangProvider>
        <SWRegister />
        {/* 온라인일 때 주요 화면을 미리 받아둔다 — 비행 전에 안 열어본 화면도 열리게 */}
        <OfflineWarmup />
      </body>
    </html>
  )
}
