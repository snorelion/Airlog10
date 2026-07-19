'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getFlights, sync, onStoreChange, type Flight } from '@/lib/store'
import { computeYearly, computeByType, computeTopAirports } from '@/lib/aggregate'
import { createClient } from '@/lib/supabase'
import { minToHMGrouped } from '@/lib/time'
import Nav from '@/components/Nav'

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
      <h1 className="mb-4 text-xl font-bold">통계</h1>

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
