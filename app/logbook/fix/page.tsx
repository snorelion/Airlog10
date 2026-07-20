'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getFlights, updateFlight, type Flight } from '@/lib/store'
import { hmToMin, minToHM } from '@/lib/time'
import Nav from '@/components/Nav'

// 시간이 0:00으로 비어 있는 기록을 한 곳에서 정리하는 도구
export default function FixPage() {
  const [rows, setRows] = useState<Flight[]>([])
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const flights = await getFlights()
    const zero = flights
      .filter((f) => f.total_min === 0)
      .sort((a, b) => a.flight_date.localeCompare(b.flight_date))
    setRows(zero)
    setLoaded(true)
  }

  useEffect(() => { void load() }, [])

  async function saveRow(f: Flight) {
    const min = hmToMin(inputs[f.id] ?? '')
    if (min <= 0) return
    const next: Flight = {
      ...f,
      total_min: min,
      multi_pilot_min: min,
      pic_min: f.capacity === 'PIC' ? min : f.pic_min,
      sic_min: f.capacity === 'SIC' ? min : f.sic_min,
      picus_min: f.capacity === 'PICUS' ? min : f.picus_min,
    }
    await updateFlight(next)
    setSavedIds((prev) => {
      const s = new Set(Array.from(prev))
      s.add(f.id)
      return s
    })
  }

  const remaining = rows.filter((f) => !savedIds.has(f.id))

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">빈 시간 정리</h1>
        <Link href="/logbook" className="text-sm text-app-accent">로그북으로</Link>
      </div>

      <p className="mb-3 text-sm text-app-sub">
        원본 파일에 시간이 비어 있던 기록이에요. 비행시간을 넣고 저장하면 합계에 반영돼요.
        (예: <span className="font-mono">1:05</span> 또는 <span className="font-mono">105</span>)
      </p>

      {!loaded ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-hint">불러오는 중…</div>
      ) : remaining.length === 0 ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center">
          <p className="text-3xl">✨</p>
          <p className="mt-2 font-semibold">빈 시간 기록이 없어요!</p>
        </div>
      ) : (
        <div className="divide-y divide-app-line overflow-hidden rounded-2xl border border-app-line bg-app-surface">
          {remaining.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1">
                <p className="font-semibold">
                  {f.origin ?? '?'} → {f.destination ?? '?'}
                  {f.flight_number && <span className="ml-2 text-xs font-normal text-app-hint">{f.flight_number}</span>}
                </p>
                <p className="text-xs text-app-hint">
                  {f.flight_date} · {f.aircraft_reg ?? ''}
                  {f.out_time && f.in_time ? ` · OUT ${f.out_time} IN ${f.in_time}` : ''}
                </p>
              </div>
              <input
                value={inputs[f.id] ?? ''}
                onChange={(e) => setInputs((prev) => ({ ...prev, [f.id]: e.target.value }))}
                onBlur={() => {
                  const m = hmToMin(inputs[f.id] ?? '')
                  if (m > 0) setInputs((prev) => ({ ...prev, [f.id]: minToHM(m) }))
                }}
                placeholder="1:05"
                inputMode="numeric"
                className="w-20 rounded-lg border border-app-line bg-app-surface px-2 py-2 text-center font-mono outline-none focus:border-air-400"
              />
              <button
                type="button"
                onClick={() => saveRow(f)}
                disabled={hmToMin(inputs[f.id] ?? '') <= 0}
                className="rounded-lg bg-app-btn px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                저장
              </button>
            </div>
          ))}
        </div>
      )}

      {savedIds.size > 0 && (
        <p className="mt-3 text-center text-sm text-green-600">{savedIds.size}건 저장했어요 ✓</p>
      )}

      <Nav />
    </main>
  )
}
