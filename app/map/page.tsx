'use client'

import { useEffect, useState } from 'react'
import { getFlights, getSetting, setSetting, sync, onStoreChange } from '@/lib/store'
import { createClient } from '@/lib/supabase'
import { WORLD_LAND_PATH } from '@/components/world-land-path'
import Nav from '@/components/Nav'

// 등장방형 투영 (world-land-path.ts와 동일 좌표계)
function px(lon: number) { return (lon + 180) / 360 * 1000 }
function py(lat: number) { return (90 - lat) / 180 * 500 }

type Coord = { lat: number; lon: number; name: string | null; country: string | null }
type AirportDot = { ident: string; x: number; y: number; visits: number }
type Route = { x1: number; y1: number; x2: number; y2: number; count: number }

export default function MapPage() {
  const [dots, setDots] = useState<AirportDot[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [countries, setCountries] = useState(0)
  const [missingCount, setMissingCount] = useState(0)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const flights = await getFlights()

    // 방문 횟수·노선 집계
    const visits = new Map<string, number>()
    const pairs = new Map<string, number>()
    for (const f of flights) {
      if (f.origin) visits.set(f.origin, (visits.get(f.origin) ?? 0) + 1)
      if (f.destination) visits.set(f.destination, (visits.get(f.destination) ?? 0) + 1)
      if (f.origin && f.destination && f.origin !== f.destination) {
        const key = [f.origin, f.destination].sort().join('|')
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
      }
    }

    // 공항 좌표 — 로컬 캐시 우선, 없는 것만 온라인 조회 (다음부터 오프라인 OK)
    let coords: Record<string, Coord> = {}
    try { coords = JSON.parse((await getSetting('airportCoords')) || '{}') } catch {}
    const missing = Array.from(visits.keys()).filter((i) => !coords[i])
    if (missing.length && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('airports')
          .select('ident, lat, lon, name, country')
          .in('ident', missing)
        for (const a of data ?? []) {
          if (a.lat !== null && a.lon !== null) {
            coords[a.ident] = { lat: a.lat, lon: a.lon, name: a.name, country: a.country }
          }
        }
        await setSetting('airportCoords', JSON.stringify(coords))
      } catch {}
    }

    const ds: AirportDot[] = []
    const countrySet = new Set<string>()
    for (const [ident, v] of Array.from(visits.entries())) {
      const c = coords[ident]
      if (!c) continue
      ds.push({ ident, x: px(c.lon), y: py(c.lat), visits: v })
      if (c.country) countrySet.add(c.country)
    }
    ds.sort((a, b) => b.visits - a.visits)

    const rs: Route[] = []
    for (const [key, count] of Array.from(pairs.entries())) {
      const [a, b] = key.split('|')
      const ca = coords[a]
      const cb = coords[b]
      if (!ca || !cb) continue
      rs.push({ x1: px(ca.lon), y1: py(ca.lat), x2: px(cb.lon), y2: py(cb.lat), count })
    }

    setDots(ds)
    setRoutes(rs)
    setCountries(countrySet.size)
    setMissingCount(Array.from(visits.keys()).filter((i) => !coords[i]).length)
    setLoaded(true)
  }

  useEffect(() => {
    void load()
    void sync().then(load)
    return onStoreChange(() => { void load() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 방문 공항에 맞춰 화면 잘라내기 (여백 포함)
  let minX = 0, minY = 0, w = 1000, h = 500
  if (dots.length) {
    const xs = dots.map((d) => d.x)
    const ys = dots.map((d) => d.y)
    const padX = Math.max(30, (Math.max(...xs) - Math.min(...xs)) * 0.15)
    const padY = Math.max(20, (Math.max(...ys) - Math.min(...ys)) * 0.2)
    minX = Math.max(0, Math.min(...xs) - padX)
    minY = Math.max(0, Math.min(...ys) - padY)
    w = Math.min(1000 - minX, Math.max(...xs) + padX - minX)
    h = Math.min(500 - minY, Math.max(...ys) + padY - minY)
  }
  const maxVisits = dots[0]?.visits ?? 1
  const maxRoute = routes.reduce((m, r) => Math.max(m, r.count), 1)
  const k = w / 1000 // 확대 배율 보정 (점·글자 크기용)
  const rBase = Math.max(2.2, 150 * k / 10)
  const fs = Math.max(6, 190 * k / 10)
  // 라벨 겹침 방지 — 방문 많은 순으로 놓되, 이미 놓인 라벨과 겹치면 건너뜀
  const labeled: AirportDot[] = []
  for (const d of dots.slice(0, 14)) {
    if (labeled.length >= 8) break
    const clash = labeled.some(
      (l) => Math.abs(l.x - d.x) < fs * 4.6 && Math.abs(l.y - d.y) < fs * 2.0
    )
    if (!clash) labeled.push(d)
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">파일럿 맵</h1>
        {loaded && (
          <p className="text-sm text-app-hint">
            공항 {dots.length}곳 · {countries}개국 · 노선 {routes.length}개
          </p>
        )}
      </div>

      {!loaded ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-hint">불러오는 중…</div>
      ) : dots.length === 0 ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-sub">
          기록이 쌓이면 지도가 채워져요. (좌표는 온라인에서 한 번 받아와요)
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl" style={{ background: '#081F38' }}>
            <svg viewBox={`${minX} ${minY} ${w} ${h}`} className="block w-full">
              {/* 육지 */}
              <path d={WORLD_LAND_PATH} fill="#123A61" />
              {/* 노선 */}
              {routes.map((r, i) => {
                const mx = (r.x1 + r.x2) / 2
                const my = (r.y1 + r.y2) / 2
                const dx = r.x2 - r.x1
                const dy = r.y2 - r.y1
                const dist = Math.sqrt(dx * dx + dy * dy) || 1
                const cx = mx - dy / dist * dist * 0.12
                const cy = my + dx / dist * dist * 0.12 * -1
                return (
                  <path
                    key={i}
                    d={`M${r.x1} ${r.y1} Q${cx} ${cy} ${r.x2} ${r.y2}`}
                    fill="none"
                    stroke="#7FB4E8"
                    strokeOpacity={0.25 + (r.count / maxRoute) * 0.55}
                    vectorEffect="non-scaling-stroke"
                    strokeWidth={r.count === maxRoute ? 1.6 : 1}
                  />
                )
              })}
              {/* 공항 점 */}
              {dots.map((d) => (
                <circle
                  key={d.ident}
                  cx={d.x}
                  cy={d.y}
                  r={rBase * (0.5 + Math.sqrt(d.visits / maxVisits) * 1.1)}
                  fill="#FFC94D"
                  stroke="#081F38"
                  strokeWidth={rBase * 0.25}
                />
              ))}
              {/* 상위 공항 라벨 */}
              {labeled.map((d) => (
                <text
                  key={'t' + d.ident}
                  x={d.x + rBase * 2}
                  y={d.y - rBase * 1.2}
                  fill="#EAF3FC"
                  fontSize={fs}
                  fontFamily="ui-monospace, monospace"
                  fontWeight="700"
                >
                  {d.ident}
                </text>
              ))}
            </svg>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-app-line bg-app-surface">
            {dots.slice(0, 10).map((d, i) => (
              <a key={d.ident} href={`/airports/${d.ident}`}
                className="flex items-center justify-between border-b border-app-line px-4 py-2.5 last:border-0">
                <span className="text-sm text-app-hint">{i + 1}</span>
                <span className="font-mono font-semibold text-app-accent">{d.ident}</span>
                <span className="text-sm tabular-nums text-app-sub">{d.visits.toLocaleString()}회</span>
              </a>
            ))}
          </div>

          {missingCount > 0 && (
            <p className="mt-2 text-center text-xs text-app-hint">
              좌표를 못 찾은 공항 {missingCount}곳은 지도에서 빠져 있어요.
            </p>
          )}
        </>
      )}

      <Nav />
    </main>
  )
}
