'use client'

import { useEffect, useState } from 'react'
import { Plane } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { settings as dict } from '@/lib/i18n/settings'
import { OFFLINE_ROUTES } from '@/lib/offline-routes'

// 비행기모드에서 어느 화면이 열릴지 미리 보여준다.
//
// 이게 없으면 확인할 방법이 "비행기모드로 바꿔서 하나씩 눌러보기"뿐이라,
// 한 번 확인에 몇 분씩 걸리고 안 될 때 원인도 추측이 된다.
//
// 판정 기준 (서비스워커 v6, 2026-07-29 이후):
//   · 완성된 페이지(HTML)가 있으면 ✓ — 어떤 경로로 들어가도 확실히 열린다.
//     (조각이 없으면 서비스워커가 일부러 실패시켜 하드 이동 → HTML로 연다)
//   · 실제 방문 조각(RSC)만 있으면 ◐ — 탭 이동은 되지만 주소로 직접 열면 홈으로 감
type Readiness = 'full' | 'partial' | 'none'

export default function OfflineStatus() {
  const L = useT(dict)
  const [state, setState] = useState<Record<string, Readiness>>({})
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined' || !('caches' in window)) {
      setSupported(false)
      return
    }
    let timer: number | undefined
    let cancelled = false
    let rounds = 0

    const check = async () => {
      const next: Record<string, Readiness> = {}
      for (const r of OFFLINE_ROUTES) {
        const base = location.origin + r.path
        // caches.match는 모든 캐시를 뒤진다 — 캐시 이름을 몰라도 된다
        const html = await caches.match(base)
        const rsc = await caches.match(base + '?__rsc=1')
        next[r.path] = html ? 'full' : rsc ? 'partial' : 'none'
      }
      if (cancelled) return
      setState(next)
      rounds += 1
      // 미리 받기가 뒤에서 도는 중이라 잠시 뒤엔 채워진다 — 다 찰 때까지 몇 번 더 본다
      const allReady = OFFLINE_ROUTES.every((r) => next[r.path] === 'full')
      if (!allReady && rounds < 8) timer = window.setTimeout(check, 5000)
    }

    void check()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  if (!supported) return null

  const ready = OFFLINE_ROUTES.filter((r) => state[r.path] === 'full').length
  const total = OFFLINE_ROUTES.length
  const allReady = ready === total

  return (
    <div className="rounded-2xl border border-app-line bg-app-surface p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Plane size={18} className="text-app-sub" />
        {L.offlineTitle}
      </h2>
      <p className="mt-1 text-xs text-app-hint">
        {allReady ? L.offlineAllReady : L.offlineHint}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {OFFLINE_ROUTES.map((r) => {
          const s = state[r.path]
          return (
            <div key={r.path} className="flex items-center justify-between text-sm">
              <span className="text-app-sub">{L[r.labelKey]}</span>
              <span
                className={
                  s === 'full'
                    ? 'text-green-600 dark:text-green-400'
                    : s === 'partial'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-app-hint'
                }
              >
                {s === 'full' ? '✓' : s === 'partial' ? '◐' : '—'}
              </span>
            </div>
          )
        })}
      </div>

      <p className="mt-2.5 text-center text-[11px] text-app-hint">
        {ready} / {total}
      </p>
    </div>
  )
}
