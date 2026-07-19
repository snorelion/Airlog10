'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { getFlights, getAirportNote, saveAirportNote } from '@/lib/store'
import WxCard from '@/components/WxCard'
import Nav from '@/components/Nav'

type AirportInfo = {
  ident: string
  iata: string | null
  name: string | null
  type: string | null
  lat: number | null
  lon: number | null
  elevation_ft: number | null
  country: string | null
  municipality: string | null
}

type Runway = {
  id: number
  le_ident: string | null
  he_ident: string | null
  length_ft: number | null
  width_ft: number | null
  surface: string | null
  lighted: boolean | null
  closed: boolean | null
}

export default function AirportPage() {
  const params = useParams<{ ident: string }>()
  const ident = (params.ident ?? '').toUpperCase()

  const [info, setInfo] = useState<AirportInfo | null>(null)
  const [runways, setRunways] = useState<Runway[]>([])
  const [visits, setVisits] = useState({ count: 0, first: '', last: '' })
  const [note, setNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    void (async () => {
      // 내 방문 기록 — 로컬 사본 (오프라인 OK)
      const flights = await getFlights()
      let count = 0, first = '', last = ''
      for (const f of flights) {
        if (f.origin === ident || f.destination === ident) {
          count += 1
          if (!first || f.flight_date < first) first = f.flight_date
          if (!last || f.flight_date > last) last = f.flight_date
        }
      }
      setVisits({ count, first, last })
      setNote(await getAirportNote(ident))

      // 공항 정보·활주로 — 온라인일 때
      if (!navigator.onLine) { setOffline(true); return }
      try {
        const supabase = createClient()
        const { data: ap } = await supabase.from('airports').select('*').eq('ident', ident).single()
        if (ap) setInfo(ap as AirportInfo)
        const { data: rw } = await supabase
          .from('runways')
          .select('id, le_ident, he_ident, length_ft, width_ft, surface, lighted, closed')
          .eq('airport_ident', ident)
          .order('length_ft', { ascending: false })
        setRunways(((rw ?? []) as Runway[]).filter((r) => !r.closed))
      } catch { setOffline(true) }
    })()
  }, [ident])

  async function saveNote() {
    await saveAirportNote(ident, note.trim())
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2000)
  }

  const ftToM = (ft: number) => Math.round(ft * 0.3048)

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-mono text-xl font-bold">
          {ident}
          {info?.iata && <span className="ml-2 text-base font-normal text-ink-hint">({info.iata})</span>}
        </h1>
        <Link href="/stats" className="text-sm text-air-600">통계로</Link>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-ink-line bg-white p-4">
          <p className="font-semibold">{info?.name ?? (offline ? '(오프라인 — 공항 정보는 온라인에서)' : '불러오는 중…')}</p>
          {info && (
            <p className="mt-1 text-sm text-ink-sub">
              {info.municipality ? info.municipality + ' · ' : ''}{info.country ?? ''}
              {info.elevation_ft !== null ? ` · 표고 ${info.elevation_ft.toLocaleString()} ft` : ''}
            </p>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-ink-bg p-2">
              <p className="text-xs text-ink-hint">내 방문</p>
              <p className="font-bold tabular-nums">{visits.count.toLocaleString()}회</p>
            </div>
            <div className="rounded-xl bg-ink-bg p-2">
              <p className="text-xs text-ink-hint">처음</p>
              <p className="text-sm font-semibold">{visits.first || '—'}</p>
            </div>
            <div className="rounded-xl bg-ink-bg p-2">
              <p className="text-xs text-ink-hint">마지막</p>
              <p className="text-sm font-semibold">{visits.last || '—'}</p>
            </div>
          </div>
        </div>

        <WxCard ident={ident} />

        {runways.length > 0 && (
          <div className="rounded-2xl border border-ink-line bg-white p-4">
            <h2 className="font-semibold">활주로</h2>
            <div className="mt-2 space-y-2">
              {runways.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl bg-ink-bg px-3 py-2">
                  <span className="font-mono text-lg font-bold">
                    {r.le_ident ?? '?'}/{r.he_ident ?? '?'}
                  </span>
                  <span className="text-sm text-ink-sub">
                    {r.length_ft ? `${r.length_ft.toLocaleString()} ft (${ftToM(r.length_ft).toLocaleString()} m)` : ''}
                    {r.surface ? ` · ${r.surface}` : ''}
                    {r.lighted ? ' · 💡' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-ink-line bg-white p-4">
          <h2 className="font-semibold">내 메모</h2>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="접근 팁, 택시 루트, 주의사항…"
            className="mt-2 w-full rounded-xl border border-ink-line bg-white px-3 py-2.5 text-sm outline-none focus:border-air-400"
          />
          <button onClick={saveNote} className="mt-2 w-full rounded-xl bg-air-600 py-2.5 font-semibold text-white">
            메모 저장
          </button>
          {noteSaved && <p className="mt-2 text-center text-sm text-green-600">저장했어요 ✓ (오프라인이어도 안전)</p>}
        </div>
      </div>

      <Nav />
    </main>
  )
}
