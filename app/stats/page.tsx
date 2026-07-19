'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getFlights, getSetting, sync, onStoreChange, type Flight } from '@/lib/store'
import { computeYearly, computeByType, computeTopAirports, computeTotals } from '@/lib/aggregate'
import { createClient } from '@/lib/supabase'
import { minToHMGrouped } from '@/lib/time'
import Nav from '@/components/Nav'

// 커리어 요약 공유 카드 (1080×1350 PNG) — 캔버스로 그려서 공유/저장
async function makeShareCard(flights: Flight[], name: string): Promise<void> {
  const totals = computeTotals(flights)
  const airports = new Set<string>()
  for (const f of flights) {
    if (f.origin) airports.add(f.origin)
    if (f.destination) airports.add(f.destination)
  }
  let countries = 0
  try {
    const coords = JSON.parse((await getSetting('airportCoords')) || '{}') as Record<string, { country?: string | null }>
    const cs = new Set<string>()
    for (const ident of Array.from(airports)) {
      const c = coords[ident]?.country
      if (c) cs.add(c)
    }
    countries = cs.size
  } catch {}
  const top = computeTopAirports(flights, 3)

  const W = 1080, H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 배경 — 네이비 그라데이션
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#0A2A4A')
  g.addColorStop(1, '#061D36')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  const SANS = "-apple-system, 'Apple SD Gothic Neo', sans-serif"
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = '#7FB4E8'
  ctx.font = `600 40px ${SANS}`
  ctx.fillText('PILOT LOGBOOK', 80, 140)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `800 76px ${SANS}`
  ctx.fillText(name || 'My Career', 80, 240)
  ctx.fillStyle = '#9DBBD8'
  ctx.font = `400 40px ${SANS}`
  ctx.fillText(`${totals.first_date ?? ''} ~ ${totals.last_date ?? ''}`, 80, 305)

  ctx.fillStyle = '#FFC94D'
  ctx.font = `800 170px ${SANS}`
  ctx.fillText(minToHMGrouped(totals.total_min), 80, 540)
  ctx.fillStyle = '#9DBBD8'
  ctx.font = `500 44px ${SANS}`
  ctx.fillText('TOTAL FLIGHT TIME', 80, 605)

  const items: [string, string][] = [
    [totals.flights.toLocaleString(), 'FLIGHTS'],
    [String(airports.size), 'AIRPORTS'],
    [String(countries), 'COUNTRIES'],
    [minToHMGrouped(totals.night_min), 'NIGHT'],
    [minToHMGrouped(totals.pic_min), 'PIC'],
    [totals.landings.toLocaleString(), 'LANDINGS'],
  ]
  items.forEach(([val, label], i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = 80 + col * 320
    const y = 760 + row * 190
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `700 64px ${SANS}`
    ctx.fillText(val, x, y)
    ctx.fillStyle = '#7FB4E8'
    ctx.font = `500 30px ${SANS}`
    ctx.fillText(label, x, y + 45)
  })

  ctx.fillStyle = '#9DBBD8'
  ctx.font = `500 34px ${SANS}`
  const topText = top.map((t) => `${t.ident} ${t.visits.toLocaleString()}`).join('   ·   ')
  ctx.fillText('TOP  ' + topText, 80, 1190)

  ctx.fillStyle = '#FFFFFF'
  ctx.font = `800 44px ${SANS}`
  ctx.fillText('AirLog10 ✈️', 80, 1280)

  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) return
  const file = new File([blob], 'airlog10-career.png', { type: 'image/png' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch {}
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'airlog10-career.png'
  a.click()
  URL.revokeObjectURL(url)
}

export default function StatsPage() {
  const [flights, setFlights] = useState<Flight[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  async function load() {
    setFlights(await getFlights())
    setLoaded(true)
  }

  useEffect(() => {
    void load()
    void sync().then(load)
    return onStoreChange(() => { void load() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const yearly = computeYearly(flights)
  const byType = computeByType(flights)
  const topAirports = computeTopAirports(flights)
  const maxVisits = topAirports[0]?.visits ?? 1

  // 공항 이름은 온라인일 때만 조회해 덧붙임 (오프라인이면 코드만 표시)
  useEffect(() => {
    const idents = topAirports.map((a) => a.ident).filter((i) => !(i in names))
    if (!idents.length || (typeof navigator !== 'undefined' && !navigator.onLine)) return
    const supabase = createClient()
    void supabase
      .from('airports')
      .select('ident, name, municipality')
      .in('ident', idents)
      .then(({ data }) => {
        if (!data) return
        setNames((prev) => {
          const next = { ...prev }
          for (const a of data) next[a.ident] = a.municipality || a.name || ''
          return next
        })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights])

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">통계</h1>
        {flights.length > 0 && (
          <button
            type="button"
            onClick={async () => makeShareCard(flights, (await getSetting('pilotName')) ?? '')}
            className="rounded-lg bg-air-600 px-3 py-1.5 text-sm font-semibold text-white"
          >
            공유 카드
          </button>
        )}
      </div>

      {!loaded ? (
        <div className="rounded-2xl border border-ink-line bg-white p-8 text-center text-ink-hint">불러오는 중…</div>
      ) : yearly.length === 0 ? (
        <div className="rounded-2xl border border-ink-line bg-white p-8 text-center text-ink-sub">
          기록이 쌓이면 통계가 여기 나타나요.
        </div>
      ) : (
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink-sub">연도별 비행시간</h2>
            <div className="overflow-hidden rounded-2xl border border-ink-line bg-white">
              {yearly.map((y) => (
                <div key={y.yr} className="flex items-center justify-between border-b border-ink-line px-4 py-2.5 last:border-0">
                  <span className="font-semibold">{y.yr}</span>
                  <span className="text-sm text-ink-hint">{y.flights.toLocaleString()}편</span>
                  <span className="font-semibold tabular-nums">{minToHMGrouped(y.total_min)}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink-sub">기종별</h2>
            <div className="overflow-hidden rounded-2xl border border-ink-line bg-white">
              {byType.map((t) => (
                <div key={t.type} className="flex items-center justify-between border-b border-ink-line px-4 py-2.5 last:border-0">
                  <span className="font-mono font-semibold">{t.type}</span>
                  <span className="text-sm text-ink-hint">{t.flights.toLocaleString()}편</span>
                  <span className="font-semibold tabular-nums">{minToHMGrouped(t.total_min)}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink-sub">많이 간 공항</h2>
            <div className="space-y-1.5 rounded-2xl border border-ink-line bg-white p-4">
              {topAirports.map((a) => (
                <Link key={a.ident} href={`/airports/${a.ident}`} className="flex items-center gap-2">
                  <span className="w-14 font-mono text-sm font-semibold text-air-600">{a.ident}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-ink-bg">
                    <div
                      className="h-full rounded bg-air-400"
                      style={{ width: `${Math.max(4, (a.visits / maxVisits) * 100)}%` }}
                    />
                  </div>
                  <span className="w-24 truncate text-right text-xs text-ink-sub">{names[a.ident] || ''}</span>
                  <span className="w-10 text-right text-sm font-semibold tabular-nums">{a.visits}</span>
                </Link>
              ))}
              <p className="pt-1 text-center text-[11px] text-ink-hint">공항을 누르면 상세 정보·활주로·메모가 열려요</p>
            </div>
          </section>
        </div>
      )}

      <Nav />
    </main>
  )
}
