'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getFlights, getAircraftList, sync, onStoreChange } from '@/lib/store'
import { minToHMGrouped } from '@/lib/time'
import Nav from '@/components/Nav'

type Recent = { flight_date: string; origin: string | null; destination: string | null; total_min: number }
type AcAgg = {
  reg: string
  type: string | null
  flights: number
  totalMin: number
  flightMin: number
  nightMin: number
  lastDate: string
  recent: Recent[]
}

export default function AircraftPage() {
  const [aggs, setAggs] = useState<AcAgg[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const [flights, acList] = await Promise.all([getFlights(), getAircraftList()])
    // aircraft 테이블의 등록번호→기종 (없으면 비행 기록의 최근 기종으로 대체)
    const typeMap = new Map(acList.map((a) => [a.registration, a.type_code]))
    const map = new Map<string, AcAgg>()
    for (const f of flights) {
      const reg = f.aircraft_reg
      if (!reg) continue // 시뮬 등 기체 없는 기록 제외
      let e = map.get(reg)
      if (!e) {
        e = { reg, type: typeMap.get(reg) ?? f.aircraft_type ?? null, flights: 0, totalMin: 0, flightMin: 0, nightMin: 0, lastDate: '', recent: [] }
        map.set(reg, e)
      }
      e.flights += 1
      e.totalMin += f.total_min
      e.flightMin += f.flight_min ?? 0
      e.nightMin += f.night_min ?? 0
      if (f.flight_date > e.lastDate) {
        e.lastDate = f.flight_date
        if (f.aircraft_type) e.type = f.aircraft_type
      }
      e.recent.push({ flight_date: f.flight_date, origin: f.origin, destination: f.destination, total_min: f.total_min })
    }
    const rows = Array.from(map.values())
    for (const e of rows) e.recent.sort((a, b) => b.flight_date.localeCompare(a.flight_date))
    rows.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.flights - a.flights)
    setAggs(rows)
    setLoaded(true)
  }

  useEffect(() => {
    void load()
    void sync().then(load)
    return onStoreChange(() => { void load() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    return aggs.filter((a) => !q || a.reg.toUpperCase().includes(q) || (a.type ?? '').toUpperCase().includes(q))
  }, [aggs, query])

  const fleetCount = aggs.length

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">기체{fleetCount ? ` · ${fleetCount}대` : ''}</h1>
        <Link href="/settings" className="text-sm text-app-accent">설정으로</Link>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="등록번호·기종 검색"
        className="mb-3 w-full rounded-xl border border-app-line bg-app-surface px-4 py-2.5 outline-none focus:border-air-400"
      />

      {!loaded ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-hint">불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-sub">
          기록에서 탄 기체가 자동으로 모여요.
        </div>
      ) : (
        <div className="divide-y divide-app-line overflow-hidden rounded-2xl border border-app-line bg-app-surface">
          {filtered.map((a) => (
            <div key={a.reg}>
              <button type="button" onClick={() => setOpen(open === a.reg ? null : a.reg)} className="w-full px-4 py-3 text-left">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">
                    {a.reg}
                    {a.type && <span className="ml-2 text-xs font-normal text-app-hint">{a.type}</span>}
                  </p>
                  <p className="text-sm tabular-nums text-app-sub">{a.flights.toLocaleString()}편 · {minToHMGrouped(a.totalMin)}</p>
                </div>
                {a.lastDate && <div className="mt-0.5 text-xs text-app-hint">최근 {a.lastDate}</div>}
              </button>
              {open === a.reg && (
                <div className="border-t border-app-line bg-app-bg px-4 py-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><div className="text-xs text-app-hint">블록</div><div className="font-semibold tabular-nums">{minToHMGrouped(a.totalMin)}</div></div>
                    <div><div className="text-xs text-app-hint">공중</div><div className="font-semibold tabular-nums">{minToHMGrouped(a.flightMin)}</div></div>
                    <div><div className="text-xs text-app-hint">야간</div><div className="font-semibold tabular-nums">{minToHMGrouped(a.nightMin)}</div></div>
                  </div>
                  <div className="mt-3 space-y-1">
                    <div className="text-xs text-app-hint">최근 비행</div>
                    {a.recent.slice(0, 5).map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span>{r.flight_date} · {r.origin ?? '?'}→{r.destination ?? '?'}</span>
                        <span className="tabular-nums text-app-sub">{minToHMGrouped(r.total_min)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Nav />
    </main>
  )
}
