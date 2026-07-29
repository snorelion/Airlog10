'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { OFFLINE_ROUTES } from '@/lib/offline-routes'

// 비행 전에 앱을 한 번도 안 열어본 화면도 비행기모드에서 열리게 —
// 온라인일 때 화면이 한가한 틈에 주요 화면을 미리 받아둔다.
//
// 받아두는 것은 두 가지, 역할이 다르다:
//   · router.prefetch — ①Next.js의 임시 기억을 채우고(오프라인 첫 몇 분간
//     탭 이동이 부드러운 이유) ②그 화면을 움직이는 코드(JS 청크)를 내려받는다.
//     청크는 서비스워커를 지나며 정적 자산으로 캐시에 담긴다.
//     (미리받기 조각 자체는 캐시에 담지 않는다 — 반쪽짜리라 오프라인에서
//      내주면 오히려 화면 전환이 멈췄다. 2026-07-29 실측)
//   · fetch(HTML) — 서비스워커 캐시에 완성된 페이지를 담는다. 임시 기억이
//     만료된 뒤에도 화면이 확실히 열리게 하는 보장 장치.
//
// 목록은 lib/offline-routes.ts 한 곳에만 — 상태 표시(OfflineStatus)와 같은 것을 본다
const ROUTES = OFFLINE_ROUTES.map((r) => r.path)

// 로그인 전 화면에서는 돌 필요가 없다 (미들웨어가 로그인으로 되돌린다)
const SKIP = ['/login', '/privacy', '/terms']

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
}

export default function OfflineWarmup() {
  const router = useRouter()
  const pathname = usePathname()
  const started = useRef(false)

  // 로그인 화면에서 시작했다면 로그인을 마치고 넘어온 시점에 돌아야 한다.
  // 다만 화면을 옮길 때마다 effect가 다시 도는 것은 곤란하다 — 정리(cleanup)가
  // 진행 중이던 미리 받기를 취소해 버린다. 그래서 "돌아도 되는 화면인가"라는
  // 참/거짓만 의존성으로 두어, 로그인 화면을 벗어나는 그 한 번만 다시 돈다.
  const allowed = !SKIP.includes(pathname)

  useEffect(() => {
    if (!allowed || started.current) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    started.current = true

    let cancelled = false
    let idleId: number | null = null
    let i = 0
    const w = window as IdleWindow

    // 한 번에 몰아서 던지지 않고 하나씩 — 첫 화면의 네트워크를 뺏지 않으려고
    const step = () => {
      if (cancelled || i >= ROUTES.length) return
      const route = ROUTES[i++]
      if (route !== pathname) {
        // 조각(RSC) — 앱 안에서 탭을 눌러 이동할 때 쓰인다
        router.prefetch(route)
        // 완성된 페이지(HTML) — 주소로 직접 열거나, 조각이 없어 하드 이동으로
        // 넘어갈 때 쓰인다. 조각만 받아두면 그 상황에서 아무것도 안 열린다
        // (2026-07-28 실측: 비행기모드에서 화면 전환이 아예 안 되던 원인).
        void fetch(route, { credentials: 'same-origin' }).catch(() => {})
      }
      schedule()
    }

    const schedule = () => {
      if (cancelled) return
      if (w.requestIdleCallback) {
        // 브라우저가 한가할 때. 계속 바쁘면 3초 뒤엔 그냥 진행
        idleId = w.requestIdleCallback(step, { timeout: 3000 })
      } else {
        idleId = window.setTimeout(step, 400) as unknown as number
      }
    }

    // 첫 화면이 자리 잡을 시간을 준 뒤 시작
    const startId = window.setTimeout(schedule, 1500)

    return () => {
      cancelled = true
      window.clearTimeout(startId)
      if (idleId !== null) {
        if (w.cancelIdleCallback) w.cancelIdleCallback(idleId)
        else window.clearTimeout(idleId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed])

  return null
}
