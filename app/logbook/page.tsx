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

  const total = flights.length
  const zeroCount = flights.filter((f) => f.total_min === 0).length
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const p = Math.min(page, lastPage)
  const rows = flights.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">로그북</h1>
        <div className="flex items-center gap-3">
          <Link href="/logbook/ledger" className="text-sm font-medium text-app-accent">장부 보기</Link>
          <p className="text-sm text-app-hint">{total.toLocaleString()}편</p>
        </div>
      </div>

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
        <div className="divide-y divide-app-line overflow-hidden rounded-2xl border border-app-line bg-app-surface">
          {rows.map((f) => (
            <div key={f.id} className="cursor-pointer px-4 py-3"
              onClick={() => router.push(`/flights/new?edit=${f.id}`)}>
              <div className="flex items-center justify-between">
                <p className="font-semibold">
                  {f.origin ?? '?'} → {f.destination ?? '?'}
                  {f.flight_number && (
                    <span className="ml-2 text-xs font-normal text-app-hint">{f.flight_number}</span>
                  )}
                </p>
                <div className="flex items-center gap-2">
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
              <div className="mt-0.5 flex items-center justify-between text-xs text-app-hint">
                <span>
                  {f.flight_date} · {f.aircraft_reg ?? ''}{f.aircraft_type ? ` (${f.aircraft_type})` : ''}
                </span>
                <span>
                  {f.capacity ?? ''}{f.is_pf ? ' · PF' : ''}
                  {f.night_min > 0 ? ' · 🌙' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
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
