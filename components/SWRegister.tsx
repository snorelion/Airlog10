'use client'

import { useEffect } from 'react'
import { sync } from '@/lib/store'

// 서비스워커 등록 + 온라인 복귀 시 자동 동기화
export default function SWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    const onOnline = () => { void sync() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])
  return null
}
