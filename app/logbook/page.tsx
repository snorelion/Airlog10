'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getFlights, deleteFlight, sync, onStoreChange, type Flight } from '@/lib/store'
import { minToHMGrouped } from '@/lib/time'
import { Trash2 } from 'lucide-react'
import Nav from '@/components/Nav'

const PAGE_SIZE = 50

export default function LogbookPage() {
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
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const p = Math.min(page, lastPage)
  const rows = flights.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">로그북</h1>
        <div className="flex items-center gap-3">
          <Link href="/logbook/ledger" className="text-sm font-medium text-air-600">장부 보기</Link>
          <p className="text-sm text-ink-hint">{total.toLocaleString()}편</p>
        </div>
      </div>

      {!loaded ? (
        <div className="rounded-2xl border border-ink-line bg-white p-8 text-center text-ink-hint">불러오는 중…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-ink-line bg-white p-8 text-center text-ink-sub">
          아직 기록이 없어요.{' '}
          <Link href="/import" className="text-air-600 underline">가져오기</Link>부터 시작해 보세요.
        </div>
      ) : (
        <div className="divide-y divide-ink-line overflow-hidden rounded-2xl border border-ink-line bg-white">
          {rows.map((f) => (
            <div key={f.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold">
                  {f.origin ?? '?'} → {f.destination ?? '?'}
                  {f.flight_number && (
                    <span className="ml-2 text-xs font-normal text-ink-hint">{f.flight_number}</span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <p className="font-semibold tabular-nums">{minToHMGrouped(f.total_min)}</p>
                  <button
                    type="button"
                    aria-label="기록 삭제"
                    onClick={() => {
                      if (window.confirm(`${f.flight_date} ${f.origin ?? '?'}→${f.destination ?? '?'} 기록을 삭제할까요?`)) {
                        void deleteFlight(f.id)
                      }
                    }}
                    className="p-1 text-ink-hint hover:text-red-500"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-xs text-ink-hint">
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
            <button onClick={() => setPage(p - 1)} className="rounded-lg border border-ink-line bg-white px-4 py-2">
              ← 최근
            </button>
          ) : <span className="px-4 py-2 text-ink-hint">← 최근</span>}
          <span className="text-ink-sub">{p} / {lastPage}</span>
          {p < lastPage ? (
            <button onClick={() => setPage(p + 1)} className="rounded-lg border border-ink-line bg-white px-4 py-2">
              과거 →
            </button>
          ) : <span className="px-4 py-2 text-ink-hint">과거 →</span>}
        </div>
      )}

      <Nav />
    </main>
  )
}
