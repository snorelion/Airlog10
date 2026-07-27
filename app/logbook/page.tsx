'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getFlights, sync, onStoreChange, type Flight } from '@/lib/store'
import { OTHER_TYPE } from '@/lib/aggregate'
import { minToHMGrouped } from '@/lib/time'
import Nav from '@/components/Nav'
import { useT, fmt } from '@/lib/i18n'
import { logbook as dict } from '@/lib/i18n/logbook'

const PAGE_SIZE = 50

export default function LogbookPage() {
  const router = useRouter()
  const t = useT(dict)
  const [flights, setFlights] = useState<Flight[]>([])
  const [page, setPage] = useState(1)
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [capFilter, setCapFilter] = useState<'ALL' | 'PIC' | 'SIC'>('ALL')
  const [pfOnly, setPfOnly] = useState(false)
  // 통계에서 넘어온 필터 (?year=2025 · ?type=B737-800 · ?airport=VTBD)
  // useSearchParams는 Suspense가 필요해 빌드가 깨진 전례가 있어 직접 읽는다
  const [yearFilter, setYearFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [airportFilter, setAirportFilter] = useState('')

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setYearFilter(p.get('year') ?? '')
    setTypeFilter(p.get('type') ?? '')
    setAirportFilter((p.get('airport') ?? '').toUpperCase())
  }, [])

  function clearDrill() {
    setYearFilter('')
    setTypeFilter('')
    setAirportFilter('')
    setPage(1)
    router.replace('/logbook')  // 새로고침해도 안 돌아오게 주소도 정리
  }

  async function load() {
    const rows = await getFlights()
    rows.sort((a, b) =>
      b.flight_date.localeCompare(a.flight_date) || (b.created_at ?? '').localeCompare(a.created_at ?? '')
    )
    setFlights(rows)
    setLoaded(true)
  }

  useEffect(() => {
    void load()
    void sync().then(load)
    return onStoreChange(() => { void load() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const zeroCount = flights.filter((f) => f.total_min === 0 && f.sim_min === 0).length

  // 검색·필터 (오프라인 로컬 사본에서 즉시)
  const q = query.trim().toUpperCase()
  const filtered = flights.filter((f) => {
    if (yearFilter && f.flight_date.slice(0, 4) !== yearFilter) return false
    if (typeFilter && (f.aircraft_type || OTHER_TYPE) !== typeFilter) return false
    if (airportFilter && f.origin !== airportFilter && f.destination !== airportFilter) return false
    if (capFilter !== 'ALL' && (f.capacity ?? '') !== capFilter) return false
    if (pfOnly && !f.is_pf) return false
    if (!q) return true
    const hay = [
      f.flight_date, f.flight_number, f.origin, f.destination,
      f.aircraft_reg, f.aircraft_type, f.crew_pic, f.crew_sic, f.remarks,
    ].filter(Boolean).join(' ').toUpperCase()
    return hay.includes(q)
  })

  const total = filtered.length
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const p = Math.min(page, lastPage)
  const rows = filtered.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)

  // 같은 날 레그를 하루 단위로 묶는다 (날짜가 줄마다 반복되지 않게).
  // rows는 최신순 정렬이라 같은 날짜가 연달아 온다.
  type Item =
    | { kind: 'date'; date: string; count: number; min: number }
    | { kind: 'flight'; f: Flight; crew: string }
  const items: Item[] = []
  for (let i = 0; i < rows.length; ) {
    const d = rows[i].flight_date
    let j = i
    let min = 0
    while (j < rows.length && rows[j].flight_date === d) { min += rows[j].total_min; j++ }
    items.push({ kind: 'date', date: d, count: j - i, min })
    for (let k = i; k < j; k++) {
      const f = rows[k]
      // 통상 상대 조종사 — 내가 기장이면 부기장(FO), 내가 부기장이면 기장(CAP)
      const other = f.capacity === 'SIC' ? f.crew_pic : f.crew_sic
      items.push({ kind: 'flight', f, crew: other ? `${f.capacity === 'SIC' ? 'CAP' : 'FO'} ${other}` : '' })
    }
    i = j
  }

  // 로그북은 정보가 촘촘한 화면 — 좌우 여백을 px-3으로 당겨 내용 폭을 벌었다
  return (
    <main className="mx-auto max-w-lg px-3 pb-24 pt-6">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">{t.title}</h1>
        <p className="text-sm text-app-hint">{fmt(t.flightCount, { n: total.toLocaleString() })}</p>
      </div>

      {/* 목록 ↔ 장부 전환 — 장부(넓은 표)가 작은 링크에 숨어 있어 못 찾던 문제 해결 */}
      <div className="mb-3 flex overflow-hidden rounded-lg border border-app-line text-xs font-semibold">
        <span className="bg-app-btn px-3 py-1.5 text-white">{t.list}</span>
        <Link href="/logbook/ledger" className="px-3 py-1.5 text-app-sub">{t.ledger}</Link>
      </div>

      {/* 검색과 필터를 두 줄로 — 한 줄에 다 넣으면 좁은 폰에서 검색창이 쪼그라들고
          PF 버튼이 끝으로 밀려 줄이 안 맞는다 */}
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setPage(1) }}
        placeholder={t.searchPlaceholder}
        className="mb-2 w-full rounded-xl border border-app-line bg-app-surface px-3 py-2 text-sm outline-none focus:border-air-400"
      />
      <div className="mb-3 flex items-center gap-2">
        {(['ALL', 'PIC', 'SIC'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => { setCapFilter(c); setPage(1) }}
            className={
              'rounded-lg px-3 py-1.5 text-xs font-semibold ' +
              (capFilter === c ? 'bg-app-btn text-white' : 'bg-app-surface text-app-sub border border-app-line')
            }
          >
            {c === 'ALL' ? t.all : c === OTHER_TYPE ? t.otherType : c}
          </button>
        ))}
        <span className="mx-0.5 h-5 w-px bg-app-line" />
        <button
          type="button"
          onClick={() => { setPfOnly(!pfOnly); setPage(1) }}
          className={
            'rounded-lg px-3 py-1.5 text-xs font-semibold ' +
            (pfOnly ? 'bg-app-btn text-white' : 'bg-app-surface text-app-sub border border-app-line')
          }
        >
          PF
        </button>
      </div>

      {(yearFilter || typeFilter || airportFilter) && (
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-app-accent-soft px-3 py-1.5 text-sm font-semibold text-app-accent">
            {yearFilter && fmt(t.yearChip, { year: yearFilter })}
            {typeFilter && <span className="font-mono">{typeFilter}</span>}
            {airportFilter && <span className="font-mono">{airportFilter}</span>}
            <button type="button" onClick={clearDrill} aria-label={t.clearFilter} className="text-app-accent">✕</button>
          </span>
          <span className="text-xs text-app-hint">{fmt(t.filteredCount, { n: total.toLocaleString() })}</span>
        </div>
      )}

      {zeroCount > 0 && (
        <Link href="/logbook/fix"
          className="mb-3 block rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/25 dark:text-amber-200">
          {fmt(t.zeroTime, { n: zeroCount })}
        </Link>
      )}

      {!loaded ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-hint">{t.loading}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-sub">
          {t.emptyPrefix}{' '}
          <Link href="/import" className="text-app-accent underline">{t.importLink}</Link>{t.emptySuffix}
        </div>
      ) : (
        <>
          {/* 하루 묶음 + 칸 제목이 있는 '가벼운 표'.
              칸 제목이 있어야 옆으로 당겼을 때 나올 내용이 예고돼 덧붙인 판처럼 안 보인다.
              구간(ROUTE) 칸은 고정 — 당겨도 어느 비행인지 안 잃는다. */}
          <div className="overflow-hidden rounded-2xl border border-app-line bg-app-surface">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-separate border-spacing-0" style={{ minWidth: 614 }}>
                <colgroup>
                  <col style={{ width: 150 }} />
                  <col style={{ width: 54 }} />
                  <col style={{ width: 116 }} />
                  <col style={{ width: 72 }} />
                  <col style={{ width: 92 }} />
                  <col style={{ width: 130 }} />
                </colgroup>
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-app-hint">
                    <th className="sticky left-0 z-20 border-b border-app-line bg-app-bg px-3 py-1.5 text-left font-semibold">Route</th>
                    <th className="border-b border-app-line bg-app-bg px-2 py-1.5 text-right font-semibold">Time</th>
                    <th className="border-b border-app-line bg-app-bg px-2 py-1.5 text-left font-semibold">Aircraft</th>
                    <th className="border-b border-app-line bg-app-bg px-2 py-1.5 text-left font-semibold">Role</th>
                    <th className="border-b border-app-line bg-app-bg px-2 py-1.5 text-left font-semibold">Crew</th>
                    <th className="border-b border-app-line bg-app-bg px-2 py-1.5 text-left font-semibold">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) =>
                    it.kind === 'date' ? (
                      <tr key={`d-${it.date}`}>
                        {/* 날짜 글자는 sticky — 옆으로 당겨도 그날이 뭔지 보인다 */}
                        <td colSpan={6} className="border-b border-app-line bg-app-bg py-1.5">
                          <span className="sticky left-0 inline-block px-3 text-xs font-semibold text-app-sub">
                            {fmt(t.dayHeader, { date: it.date, n: it.count, time: minToHMGrouped(it.min) })}
                          </span>
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={it.f.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/flights/new?edit=${it.f.id}`)}
                      >
                        <td className="sticky left-0 z-10 truncate border-b border-app-line bg-app-surface px-3 py-2 font-semibold">
                          {it.f.origin ?? '?'} → {it.f.destination ?? '?'}
                          {it.f.flight_number && (
                            <span className="ml-1.5 text-[11px] font-normal text-app-hint">{it.f.flight_number}</span>
                          )}
                        </td>
                        <td className="border-b border-app-line px-2 py-2 text-right font-semibold tabular-nums">
                          {minToHMGrouped(it.f.total_min)}
                        </td>
                        <td className="truncate border-b border-app-line px-2 py-2 text-xs text-app-sub">
                          <span className="font-mono">{it.f.aircraft_reg ?? ''}</span>
                          {it.f.aircraft_type ? ` ${it.f.aircraft_type}` : ''}
                        </td>
                        <td className="truncate border-b border-app-line px-2 py-2 text-xs text-app-sub">
                          {it.f.capacity ?? ''}
                          {it.f.is_pf ? ' PF' : ''}
                          {it.f.night_min > 0 ? ' 🌙' : ''}
                        </td>
                        <td className="truncate border-b border-app-line px-2 py-2 text-xs text-app-sub">
                          {it.crew}
                        </td>
                        <td className="truncate border-b border-app-line px-2 py-2 text-xs text-app-hint">
                          {it.f.remarks ?? ''}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-app-hint">
            {t.swipeHint}
          </p>
        </>
      )}

      {lastPage > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          {p > 1 ? (
            <button onClick={() => setPage(p - 1)} className="rounded-lg border border-app-line bg-app-surface px-4 py-2">
              {t.newer}
            </button>
          ) : <span className="px-4 py-2 text-app-hint">{t.newer}</span>}
          <span className="text-app-sub">{p} / {lastPage}</span>
          {p < lastPage ? (
            <button onClick={() => setPage(p + 1)} className="rounded-lg border border-app-line bg-app-surface px-4 py-2">
              {t.older}
            </button>
          ) : <span className="px-4 py-2 text-app-hint">{t.older}</span>}
        </div>
      )}

      <Nav />
    </main>
  )
}
