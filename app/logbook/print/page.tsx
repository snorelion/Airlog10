'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getFlights, getSetting, type Flight } from '@/lib/store'
import { sortChrono, computeTotals, type Totals } from '@/lib/aggregate'
import { minToHM, minToHMGrouped } from '@/lib/time'

// 인쇄용 로그북 — 브라우저 인쇄에서 "PDF로 저장"을 누르면 표준 로그북 PDF가 된다.
// 종이 로그북처럼 20행/장 + 장마다 3단 합계 + 서명란.
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

type PilotInfo = { name: string; licence: string; airline: string; employee: string }

export default function PrintPage() {
  const [all, setAll] = useState<Flight[]>([])
  const [pilot, setPilot] = useState<PilotInfo>({ name: '', licence: '', airline: '', employee: '' })
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void (async () => {
      const flights = sortChrono(await getFlights())
      setAll(flights)
      setTotals(computeTotals(flights))
      setPilot({
        name: (await getSetting('pilotName')) ?? '',
        licence: (await getSetting('licenceNo')) ?? '',
        airline: (await getSetting('airline')) ?? '',
        employee: (await getSetting('employeeNo')) ?? '',
      })
      setLoaded(true)
    })()
  }, [])

  const pages: Flight[][] = []
  for (let i = 0; i < all.length; i += ROWS) pages.push(all.slice(i, i + ROWS))

  const td = 'border border-gray-400 px-1 py-0.5 text-center whitespace-nowrap'
  const th = 'border border-gray-400 bg-gray-100 px-1 py-0.5 text-center font-semibold whitespace-nowrap'

  function SumRow({ label, s }: { label: string; s: Sums }) {
    return (
      <tr className="bg-gray-50 font-semibold">
        <td colSpan={6} className={td + ' !text-right pr-2'}>{label}</td>
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
      </tr>
    )
  }

  // 장별 합계를 미리 계산 (렌더 중 상태 변형 금지)
  const pageData: { rows: Flight[]; forwarded: Sums; pageSums: Sums; toDate: Sums }[] = []
  {
    let carried = emptySums()
    for (const rows of pages) {
      const forwarded = { ...carried }
      const pageSums = emptySums()
      for (const f of rows) addRow(pageSums, f)
      const toDate = emptySums()
      for (const key of Object.keys(toDate) as (keyof Sums)[]) toDate[key] = forwarded[key] + pageSums[key]
      carried = toDate
      pageData.push({ rows, forwarded, pageSums, toDate })
    }
  }

  return (
    <main className="mx-auto max-w-6xl bg-white px-4 py-6 text-black">
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: A4 landscape; margin: 9mm; }
        @media print {
          .no-print { display: none !important; }
          .print-page { page-break-after: always; }
          body { background: white !important; }
        }
      ` }} />

      <div className="no-print mb-4 flex items-center justify-between rounded-xl border border-ink-line bg-ink-bg px-4 py-3">
        <Link href="/logbook/ledger" className="text-sm text-air-600">← 장부로</Link>
        <p className="text-xs text-ink-sub">인쇄 창에서 "PDF로 저장" · 용지 방향 가로(landscape) 권장</p>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-air-600 px-4 py-2 text-sm font-semibold text-white"
        >
          인쇄 / PDF 저장
        </button>
      </div>

      {!loaded ? (
        <p className="p-8 text-center text-ink-hint">불러오는 중…</p>
      ) : (
        <>
          {/* 표지 요약 */}
          <div className="print-page">
            <h1 className="text-2xl font-extrabold">PILOT LOGBOOK</h1>
            <table className="mt-4 text-sm">
              <tbody>
                <tr><td className="pr-6 py-1 text-gray-500">NAME</td><td className="font-semibold">{pilot.name || '—'}</td></tr>
                <tr><td className="pr-6 py-1 text-gray-500">LICENCE No.</td><td className="font-semibold">{pilot.licence || '—'}</td></tr>
                <tr><td className="pr-6 py-1 text-gray-500">AIRLINE</td><td className="font-semibold">{pilot.airline || '—'}</td></tr>
                <tr><td className="pr-6 py-1 text-gray-500">EMPLOYEE No.</td><td className="font-semibold">{pilot.employee || '—'}</td></tr>
                <tr><td className="pr-6 py-1 text-gray-500">PERIOD</td><td className="font-semibold">{totals?.first_date} ~ {totals?.last_date}</td></tr>
                <tr><td className="pr-6 py-1 text-gray-500">TOTAL TIME</td><td className="font-semibold">{minToHMGrouped(totals?.total_min ?? 0)} ({(totals?.flights ?? 0).toLocaleString()} flights)</td></tr>
                <tr><td className="pr-6 py-1 text-gray-500">PIC / SIC</td><td className="font-semibold">{minToHMGrouped(totals?.pic_min ?? 0)} / {minToHMGrouped(totals?.sic_min ?? 0)}</td></tr>
                <tr><td className="pr-6 py-1 text-gray-500">NIGHT / INST</td><td className="font-semibold">{minToHMGrouped(totals?.night_min ?? 0)} / {minToHMGrouped(totals?.inst_min ?? 0)}</td></tr>
                <tr><td className="pr-6 py-1 text-gray-500">GENERATED</td><td className="font-semibold">{new Date().toISOString().slice(0, 10)} · AirLog10</td></tr>
              </tbody>
            </table>
          </div>

          {/* 장부 페이지들 */}
          {pageData.map(({ rows, forwarded, pageSums, toDate }, pi) => {
            return (
              <div key={pi} className="print-page mt-6">
                <div className="mb-1 flex items-center justify-between text-[10px] text-gray-500">
                  <span>{pilot.name}</span>
                  <span>PAGE {pi + 1} / {pages.length}</span>
                </div>
                <table className="w-full border-collapse text-[9px] tabular-nums">
                  <thead>
                    <tr>
                      <th className={th}>DATE</th>
                      <th className={th}>TYPE</th>
                      <th className={th}>IDENT</th>
                      <th className={th}>FROM</th>
                      <th className={th}>TO</th>
                      <th className={th}>FLT #</th>
                      <th className={th}>TOTAL</th>
                      <th className={th}>FLT TIME</th>
                      <th className={th}>NIGHT</th>
                      <th className={th}>ACT INST</th>
                      <th className={th}>APCH</th>
                      <th className={th}>T/O D/N</th>
                      <th className={th}>LDG D/N</th>
                      <th className={th}>PIC</th>
                      <th className={th}>SIC</th>
                      <th className={th}>DUAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((f) => (
                      <tr key={f.id}>
                        <td className={td}>{f.flight_date}</td>
                        <td className={td}>{f.aircraft_type ?? ''}</td>
                        <td className={td}>{f.aircraft_reg ?? ''}</td>
                        <td className={td}>{f.origin ?? ''}</td>
                        <td className={td}>{f.destination ?? ''}</td>
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
                      </tr>
                    ))}
                    <SumRow label="TOTAL THIS PAGE" s={pageSums} />
                    <SumRow label="AMOUNT FORWARDED" s={forwarded} />
                    <SumRow label="TOTAL TO DATE" s={toDate} />
                  </tbody>
                </table>
                <div className="mt-3 flex items-end justify-between text-[10px]">
                  <span>I certify that the entries in this log are true.</span>
                  <span className="pr-4">
                    PILOT&apos;S SIGNATURE&nbsp;&nbsp;______________________&nbsp;&nbsp;{pilot.name}
                  </span>
                </div>
              </div>
            )
          })}
        </>
      )}
    </main>
  )
}
