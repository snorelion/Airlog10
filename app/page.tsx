'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getFlights, getPendingCount, getLastSyncAt, getSetting, sync, onStoreChange, type Flight } from '@/lib/store'
import { computeTotals, type Totals } from '@/lib/aggregate'
import { minToHMGrouped } from '@/lib/time'
import { Settings as SettingsIcon } from 'lucide-react'
import Nav from '@/components/Nav'

export default function HomePage() {
  const [totals, setTotals] = useState<Totals | null>(null)
  const [recent, setRecent] = useState<Flight[]>([])
  const [pending, setPending] = useState(0)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [expiries, setExpiries] = useState<{ label: string; date: string; dday: number }[]>([])
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const flights = await getFlights()
    setTotals(computeTotals(flights))
    const sorted = [...flights].sort((a, b) =>
      b.flight_date.localeCompare(a.flight_date) || (b.created_at ?? '').localeCompare(a.created_at ?? '')
    )
    setRecent(sorted.slice(0, 5))
    setPending(await getPendingCount())
    setLastSync(await getLastSyncAt())

    // 자격 만료 D-day (설정에 넣어둔 것만)
    const defs = [
      ['medicalExpiry', '메디컬'],
      ['englishExpiry', '영어 자격'],
      ['recurrentExpiry', '리커런트'],
    ] as const
    const items: { label: string; date: string; dday: number }[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (const [key, label] of defs) {
      const d = await getSetting(key)
      if (d) {
        const dday = Math.ceil((new Date(d + 'T00:00:00').getTime() - today.getTime()) / 86400000)
        items.push({ label, date: d, dday })
      }
    }
    items.sort((a, b) => a.dday - b.dday)
    setExpiries(items)
    setLoaded(true)
  }

  useEffect(() => {
    void load()               // 1) 로컬 사본 즉시 표시 (오프라인 OK)
    void sync().then(load)    // 2) 온라인이면 뒤에서 동기화 후 갱신
    return onStoreChange(() => { void load() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const empty = loaded && (totals?.flights ?? 0) === 0

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <header className="mb-5 flex items-center justify-between">
        <div className="text-2xl font-extrabold tracking-tight text-air-800">
          Air<span className="text-air-400">Log</span>10
        </div>
        <div className="flex items-center gap-2">
          {pending > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
              업로드 대기 {pending}
            </span>
          )}
          <Link href="/settings" aria-label="설정" className="p-1 text-ink-hint">
            <SettingsIcon size={20} />
          </Link>
        </div>
      </header>

      {!loaded ? (
        <div className="rounded-2xl border border-ink-line bg-white p-8 text-center text-ink-hint">
          불러오는 중…
        </div>
      ) : empty ? (
        <div className="rounded-2xl border border-ink-line bg-white p-6 text-center">
          <p className="text-4xl">✈️</p>
          <h2 className="mt-3 text-lg font-bold">로그북을 시작해 볼까요?</h2>
          <p className="mt-1 text-sm text-ink-sub">
            기존 로그북 파일을 가져오거나, 첫 비행을 직접 기록해 보세요.
          </p>
          <div className="mt-5 space-y-2">
            <Link href="/import" className="block rounded-xl bg-air-600 py-3 font-semibold text-white">
              기존 로그북 가져오기
            </Link>
            <Link href="/flights/new" className="block rounded-xl border border-ink-line py-3 font-semibold">
              비행 직접 기록하기
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-air-800 p-5 text-white">
            <p className="text-sm text-air-200">총 비행시간</p>
            <p className="mt-1 text-4xl font-extrabold tabular-nums">
              {minToHMGrouped(totals?.total_min ?? 0)}
            </p>
            <p className="mt-2 text-sm text-air-100">
              {(totals?.flights ?? 0).toLocaleString()}편 · 착륙 {(totals?.landings ?? 0).toLocaleString()}회
            </p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <StatCard label="PIC" value={minToHMGrouped(totals?.pic_min ?? 0)} />
            <StatCard label="SIC" value={minToHMGrouped(totals?.sic_min ?? 0)} />
            <StatCard label="야간" value={minToHMGrouped(totals?.night_min ?? 0)} />
          </div>

          {expiries.length > 0 && (
            <div className="mt-3 rounded-2xl border border-ink-line bg-white p-4">
              <h2 className="text-sm font-semibold text-ink-sub">자격 만료</h2>
              <div className="mt-2 space-y-1.5">
                {expiries.map((e) => (
                  <div key={e.label} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{e.label}</span>
                    <span className="text-xs text-ink-hint">{e.date}</span>
                    <span className={
                      'rounded-full px-2 py-0.5 text-xs font-bold ' +
                      (e.dday < 0 ? 'bg-red-100 text-red-700'
                        : e.dday <= 30 ? 'bg-red-50 text-red-600'
                        : e.dday <= 60 ? 'bg-amber-50 text-amber-600'
                        : 'bg-ink-bg text-ink-sub')
                    }>
                      {e.dday < 0 ? `만료 ${-e.dday}일 지남` : `D-${e.dday}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-sub">최근 비행</h2>
          <div className="divide-y divide-ink-line overflow-hidden rounded-2xl border border-ink-line bg-white">
            {recent.map((f) => (
              <div key={f.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-semibold">
                    {f.origin ?? '?'} → {f.destination ?? '?'}
                    {f.flight_number && <span className="ml-2 text-xs font-normal text-ink-hint">{f.flight_number}</span>}
                  </p>
                  <p className="text-xs text-ink-hint">{f.flight_date} · {f.aircraft_reg ?? ''}</p>
                </div>
                <p className="font-semibold tabular-nums">{minToHMGrouped(f.total_min)}</p>
              </div>
            ))}
          </div>

          {lastSync && (
            <p className="mt-4 text-center text-xs text-ink-hint">
              마지막 동기화 {new Date(lastSync).toLocaleString('ko-KR')} · 오프라인에서도 모든 기록을 볼 수 있어요
            </p>
          )}
        </>
      )}

      <Nav />
    </main>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-line bg-white p-3 text-center">
      <p className="text-xs text-ink-hint">{label}</p>
      <p className="mt-0.5 font-bold tabular-nums">{value}</p>
    </div>
  )
}
