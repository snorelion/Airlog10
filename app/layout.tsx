import type { Metadata, Viewport } from 'next'
import './globals.css'
import SWRegister from '@/components/SWRegister'

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
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">
        {children}
        <SWRegister />
      </body>
    </html>
  )
}
