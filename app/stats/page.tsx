import { createServerSupabase } from '@/lib/supabase-server'
import { minToHMGrouped } from '@/lib/time'
import Nav from '@/components/Nav'

export const dynamic = 'force-dynamic'

type Yearly = { yr: number; flights: number; total_min: number; night_min: number }
type ByType = { type: string; flights: number; total_min: number }
type TopAirport = { ident: string; visits: number }

export default async function StatsPage() {
  const supabase = createServerSupabase()
  const { data } = await supabase.rpc('my_stats')
  const yearly: Yearly[] = data?.yearly ?? []
  const byType: ByType[] = data?.by_type ?? []
  const topAirports: TopAirport[] = data?.top_airports ?? []

  // 공항 이름 붙이기
  const idents = topAirports.map((a) => a.ident)
  const nameMap = new Map<string, string>()
  if (idents.length) {
    const { data: aps } = await supabase
      .from('airports')
      .select('ident, name, municipality, iata')
      .in('ident', idents)
    for (const a of aps ?? []) {
      nameMap.set(a.ident, a.municipality || a.name || '')
    }
  }

  const maxVisits = topAirports[0]?.visits ?? 1

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-4 text-xl font-bold">통계</h1>

      {yearly.length === 0 ? (
        <div className="rounded-2xl border border-ink-line bg-white p-8 text-center text-ink-sub">
          기록이 쌓이면 통계가 여기 나타나요.
        </div>
      ) : (
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink-sub">연도별 비행시간</h2>
            <div className="overflow-hidden rounded-2xl border border-ink-line bg-white">
              {yearly.map((y) => (
                <div key={y.yr} className="flex items-center justify-between border-b border-ink-line px-4 py-2.5 last:border-0">
                  <span className="font-semibold">{y.yr}</span>
                  <span className="text-sm text-ink-hint">{Number(y.flights).toLocaleString()}편</span>
                  <span className="font-semibold tabular-nums">{minToHMGrouped(y.total_min)}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink-sub">기종별</h2>
            <div className="overflow-hidden rounded-2xl border border-ink-line bg-white">
              {byType.map((t) => (
                <div key={t.type} className="flex items-center justify-between border-b border-ink-line px-4 py-2.5 last:border-0">
                  <span className="font-mono font-semibold">{t.type}</span>
                  <span className="text-sm text-ink-hint">{Number(t.flights).toLocaleString()}편</span>
                  <span className="font-semibold tabular-nums">{minToHMGrouped(t.total_min)}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink-sub">많이 간 공항</h2>
            <div className="space-y-1.5 rounded-2xl border border-ink-line bg-white p-4">
              {topAirports.map((a) => (
                <div key={a.ident} className="flex items-center gap-2">
                  <span className="w-14 font-mono text-sm font-semibold">{a.ident}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-ink-bg">
                    <div
                      className="h-full rounded bg-air-400"
                      style={{ width: `${Math.max(4, (Number(a.visits) / Number(maxVisits)) * 100)}%` }}
                    />
                  </div>
                  <span className="w-24 truncate text-right text-xs text-ink-sub">
                    {nameMap.get(a.ident) || ''}
                  </span>
                  <span className="w-10 text-right text-sm font-semibold tabular-nums">{Number(a.visits)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <Nav />
    </main>
  )
}
