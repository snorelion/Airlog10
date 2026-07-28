// AirLog10 서비스워커 — 비행모드에서도 앱이 열리게 하는 캐시 계층
// 전략:
//  - 정적 자산(/_next/static, 아이콘, manifest): cache-first (내용이 해시로 불변)
//  - 페이지·RSC 요청: network-first → 실패 시 캐시 → 최후엔 '/' 캐시
//  - /api/ 와 외부(supabase 등) 요청은 절대 캐시하지 않음
// manifest.json도 cache-first라, 매니페스트를 고치면 이 번호를 올려야 전달된다.
// v6: 캐시 키 규칙을 바꿨다(아래 fetch 참고) — 옛 키로 담긴 것은 못 찾으므로 새로 시작
const CACHE = 'airlog10-v6'

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
  //
  // 같은 화면이라도 요청 형태가 두 가지다.
  //   · 주소로 직접 열 때(navigate) → 완성된 HTML
  //   · 앱 안에서 탭을 누를 때      → Next.js 전용 조각(RSC). ?_rsc=<해시>가 붙는다
  // 둘을 한 서랍에 넣으면 조각을 달라는데 HTML을 꺼내주게 되고, Next.js가 못 읽어
  // 하드 이동으로 넘어갔다가 결국 홈으로 튕긴다.
  // (2026-07-28 실측: 비행기모드 30초 뒤 — Next.js가 라우터 임시 기억을 버리는
  //  시점 — 부터 모든 화면이 홈으로 튕겼다.)
  //
  // 그래서 캐시 키를 이렇게 정한다:
  //   실제로 이동한 조각 → <경로>?__rsc=1    (매번 바뀌는 _rsc 해시를 지운다)
  //   미리 받아둔 조각   → <경로>?__rscp=1
  //   그 외(HTML)        → <경로>            (쿼리를 지운다)
  //
  // 미리 받기를 따로 두는 이유: Next.js가 미리 받기에 주는 조각은 실제로 이동할 때
  // 받는 것보다 내용이 적을 수 있다. 한 서랍에 담으면 온라인에서 제대로 받아둔 것을
  // 덜 완전한 것이 덮어써, 정작 오프라인에서 화면이 부실해진다.
  //
  // 쿼리를 지워도 되는 이유: 이 앱의 쿼리(?year=·?edit=)는 서버가 아니라 클라이언트
  // 코드가 읽어 처리한다. 덕분에 /flights/new?edit=<id> 도 미리 받아둔 /flights/new
  // 캐시로 열린다(예전 ignoreSearch 폴백이 하던 일).
  const isRSC = url.searchParams.has('_rsc') || req.headers.get('RSC') === '1'
  const isPrefetch = req.headers.get('Next-Router-Prefetch') === '1'
  const base = url.origin + url.pathname
  const key = base + (isRSC ? (isPrefetch ? '?__rscp=1' : '?__rsc=1') : '')

  // 주의: 세션 만료로 /login으로 리다이렉트된 응답을 원래 URL로 캐시하면
  // 오프라인에서 홈 대신 로그인 화면이 떠 로그북이 잠긴다 → 리다이렉트는 캐시 금지
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !res.redirected) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(key, copy))
        }
        return res
      })
      .catch(async () => {
        const c = await caches.open(CACHE)
        let hit = await c.match(key)
        // 실제로 방문해 받아둔 조각이 없으면, 미리 받아둔 조각이라도 쓴다
        // (한 번도 안 가본 화면이 여기에 해당한다 — 이 폴백이 그 화면을 살린다)
        if (!hit && isRSC && !isPrefetch) hit = await c.match(base + '?__rscp=1')
        if (hit) return hit
        // 마지막 수단은 홈 — 주소로 직접 열었을 때만. 조각(RSC) 요청에 홈 HTML을
        // 내주면 Next.js가 못 읽으므로 차라리 실패시켜 하드 이동으로 넘긴다.
        if (req.mode === 'navigate') {
          const home = await c.match(url.origin + '/')
          if (home) return home
        }
        return Response.error()
      })
  )
})
