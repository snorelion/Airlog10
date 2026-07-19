import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase-server'
import { minToHMGrouped } from '@/lib/time'
import Nav from '@/components/Nav'

export const dynamic = 'force-dynamic'

type Totals = {
  flights: number
  total_min: number
  pic_min: number
  sic_min: number
  picus_min: number
  night_min: number
  inst_min: number
  landings: number
  first_date: string | null
  last_date: string | null
}

export default async function HomePage() {
  const supabase = createServerSupabase()
  const { data: totalsRaw } = await supabase.rpc('my_totals')
  const totals = (totalsRaw ?? {}) as Partial<Totals>

  const { data: recent } = await supabase
    .from('flights')
    .select('id, flight_date, flight_number, origin, destination, aircraft_reg, total_min')
    .eq('deleted', false)
    .order('flight_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5)

  const empty = !totals.flights

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <header className="mb-5 flex items-center justify-between">
        <div className="text-2xl font-extrabold tracking-tight text-air-800">
          Air<span className="text-air-400">Log</span>10
        </div>
      </header>

      {empty ? (
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
              {minToHMGrouped(totals.total_min ?? 0)}
            </p>
            <p className="mt-2 text-sm text-air-100">
              {Number(totals.flights ?? 0).toLocaleString()}편 · 착륙 {Number(totals.landings ?? 0).toLocaleString()}회
            </p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <StatCard label="PIC" value={minToHMGrouped(totals.pic_min ?? 0)} />
            <StatCard label="SIC" value={minToHMGrouped(totals.sic_min ?? 0)} />
            <StatCard label="야간" value={minToHMGrouped(totals.night_min ?? 0)} />
          </div>

          <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-sub">최근 비행</h2>
          <div className="divide-y divide-ink-line overflow-hidden rounded-2xl border border-ink-line bg-white">
            {(recent ?? []).map((f) => (
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
