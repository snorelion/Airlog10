// AirLog10 서비스워커 — 비행모드에서도 앱이 열리게 하는 캐시 계층
// 전략:
//  - 정적 자산(/_next/static, 아이콘, manifest): cache-first (내용이 해시로 불변)
//  - 페이지·RSC 요청: network-first → 실패 시 캐시 → 최후엔 '/' 캐시
//  - /api/ 와 외부(supabase 등) 요청은 절대 캐시하지 않음
const CACHE = 'airlog10-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // 불변 정적 자산: cache-first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json'
  ) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) c.put(req, res.clone())
        return res
      })
    )
    return
  }

  // 페이지·RSC: network-first, 오프라인이면 캐시
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(async () => {
        const hit = await caches.match(req)
        if (hit) return hit
        if (req.mode === 'navigate') {
          const home = await caches.match('/')
          if (home) return home
        }
        return Response.error()
      })
  )
})
