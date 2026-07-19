import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase-server'
import { minToHMGrouped } from '@/lib/time'
import Nav from '@/components/Nav'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

export default async function LogbookPage({
  searchParams,
}: {
  searchParams: { p?: string }
}) {
  const page = Math.max(1, parseInt(searchParams.p ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE

  const supabase = createServerSupabase()
  const { data: flights, count } = await supabase
    .from('flights')
    .select('id, flight_date, flight_number, origin, destination, aircraft_reg, aircraft_type, total_min, night_min, capacity, is_pf', { count: 'exact' })
    .eq('deleted', false)
    .order('flight_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  const total = count ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">로그북</h1>
        <p className="text-sm text-ink-hint">{total.toLocaleString()}편</p>
      </div>

      {(flights ?? []).length === 0 ? (
        <div className="rounded-2xl border border-ink-line bg-white p-8 text-center text-ink-sub">
          아직 기록이 없어요.{' '}
          <Link href="/import" className="text-air-600 underline">가져오기</Link>부터 시작해 보세요.
        </div>
      ) : (
        <div className="divide-y divide-ink-line overflow-hidden rounded-2xl border border-ink-line bg-white">
          {(flights ?? []).map((f) => (
            <div key={f.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold">
                  {f.origin ?? '?'} → {f.destination ?? '?'}
                  {f.flight_number && (
                    <span className="ml-2 text-xs font-normal text-ink-hint">{f.flight_number}</span>
                  )}
                </p>
                <p className="font-semibold tabular-nums">{minToHMGrouped(f.total_min)}</p>
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
          {page > 1 ? (
            <Link href={`/logbook?p=${page - 1}`} className="rounded-lg border border-ink-line bg-white px-4 py-2">
              ← 최근
            </Link>
          ) : <span className="px-4 py-2 text-ink-hint">← 최근</span>}
          <span className="text-ink-sub">{page} / {lastPage}</span>
          {page < lastPage ? (
            <Link href={`/logbook?p=${page + 1}`} className="rounded-lg border border-ink-line bg-white px-4 py-2">
              과거 →
            </Link>
          ) : <span className="px-4 py-2 text-ink-hint">과거 →</span>}
        </div>
      )}

      <Nav />
    </main>
  )
}
