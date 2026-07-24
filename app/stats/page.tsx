'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getFlights, getSetting, sync, onStoreChange, type Flight } from '@/lib/store'
import { computeYearly, computeByType, computeTopAirports, computeTotals, computeRecap, recapRange, filterRange } from '@/lib/aggregate'
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

// 주간/야간 시간 비율 도넛 (하늘색=주간, 남색=야간)
function DayNightDonut({ dayMin, nightMin }: { dayMin: number; nightMin: number }) {
  const total = dayMin + nightMin
  const R = 34, C = 2 * Math.PI * R
  const nightLen = total > 0 ? (nightMin / total) * C : 0
  const nightPct = total > 0 ? Math.round((nightMin / total) * 100) : 0
  return (
    <svg viewBox="0 0 90 90" className="h-24 w-24 shrink-0">
      <circle cx="45" cy="45" r={R} fill="none" stroke="#7FB4E8" strokeWidth="12" />
      <circle
        cx="45" cy="45" r={R} fill="none" stroke="#12335A" strokeWidth="12"
        strokeDasharray={`${nightLen} ${C - nightLen}`} transform="rotate(-90 45 45)" strokeLinecap="butt"
      />
      <text x="45" y="42" textAnchor="middle" className="fill-app-text" style={{ fontSize: 15, fontWeight: 700 }}>🌙 {nightPct}%</text>
      <text x="45" y="58" textAnchor="middle" className="fill-app-hint" style={{ fontSize: 9 }}>야간</text>
    </svg>
  )
}

// 전(前) 기간 대비 증감 ▲▼
function Delta({ cur, prev, fmt }: { cur: number; prev: number; fmt?: (n: number) => string }) {
  const d = cur - prev
  if (d === 0) return <span className="text-xs text-app-hint">±0</span>
  const up = d > 0
  const show = fmt ? fmt(Math.abs(d)) : String(Math.abs(d))
  return (
    <span className={`text-xs font-semibold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-app-hint'}`}>
      {up ? '▲' : '▼'} {show}
    </span>
  )
}

export default function StatsPage() {
  const [flights, setFlights] = useState<Flight[]>([])
  const [recapMode, setRecapMode] = useState<'weeks4' | 'lastMonth'>('weeks4')
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

  // ── Recap (최근 4주 / 지난 달) ──
  const today = new Date().toLocaleDateString('en-CA')
  const range = recapRange(today, recapMode)
  const recapFlights = filterRange(flights, range.start, range.end)
  const recap = computeRecap(recapFlights)
  const prevRecap = computeRecap(filterRange(flights, range.prevStart, range.prevEnd))
  const recapTypes = computeByType(recapFlights)
  const recapAirports = computeTopAirports(recapFlights, 4)
  const recapMaxVisits = recapAirports[0]?.visits ?? 1
  const domTotal = recap.domestic + recap.intl

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
            className="rounded-lg bg-app-btn px-3 py-1.5 text-sm font-semibold text-white"
          >
            공유 카드
          </button>
        )}
      </div>

      {!loaded ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-hint">불러오는 중…</div>
      ) : yearly.length === 0 ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-sub">
          기록이 쌓이면 통계가 여기 나타나요.
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── 돌아보기 (Recap) ── */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-app-sub">돌아보기</h2>
              <div className="flex overflow-hidden rounded-lg border border-app-line text-xs font-medium">
                <button
                  type="button" onClick={() => setRecapMode('weeks4')}
                  className={recapMode === 'weeks4' ? 'bg-app-btn px-3 py-1 text-white' : 'px-3 py-1 text-app-sub'}
                >최근 4주</button>
                <button
                  type="button" onClick={() => setRecapMode('lastMonth')}
                  className={recapMode === 'lastMonth' ? 'bg-app-btn px-3 py-1 text-white' : 'px-3 py-1 text-app-sub'}
                >지난 달</button>
              </div>
            </div>
            <div className="rounded-2xl border border-app-line bg-app-surface p-4">
              {recap.flights === 0 ? (
                <p className="py-6 text-center text-sm text-app-sub">{range.label}엔 비행 기록이 없어요.</p>
              ) : (
                <div className="space-y-4">
                  {/* 핵심 숫자 + 전 기간 대비 */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-lg font-bold tabular-nums">{recap.flights}편</div>
                      <Delta cur={recap.flights} prev={prevRecap.flights} />
                    </div>
                    <div>
                      <div className="text-lg font-bold tabular-nums">{minToHMGrouped(recap.total_min)}</div>
                      <Delta cur={recap.total_min} prev={prevRecap.total_min} fmt={minToHMGrouped} />
                    </div>
                    <div>
                      <div className="text-lg font-bold tabular-nums">{recap.landings}회</div>
                      <div className="text-xs text-app-hint">착륙</div>
                    </div>
                  </div>

                  {/* 주간/야간 도넛 */}
                  <div className="flex items-center gap-4 border-t border-app-line pt-3">
                    <DayNightDonut dayMin={recap.day_min} nightMin={recap.night_min} />
                    <div className="flex-1 space-y-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#12335A' }} />야간</span>
                        <span className="font-semibold tabular-nums">{minToHMGrouped(recap.night_min)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#7FB4E8' }} />주간</span>
                        <span className="font-semibold tabular-nums">{minToHMGrouped(recap.day_min)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 국내 / 국제 */}
                  {domTotal > 0 && (
                    <div className="border-t border-app-line pt-3">
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-air-400" />국내 {recap.domestic}</span>
                        <span className="flex items-center gap-1.5">국제 {recap.intl}<span className="inline-block h-3 w-3 rounded-sm bg-amber-400" /></span>
                      </div>
                      <div className="flex h-3 overflow-hidden rounded-full bg-app-bg">
                        <div className="bg-air-400" style={{ width: `${(recap.domestic / domTotal) * 100}%` }} />
                        <div className="bg-amber-400" style={{ width: `${(recap.intl / domTotal) * 100}%` }} />
                      </div>
                    </div>
                  )}

                  {/* 많이 간 곳 */}
                  {recapAirports.length > 0 && (
                    <div className="border-t border-app-line pt-3">
                      <div className="mb-1.5 text-xs font-medium text-app-hint">많이 드나든 공항</div>
                      <div className="space-y-1.5">
                        {recapAirports.map((a) => (
                          <Link key={a.ident} href={`/airports/${a.ident}`} className="flex items-center gap-2">
                            <span className="w-12 font-mono text-sm font-semibold text-app-accent">{a.ident}</span>
                            <div className="h-3.5 flex-1 overflow-hidden rounded bg-app-bg">
                              <div className="h-full rounded bg-air-400" style={{ width: `${Math.max(6, (a.visits / recapMaxVisits) * 100)}%` }} />
                            </div>
                            <span className="w-8 text-right text-xs tabular-nums text-app-hint">{a.visits}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 기종 믹스 */}
                  {recapTypes.length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-app-line pt-3 text-sm">
                      {recapTypes.map((t) => (
                        <span key={t.type} className="text-app-sub">
                          <span className="font-mono font-semibold text-app-text">{t.type}</span> {t.flights}편
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-app-sub">연도별 비행시간</h2>
            <div className="overflow-hidden rounded-2xl border border-app-line bg-app-surface">
              {yearly.map((y) => (
                <div key={y.yr} className="flex items-center justify-between border-b border-app-line px-4 py-2.5 last:border-0">
                  <span className="font-semibold">{y.yr}</span>
                  <span className="text-sm text-app-hint">{y.flights.toLocaleString()}편</span>
                  <span className="font-semibold tabular-nums">{minToHMGrouped(y.total_min)}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-app-sub">기종별</h2>
            <div className="overflow-hidden rounded-2xl border border-app-line bg-app-surface">
              {byType.map((t) => (
                <div key={t.type} className="flex items-center justify-between border-b border-app-line px-4 py-2.5 last:border-0">
                  <span className="font-mono font-semibold">{t.type}</span>
                  <span className="text-sm text-app-hint">{t.flights.toLocaleString()}편</span>
                  <span className="font-semibold tabular-nums">{minToHMGrouped(t.total_min)}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-app-sub">많이 간 공항</h2>
            <div className="space-y-1.5 rounded-2xl border border-app-line bg-app-surface p-4">
              {topAirports.map((a) => (
                <Link key={a.ident} href={`/airports/${a.ident}`} className="flex items-center gap-2">
                  <span className="w-14 font-mono text-sm font-semibold text-app-accent">{a.ident}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-app-bg">
                    <div
                      className="h-full rounded bg-air-400"
                      style={{ width: `${Math.max(4, (a.visits / maxVisits) * 100)}%` }}
                    />
                  </div>
                  <span className="w-24 truncate text-right text-xs text-app-sub">{names[a.ident] || ''}</span>
                  <span className="w-10 text-right text-sm font-semibold tabular-nums">{a.visits}</span>
                </Link>
              ))}
              <p className="pt-1 text-center text-[11px] text-app-hint">공항을 누르면 상세 정보·활주로·메모가 열려요</p>
            </div>
          </section>
        </div>
      )}

      <Nav />
    </main>
  )
}
