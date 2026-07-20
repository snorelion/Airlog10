'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getFlights, sync, onStoreChange, type Flight } from '@/lib/store'
import { sortChrono } from '@/lib/aggregate'
import { minToHM, minToHMGrouped } from '@/lib/time'
import Nav from '@/components/Nav'

// 종이 로그북처럼 한 페이지 20행, 과거→현재 순
const ROWS = 20

type Sums = {
  total: number; flt: number; night: number; inst: number; apch: number
  dayTO: number; nightTO: number; dayLDG: number; nightLDG: number
  pic: number; sic: number; dual: number
}

function emptySums(): Sums {
  return { total: 0, flt: 0, night: 0, inst: 0, apch: 0, dayTO: 0, nightTO: 0, dayLDG: 0, nightLDG: 0, pic: 0, sic: 0, dual: 0 }
}

function addRow(s: Sums, f: Flight) {
  s.total += f.total_min
  s.flt += f.flight_min ?? 0
  s.night += f.night_min
  s.inst += f.inst_actual_min
  s.apch += f.approaches?.length ?? 0
  s.dayTO += f.day_takeoffs
  s.nightTO += f.night_takeoffs
  s.dayLDG += f.day_landings
  s.nightLDG += f.night_landings
  s.pic += f.pic_min
  s.sic += f.sic_min
  s.dual += f.dual_received_min
}

export default function LedgerPage() {
  const [all, setAll] = useState<Flight[]>([])
  const [page, setPage] = useState<number | null>(null) // null = 마지막 장
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const rows = sortChrono(await getFlights())
    setAll(rows)
    setLoaded(true)
  }

  useEffect(() => {
    void load()
    void sync().then(load)
    return onStoreChange(() => { void load() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lastPage = Math.max(1, Math.ceil(all.length / ROWS))
  const p = page === null ? lastPage : Math.min(Math.max(1, page), lastPage)
  const start = (p - 1) * ROWS
  const rows = all.slice(start, start + ROWS)

  const forwarded = emptySums()
  for (const f of all.slice(0, start)) addRow(forwarded, f)
  const pageSums = emptySums()
  for (const f of rows) addRow(pageSums, f)
  const toDate = emptySums()
  for (const k of Object.keys(toDate) as (keyof Sums)[]) toDate[k] = forwarded[k] + pageSums[k]

  const td = 'border border-app-line px-1.5 py-1 text-center whitespace-nowrap'
  const th = 'border border-app-line bg-app-accent-soft px-1.5 py-1 text-center text-[10px] font-semibold text-app-accent whitespace-nowrap'

  function SumRow({ label, s }: { label: string; s: Sums }) {
    return (
      <tr className="bg-app-bg font-semibold">
        <td colSpan={6} className={td + ' !text-right pr-2 text-[10px] tracking-wide'}>{label}</td>
        <td className={td}>{minToHMGrouped(s.total)}</td>
        <td className={td}>{s.flt ? minToHMGrouped(s.flt) : ''}</td>
        <td className={td}>{minToHMGrouped(s.night)}</td>
        <td className={td}>{minToHMGrouped(s.inst)}</td>
        <td className={td}>{s.apch}</td>
        <td className={td}>{s.dayTO}/{s.nightTO}</td>
        <td className={td}>{s.dayLDG}/{s.nightLDG}</td>
        <td className={td}>{minToHMGrouped(s.pic)}</td>
        <td className={td}>{minToHMGrouped(s.sic)}</td>
        <td className={td}>{minToHMGrouped(s.dual)}</td>
        <td className={td}></td>
      </tr>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-3 pb-24 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">로그북 · 장부</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/logbook/print" className="text-app-accent">인쇄/PDF</Link>
          <Link href="/logbook" className="text-app-accent">목록 보기</Link>
          <span className="text-app-hint">PAGE {p} / {lastPage}</span>
        </div>
      </div>

      {!loaded ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-hint">불러오는 중…</div>
      ) : all.length === 0 ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-sub">
          아직 기록이 없어요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app-line bg-app-surface p-2">
          <table className="w-full min-w-[860px] border-collapse text-[11px] tabular-nums">
            <thead>
              <tr>
                <th className={th}>DATE</th>
                <th className={th}>TYPE</th>
                <th className={th}>IDENT</th>
                <th className={th}>FROM</th>
                <th className={th}>TO</th>
                <th className={th}>FLT #</th>
                <th className={th}>TOTAL</th>
                <th className={th}>FLT</th>
                <th className={th}>NIGHT</th>
                <th className={th}>ACT INST</th>
                <th className={th}>APCH</th>
                <th className={th}>T/O D/N</th>
                <th className={th}>LDG D/N</th>
                <th className={th}>PIC</th>
                <th className={th}>SIC</th>
                <th className={th}>DUAL</th>
                <th className={th + ' !text-left'}>REMARKS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td className={td}>{f.flight_date}</td>
                  <td className={td + ' font-mono'}>{f.aircraft_type ?? ''}</td>
                  <td className={td + ' font-mono'}>{f.aircraft_reg ?? ''}</td>
                  <td className={td + ' font-mono'}>{f.origin ?? ''}</td>
                  <td className={td + ' font-mono'}>{f.destination ?? ''}</td>
                  <td className={td}>{f.flight_number ?? ''}</td>
                  <td className={td + ' font-semibold'}>{minToHM(f.total_min)}</td>
                  <td className={td}>{f.flight_min ? minToHM(f.flight_min) : ''}</td>
                  <td className={td}>{f.night_min ? minToHM(f.night_min) : ''}</td>
                  <td className={td}>{f.inst_actual_min ? minToHM(f.inst_actual_min) : ''}</td>
                  <td className={td}>{f.approaches?.length || ''}</td>
                  <td className={td}>{f.day_takeoffs || f.night_takeoffs ? `${f.day_takeoffs}/${f.night_takeoffs}` : ''}</td>
                  <td className={td}>{f.day_landings || f.night_landings ? `${f.day_landings}/${f.night_landings}` : ''}</td>
                  <td className={td}>{f.pic_min ? minToHM(f.pic_min) : ''}</td>
                  <td className={td}>{f.sic_min ? minToHM(f.sic_min) : ''}</td>
                  <td className={td}>{f.dual_received_min ? minToHM(f.dual_received_min) : ''}</td>
                  <td className={td + ' !text-left max-w-[180px] truncate'}>{f.remarks ?? ''}</td>
                </tr>
              ))}
              <SumRow label="TOTAL THIS PAGE" s={pageSums} />
              <SumRow label="AMOUNT FORWARDED" s={forwarded} />
              <SumRow label="TOTAL TO DATE" s={toDate} />
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        {p > 1 ? (
          <button onClick={() => setPage(p - 1)} className="rounded-lg border border-app-line bg-app-surface px-4 py-2">← 이전 장</button>
        ) : <span className="px-4 py-2 text-app-hint">← 이전 장</span>}
        <button onClick={() => setPage(1)} className="text-xs text-app-hint">처음</button>
        <button onClick={() => setPage(null)} className="text-xs text-app-hint">마지막</button>
        {p < lastPage ? (
          <button onClick={() => setPage(p + 1)} className="rounded-lg border border-app-line bg-app-surface px-4 py-2">다음 장 →</button>
        ) : <span className="px-4 py-2 text-app-hint">다음 장 →</span>}
      </div>

      <Nav />
    </main>
  )
}
