'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getFlights, deleteFlight, sync, onStoreChange, type Flight } from '@/lib/store'
import { minToHMGrouped } from '@/lib/time'
import { Trash2 } from 'lucide-react'
import Nav from '@/components/Nav'

const PAGE_SIZE = 50

export default function LogbookPage() {
  const router = useRouter()
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
    if (typeFilter && (f.aircraft_type || '기타') !== typeFilter) return false
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

  // 로그북은 정보가 촘촘한 화면 — 좌우 여백을 px-3으로 당겨 내용 폭을 벌었다
  return (
    <main className="mx-auto max-w-lg px-3 pb-24 pt-6">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">로그북</h1>
        <p className="text-sm text-app-hint">{total.toLocaleString()}편</p>
      </div>

      {/* 목록 ↔ 장부 전환 — 장부(넓은 표)가 작은 링크에 숨어 있어 못 찾던 문제 해결 */}
      <div className="mb-3 flex overflow-hidden rounded-lg border border-app-line text-xs font-semibold">
        <span className="bg-app-btn px-3 py-1.5 text-white">목록</span>
        <Link href="/logbook/ledger" className="px-3 py-1.5 text-app-sub">장부</Link>
      </div>

      {/* 검색과 필터를 두 줄로 — 한 줄에 다 넣으면 좁은 폰에서 검색창이 쪼그라들고
          PF 버튼이 끝으로 밀려 줄이 안 맞는다 */}
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setPage(1) }}
        placeholder="검색: 공항·편명·기체·크루·메모"
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
            {c === 'ALL' ? '전체' : c}
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
            {yearFilter && `${yearFilter}년`}
            {typeFilter && <span className="font-mono">{typeFilter}</span>}
            {airportFilter && <span className="font-mono">{airportFilter}</span>}
            <button type="button" onClick={clearDrill} aria-label="필터 지우기" className="text-app-accent">✕</button>
          </span>
          <span className="text-xs text-app-hint">{total.toLocaleString()}편만 보는 중</span>
        </div>
      )}

      {zeroCount > 0 && (
        <Link href="/logbook/fix"
          className="mb-3 block rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/25 dark:text-amber-200">
          ⏱️ 시간이 비어 있는 기록 {zeroCount}건 — 정리하러 가기 →
        </Link>
      )}

      {!loaded ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-hint">불러오는 중…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-sub">
          아직 기록이 없어요.{' '}
          <Link href="/import" className="text-app-accent underline">가져오기</Link>부터 시작해 보세요.
        </div>
      ) : (
        <>
          {/* 폰 폭에 다 넣지 않고, 옆으로 살짝 당기면 크루·메모가 나오게.
              항상 보이는 칸 320px + 당겨서 보는 칸 200px (모든 줄이 같은 폭이라 칸이 맞음) */}
          <div className="overflow-hidden rounded-2xl border border-app-line bg-app-surface">
            <div className="overflow-x-auto">
              <div className="min-w-[520px] divide-y divide-app-line">
                {rows.map((f) => {
                  // 통상 상대 조종사 — 내가 기장이면 부기장, 내가 부기장이면 기장
                  const otherCrew = f.capacity === 'SIC' ? f.crew_pic : f.crew_sic
                  const otherLabel = f.capacity === 'SIC' ? 'CAP' : 'FO'
                  return (
                    <div
                      key={f.id}
                      className="flex cursor-pointer items-stretch"
                      onClick={() => router.push(`/flights/new?edit=${f.id}`)}
                    >
                      {/* 항상 보이는 칸 */}
                      <div className="w-[320px] shrink-0 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate font-semibold">
                            {f.origin ?? '?'} → {f.destination ?? '?'}
                            {f.flight_number && (
                              <span className="ml-2 text-xs font-normal text-app-hint">{f.flight_number}</span>
                            )}
                          </p>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <p className="font-semibold tabular-nums">{minToHMGrouped(f.total_min)}</p>
                            <button
                              type="button"
                              aria-label="기록 삭제"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (window.confirm(`${f.flight_date} ${f.origin ?? '?'}→${f.destination ?? '?'} 기록을 삭제할까요?`)) {
                                  void deleteFlight(f.id)
                                }
                              }}
                              className="p-1 text-app-hint hover:text-red-500"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-app-hint">
                          <span className="min-w-0 truncate">
                            {f.flight_date}
                            {f.aircraft_reg ? ` · ${f.aircraft_reg}` : ''}
                            {f.aircraft_type ? ` ${f.aircraft_type}` : ''}
                          </span>
                          <span className="shrink-0">
                            {f.capacity ?? ''}
                            {f.is_pf ? ' · PF' : ''}
                            {f.night_min > 0 ? ' · 🌙' : ''}
                          </span>
                        </div>
                      </div>
                      {/* 옆으로 당기면 나오는 칸 — 크루·메모 */}
                      <div className="w-[200px] shrink-0 border-l border-app-line px-3 py-2.5 text-xs">
                        <p className="truncate text-app-sub">
                          {otherCrew ? `${otherLabel} ${otherCrew}` : ''}
                        </p>
                        <p className="mt-0.5 truncate text-app-hint">
                          {f.remarks ? `📝 ${f.remarks}` : ''}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-app-hint">
            옆으로 살짝 당기면 크루·메모가 보여요 · 자세히 보려면 [장부]
          </p>
        </>
      )}

      {lastPage > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          {p > 1 ? (
            <button onClick={() => setPage(p - 1)} className="rounded-lg border border-app-line bg-app-surface px-4 py-2">
              ← 최근
            </button>
          ) : <span className="px-4 py-2 text-app-hint">← 최근</span>}
          <span className="text-app-sub">{p} / {lastPage}</span>
          {p < lastPage ? (
            <button onClick={() => setPage(p + 1)} className="rounded-lg border border-app-line bg-app-surface px-4 py-2">
              과거 →
            </button>
          ) : <span className="px-4 py-2 text-app-hint">과거 →</span>}
        </div>
      )}

      <Nav />
    </main>
  )
}
