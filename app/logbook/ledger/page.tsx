'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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

// 컬럼을 한 곳에만 정의 — 헤더·본문·합계가 어긋날 일이 없다.
// full: true = '전체' 모드에서만 보이는 칸 (간단 모드에선 숨김)
type Col = {
  label: string
  cell: (f: Flight) => ReactNode
  sum?: (s: Sums) => ReactNode
  full?: boolean
  mono?: boolean
  left?: boolean
}

const COLS: Col[] = [
  { label: 'DATE', cell: (f) => f.flight_date },
  { label: 'TYPE', cell: (f) => f.aircraft_type ?? '', mono: true },
  { label: 'IDENT', cell: (f) => f.aircraft_reg ?? '', mono: true },
  { label: 'FROM', cell: (f) => f.origin ?? '', mono: true },
  { label: 'TO', cell: (f) => f.destination ?? '', mono: true },
  { label: 'FLT #', cell: (f) => f.flight_number ?? '' },
  { label: 'TOTAL', cell: (f) => minToHM(f.total_min), sum: (s) => minToHMGrouped(s.total) },
  { label: 'FLT', full: true, cell: (f) => (f.flight_min ? minToHM(f.flight_min) : ''), sum: (s) => (s.flt ? minToHMGrouped(s.flt) : '') },
  { label: 'NIGHT', cell: (f) => (f.night_min ? minToHM(f.night_min) : ''), sum: (s) => minToHMGrouped(s.night) },
  { label: 'ACT INST', full: true, cell: (f) => (f.inst_actual_min ? minToHM(f.inst_actual_min) : ''), sum: (s) => minToHMGrouped(s.inst) },
  { label: 'APCH', full: true, cell: (f) => f.approaches?.length || '', sum: (s) => s.apch },
  {
    label: 'T/O D/N', full: true,
    cell: (f) => (f.day_takeoffs || f.night_takeoffs ? `${f.day_takeoffs}/${f.night_takeoffs}` : ''),
    sum: (s) => `${s.dayTO}/${s.nightTO}`,
  },
  {
    label: 'LDG D/N', full: true,
    cell: (f) => (f.day_landings || f.night_landings ? `${f.day_landings}/${f.night_landings}` : ''),
    sum: (s) => `${s.dayLDG}/${s.nightLDG}`,
  },
  { label: 'PIC', cell: (f) => (f.pic_min ? minToHM(f.pic_min) : ''), sum: (s) => minToHMGrouped(s.pic) },
  { label: 'SIC', cell: (f) => (f.sic_min ? minToHM(f.sic_min) : ''), sum: (s) => minToHMGrouped(s.sic) },
  { label: 'DUAL', full: true, cell: (f) => (f.dual_received_min ? minToHM(f.dual_received_min) : ''), sum: (s) => minToHMGrouped(s.dual) },
  { label: 'REMARKS', left: true, cell: (f) => f.remarks ?? '' },
]

export default function LedgerPage() {
  const router = useRouter()
  const [all, setAll] = useState<Flight[]>([])
  const [page, setPage] = useState<number | null>(null) // null = 마지막 장
  const [full, setFull] = useState(false)               // false = 간단(핵심 칸만)
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

  const cols = COLS.filter((c) => full || !c.full)
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

  const cellBase = 'border border-app-line px-2 py-1.5 whitespace-nowrap'
  const th = 'border border-app-line bg-app-accent-soft px-2 py-1.5 text-center text-[11px] font-semibold text-app-accent whitespace-nowrap'
  // 합계 라벨이 차지할 칸 수 = 합계값이 없는 앞쪽 칸들(DATE~FLT #)
  const labelSpan = cols.findIndex((c) => c.sum)

  function SumRow({ label, s }: { label: string; s: Sums }) {
    return (
      <tr className="bg-app-bg font-semibold">
        <td className={cellBase + ' sticky left-0 z-10 bg-app-bg pr-2 text-right text-[11px] tracking-wide'} colSpan={labelSpan}>
          {label}
        </td>
        {cols.slice(labelSpan).map((c) => (
          <td key={c.label} className={cellBase + ' text-center'}>{c.sum ? c.sum(s) : ''}</td>
        ))}
      </tr>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-3 pb-24 pt-6">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">로그북 · 장부</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/logbook/print" className="text-app-accent">인쇄/PDF</Link>
          <span className="text-app-hint">PAGE {p} / {lastPage}</span>
        </div>
      </div>

      {/* 목록 ↔ 장부 전환 + 칸 수 (숨은 링크가 아니라 눈에 보이는 토글로) */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex overflow-hidden rounded-lg border border-app-line text-xs font-semibold">
          <Link href="/logbook" className="px-3 py-1.5 text-app-sub">목록</Link>
          <span className="bg-app-btn px-3 py-1.5 text-white">장부</span>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-app-line text-xs font-medium">
          <button
            type="button" onClick={() => setFull(false)}
            className={full ? 'px-3 py-1.5 text-app-sub' : 'bg-app-btn px-3 py-1.5 text-white'}
          >간단</button>
          <button
            type="button" onClick={() => setFull(true)}
            className={full ? 'bg-app-btn px-3 py-1.5 text-white' : 'px-3 py-1.5 text-app-sub'}
          >전체 칸</button>
        </div>
      </div>

      {!loaded ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-hint">불러오는 중…</div>
      ) : all.length === 0 ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-sub">
          아직 기록이 없어요.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-app-line bg-app-surface p-2">
            <table
              className="w-full border-collapse text-[13px] tabular-nums"
              style={{ minWidth: full ? 1120 : 780 }}
            >
              <thead>
                <tr>
                  {cols.map((c, i) => (
                    <th
                      key={c.label}
                      className={th + (i === 0 ? ' sticky left-0 z-20' : '') + (c.left ? ' !text-left' : '')}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((f, ri) => {
                  // 줄무늬 — 눈으로 행 따라가기 쉽게. 고정된 첫 칸도 같은 배경을 줘야
                  // 옆으로 당길 때 뒤 칸이 비쳐 보이지 않는다
                  const rowBg = ri % 2 ? 'bg-app-bg' : 'bg-app-surface'
                  return (
                    <tr
                      key={f.id}
                      className={`${rowBg} cursor-pointer`}
                      onClick={() => router.push(`/flights/new?edit=${f.id}`)}
                    >
                      {cols.map((c, i) => (
                        <td
                          key={c.label}
                          className={
                            cellBase +
                            (c.left ? ' text-left' : ' text-center') +
                            (c.mono ? ' font-mono' : '') +
                            (c.label === 'TOTAL' ? ' font-semibold' : '') +
                            (c.label === 'REMARKS' ? ' max-w-[220px] truncate' : '') +
                            (i === 0 ? ` sticky left-0 z-10 ${rowBg}` : '')
                          }
                        >
                          {c.cell(f)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                <SumRow label="TOTAL THIS PAGE" s={pageSums} />
                <SumRow label="AMOUNT FORWARDED" s={forwarded} />
                <SumRow label="TOTAL TO DATE" s={toDate} />
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-center text-[11px] text-app-hint">
            표를 옆으로 당겨서 보세요 · 줄을 누르면 수정할 수 있어요
          </p>
        </>
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
