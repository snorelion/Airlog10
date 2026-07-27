'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getFlights, getSetting, sync, onStoreChange, type Flight } from '@/lib/store'
import { computeYearly, computeByType, computeTopAirports, computeTotals, computeRecap, recapRange, filterRange, baseCountry, OTHER_TYPE, type Recap } from '@/lib/aggregate'
import { createClient } from '@/lib/supabase'
import { minToHMGrouped } from '@/lib/time'
import Nav from '@/components/Nav'
// 이 파일은 map 콜백에서 t를 기종 항목 이름으로 이미 쓰고 있어 사전은 L로 받는다
import { useT, useLang, fmt as tf, LOCALE } from '@/lib/i18n'
import { stats as dict } from '@/lib/i18n/stats'

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

// 기간 결산 공유 카드 (1080×1350 PNG) — 커리어 카드와 같은 톤
async function makeRecapCard(opts: {
  title: string          // MONTHLY RECAP · LAST 4 WEEKS
  label: string          // 2026년 6월 · 최근 4주
  start: string
  end: string
  recap: Recap
  top: { ident: string; visits: number }[]
  types: { type: string; flights: number }[]
  name: string
}): Promise<void> {
  const { title, label, start, end, recap, top, types, name } = opts
  const W = 1080, H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#0A2A4A')
  g.addColorStop(1, '#061D36')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  const SANS = "-apple-system, 'Apple SD Gothic Neo', sans-serif"
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = '#7FB4E8'
  ctx.font = `600 40px ${SANS}`
  ctx.fillText(title, 80, 140)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `800 76px ${SANS}`
  ctx.fillText(label, 80, 240)
  ctx.fillStyle = '#9DBBD8'
  ctx.font = `400 38px ${SANS}`
  ctx.fillText(`${start} ~ ${end}${name ? '   ·   ' + name : ''}`, 80, 300)

  ctx.fillStyle = '#FFC94D'
  ctx.font = `800 160px ${SANS}`
  ctx.fillText(minToHMGrouped(recap.total_min), 80, 500)
  ctx.fillStyle = '#9DBBD8'
  ctx.font = `500 42px ${SANS}`
  ctx.fillText('BLOCK TIME', 80, 562)

  const items: [string, string][] = [
    [`${recap.flights}`, 'FLIGHTS'],
    [`${recap.landings}`, 'LANDINGS'],
    [minToHMGrouped(recap.night_min), 'NIGHT'],
    [minToHMGrouped(recap.day_min), 'DAY'],
    [`${recap.domestic}`, 'DOMESTIC'],
    [`${recap.intl}`, 'INTL'],
  ]
  items.forEach(([val, lab], i) => {
    const x = 80 + (i % 3) * 320
    const y = 720 + Math.floor(i / 3) * 180
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `700 62px ${SANS}`
    ctx.fillText(val, x, y)
    ctx.fillStyle = '#7FB4E8'
    ctx.font = `500 29px ${SANS}`
    ctx.fillText(lab, x, y + 44)
  })

  // 주간/야간 비율 막대 (어두운 배경이라 야간=골드, 주간=스카이로 대비 확보)
  const barY = 1050, barW = 920, barH = 26
  const tmin = recap.day_min + recap.night_min
  const nightW = tmin > 0 ? (recap.night_min / tmin) * barW : 0
  ctx.fillStyle = '#7FB4E8'
  ctx.fillRect(80, barY, barW, barH)
  ctx.fillStyle = '#FFC94D'
  ctx.fillRect(80, barY, nightW, barH)
  ctx.fillStyle = '#9DBBD8'
  ctx.font = `500 30px ${SANS}`
  const nightPct = tmin > 0 ? Math.round((recap.night_min / tmin) * 100) : 0
  ctx.fillText(`NIGHT ${nightPct}%`, 80, barY - 20)

  ctx.fillStyle = '#9DBBD8'
  ctx.font = `500 32px ${SANS}`
  if (top.length) {
    ctx.fillText('TOP  ' + top.map((t) => `${t.ident} ${t.visits}`).join('   ·   '), 80, 1140)
  }
  if (types.length) {
    ctx.fillText(types.map((t) => `${t.type} ${t.flights}`).join('   ·   '), 80, 1192)
  }

  // 데이터와 브랜드 사이 구분선 — 없으면 푸터가 기종 줄에 붙어 한 덩어리로 보임
  ctx.fillStyle = '#12406E'
  ctx.fillRect(80, 1245, 920, 2)

  ctx.fillStyle = '#FFFFFF'
  ctx.font = `800 44px ${SANS}`
  ctx.fillText('AirLog10 ✈️', 80, 1310)

  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) return
  const fname = `airlog10-recap-${start}.png`
  const file = new File([blob], fname, { type: 'image/png' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch {}
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fname
  a.click()
  URL.revokeObjectURL(url)
}

// 주간/야간 시간 비율 도넛 (하늘색=주간, 남색=야간)
function DayNightDonut({ dayMin, nightMin }: { dayMin: number; nightMin: number }) {
  const L = useT(dict)
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
      <text x="45" y="58" textAnchor="middle" className="fill-app-hint" style={{ fontSize: 9 }}>{L.night}</text>
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

// 연도·기종을 눌렀을 때 펼쳐지는 상세 — recap과 같은 구성(집계 함수 재활용)
function DrillDetail({
  flights, baseCC, logbookHref, logbookLabel, showTypes = true,
}: {
  flights: Flight[]
  baseCC: string
  logbookHref: string
  logbookLabel: string
  showTypes?: boolean
}) {
  const L = useT(dict)
  const real = flights.filter((f) => f.total_min > 0)
  const r = computeRecap(real, baseCC)
  const t = computeTotals(real)
  const aps = computeTopAirports(real, 4)
  const types = computeByType(real)
  const maxV = aps[0]?.visits ?? 1
  const domTotal = r.domestic + r.intl

  return (
    <div className="space-y-3 border-t border-app-line bg-app-bg px-4 py-3">
      <div className="grid grid-cols-4 gap-2 text-center text-sm">
        <div><div className="text-xs text-app-hint">PIC</div><div className="font-semibold tabular-nums">{minToHMGrouped(t.pic_min)}</div></div>
        <div><div className="text-xs text-app-hint">SIC</div><div className="font-semibold tabular-nums">{minToHMGrouped(t.sic_min)}</div></div>
        <div><div className="text-xs text-app-hint">{L.night}</div><div className="font-semibold tabular-nums">{minToHMGrouped(r.night_min)}</div></div>
        <div><div className="text-xs text-app-hint">{L.landings}</div><div className="font-semibold tabular-nums">{r.landings}</div></div>
      </div>

      {domTotal > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-air-400" />{L.domestic} {r.domestic}</span>
            <span className="flex items-center gap-1.5">{L.intl} {r.intl}<span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" /></span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-app-surface">
            <div className="bg-air-400" style={{ width: `${(r.domestic / domTotal) * 100}%` }} />
            <div className="bg-amber-400" style={{ width: `${(r.intl / domTotal) * 100}%` }} />
          </div>
        </div>
      )}

      {aps.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-app-hint">{L.topAirports}</div>
          {aps.map((a) => (
            <div key={a.ident} className="flex items-center gap-2">
              <span className="w-12 font-mono text-xs font-semibold text-app-accent">{a.ident}</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-app-surface">
                <div className="h-full rounded bg-air-400" style={{ width: `${Math.max(6, (a.visits / maxV) * 100)}%` }} />
              </div>
              <span className="w-7 text-right text-xs tabular-nums text-app-hint">{a.visits}</span>
            </div>
          ))}
        </div>
      )}

      {showTypes && types.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-app-sub">
          {types.map((ty) => (
            <span key={ty.type}>
              <span className="font-mono font-semibold text-app-text">{ty.type === OTHER_TYPE ? L.otherTypeFallback : ty.type}</span> {tf(L.flightsN, { n: ty.flights })}
            </span>
          ))}
        </div>
      )}

      <Link
        href={logbookHref}
        className="block rounded-lg bg-app-btn py-2 text-center text-sm font-semibold text-white"
      >
        {tf(L.viewInLogbook, { label: logbookLabel })}
      </Link>
    </div>
  )
}

export default function StatsPage() {
  const L = useT(dict)
  const lang = useLang()
  const [flights, setFlights] = useState<Flight[]>([])
  const [recapMode, setRecapMode] = useState<'weeks4' | 'lastMonth'>('weeks4')
  const [openYear, setOpenYear] = useState<string | null>(null)
  const [openType, setOpenType] = useState<string | null>(null)
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
  // "2026년 6월" / "June 2026" — 달 이름은 언어마다 달라 Intl에 맡긴다
  const recapLabel = recapMode === 'lastMonth'
    ? new Date(range.start + 'T00:00:00').toLocaleDateString(LOCALE[lang], { year: 'numeric', month: 'long' })
    : L.last4w
  const baseCC = baseCountry(flights)
  const recapFlights = filterRange(flights, range.start, range.end)
  const recap = computeRecap(recapFlights, baseCC)
  const prevRecap = computeRecap(filterRange(flights, range.prevStart, range.prevEnd), baseCC)
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
        <h1 className="text-xl font-bold">{L.title}</h1>
        {flights.length > 0 && (
          <button
            type="button"
            onClick={async () => makeShareCard(flights, (await getSetting('pilotName')) ?? '')}
            className="rounded-lg bg-app-btn px-3 py-1.5 text-sm font-semibold text-white"
          >
            {L.shareCard}
          </button>
        )}
      </div>

      {!loaded ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-hint">{L.loading}</div>
      ) : yearly.length === 0 ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-sub">
          {L.empty}
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── 돌아보기 (Recap) ── */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-app-sub">{L.recap}</h2>
              <div className="flex overflow-hidden rounded-lg border border-app-line text-xs font-medium">
                <button
                  type="button" onClick={() => setRecapMode('weeks4')}
                  className={recapMode === 'weeks4' ? 'bg-app-btn px-3 py-1 text-white' : 'px-3 py-1 text-app-sub'}
                >{L.last4w}</button>
                <button
                  type="button" onClick={() => setRecapMode('lastMonth')}
                  className={recapMode === 'lastMonth' ? 'bg-app-btn px-3 py-1 text-white' : 'px-3 py-1 text-app-sub'}
                >{L.lastMonth}</button>
              </div>
            </div>
            <div className="rounded-2xl border border-app-line bg-app-surface p-4">
              {recap.flights === 0 ? (
                <p className="py-6 text-center text-sm text-app-sub">{tf(L.noFlightsIn, { label: recapLabel })}</p>
              ) : (
                <div className="space-y-4">
                  {/* 핵심 숫자 + 전 기간 대비 */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-lg font-bold tabular-nums">{tf(L.flightsN, { n: recap.flights })}</div>
                      <Delta cur={recap.flights} prev={prevRecap.flights} />
                    </div>
                    <div>
                      <div className="text-lg font-bold tabular-nums">{minToHMGrouped(recap.total_min)}</div>
                      <Delta cur={recap.total_min} prev={prevRecap.total_min} fmt={minToHMGrouped} />
                    </div>
                    <div>
                      <div className="text-lg font-bold tabular-nums">{tf(L.landingsN, { n: recap.landings })}</div>
                      <div className="text-xs text-app-hint">{L.landings}</div>
                    </div>
                  </div>

                  {/* 주간/야간 도넛 */}
                  <div className="flex items-center gap-4 border-t border-app-line pt-3">
                    <DayNightDonut dayMin={recap.day_min} nightMin={recap.night_min} />
                    <div className="flex-1 space-y-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#12335A' }} />{L.night}</span>
                        <span className="font-semibold tabular-nums">{minToHMGrouped(recap.night_min)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#7FB4E8' }} />{L.day}</span>
                        <span className="font-semibold tabular-nums">{minToHMGrouped(recap.day_min)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 국내 / 국제 */}
                  {domTotal > 0 && (
                    <div className="border-t border-app-line pt-3">
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-air-400" />{L.domestic} {recap.domestic}</span>
                        <span className="flex items-center gap-1.5">{L.intl} {recap.intl}<span className="inline-block h-3 w-3 rounded-sm bg-amber-400" /></span>
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
                      <div className="mb-1.5 text-xs font-medium text-app-hint">{L.topAirports}</div>
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
                          <span className="font-mono font-semibold text-app-text">{t.type === OTHER_TYPE ? L.otherTypeFallback : t.type}</span> {tf(L.flightsN, { n: t.flights })}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 결산 카드 */}
                  <button
                    type="button"
                    onClick={async () => makeRecapCard({
                      title: recapMode === 'lastMonth' ? 'MONTHLY RECAP' : 'RECAP',
                      // 카드는 전부 영문 톤이라 라벨도 영문 (한글 폰트 리스크도 피함)
                      label: recapMode === 'lastMonth'
                        ? `${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUNE', 'JULY', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][Number(range.start.slice(5, 7)) - 1]} ${range.start.slice(0, 4)}`
                        : 'LAST 4 WEEKS',
                      start: range.start,
                      end: range.end,
                      recap,
                      top: recapAirports,
                      types: recapTypes,
                      name: (await getSetting('pilotName')) ?? '',
                    })}
                    className="w-full rounded-lg border border-app-line bg-app-surface py-2 text-sm font-semibold text-app-accent"
                  >
                    {L.makeRecapCard}
                  </button>
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-app-sub">{L.byYear}</h2>
            <div className="overflow-hidden rounded-2xl border border-app-line bg-app-surface">
              {yearly.map((y) => (
                <div key={y.yr} className="border-b border-app-line last:border-0">
                  <button
                    type="button"
                    onClick={() => setOpenYear(openYear === y.yr ? null : y.yr)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left"
                  >
                    <span className="font-semibold">{y.yr}</span>
                    <span className="text-sm text-app-hint">{tf(L.flightsN, { n: y.flights.toLocaleString() })}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-semibold tabular-nums">{minToHMGrouped(y.total_min)}</span>
                      <span className="text-xs text-app-hint">{openYear === y.yr ? '▲' : '▼'}</span>
                    </span>
                  </button>
                  {openYear === y.yr && (
                    <DrillDetail
                      flights={flights.filter((f) => f.flight_date.slice(0, 4) === y.yr)}
                      baseCC={baseCC}
                      logbookHref={`/logbook?year=${y.yr}`}
                      logbookLabel={tf(L.yearLabel, { year: y.yr })}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-app-sub">{L.byType}</h2>
            <div className="overflow-hidden rounded-2xl border border-app-line bg-app-surface">
              {byType.map((t) => (
                <div key={t.type} className="border-b border-app-line last:border-0">
                  <button
                    type="button"
                    onClick={() => setOpenType(openType === t.type ? null : t.type)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left"
                  >
                    <span className="font-mono font-semibold">{t.type}</span>
                    <span className="text-sm text-app-hint">{tf(L.flightsN, { n: t.flights.toLocaleString() })}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-semibold tabular-nums">{minToHMGrouped(t.total_min)}</span>
                      <span className="text-xs text-app-hint">{openType === t.type ? '▲' : '▼'}</span>
                    </span>
                  </button>
                  {openType === t.type && (
                    <DrillDetail
                      flights={flights.filter((f) => (f.aircraft_type || OTHER_TYPE) === t.type)}
                      baseCC={baseCC}
                      logbookHref={`/logbook?type=${encodeURIComponent(t.type)}`}
                      logbookLabel={t.type}
                      showTypes={false}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-app-sub">{L.topAirportsTitle}</h2>
            <div className="space-y-1.5 rounded-2xl border border-app-line bg-app-surface p-4">
              {topAirports.map((a) => (
                <div key={a.ident} className="flex items-center gap-2">
                  <Link href={`/airports/${a.ident}`} className="flex flex-1 items-center gap-2">
                    <span className="w-14 font-mono text-sm font-semibold text-app-accent">{a.ident}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-app-bg">
                      <div
                        className="h-full rounded bg-air-400"
                        style={{ width: `${Math.max(4, (a.visits / maxVisits) * 100)}%` }}
                      />
                    </div>
                    <span className="w-20 truncate text-right text-xs text-app-sub">{names[a.ident] || ''}</span>
                    <span className="w-9 text-right text-sm font-semibold tabular-nums">{a.visits}</span>
                  </Link>
                  <Link
                    href={`/logbook?airport=${a.ident}`}
                    aria-label={tf(L.viewLogbookAria, { ident: a.ident })}
                    className="rounded-md border border-app-line px-1.5 py-1 text-[11px] font-medium text-app-sub"
                  >
                    {L.listBtn}
                  </Link>
                </div>
              ))}
              <p className="pt-1 text-center text-[11px] text-app-hint">{L.airportHint}</p>
            </div>
          </section>
        </div>
      )}

      <Nav />
    </main>
  )
}
