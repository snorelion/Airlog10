'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getFlights, getPeople, savePerson, getSetting, sync, onStoreChange, type Person } from '@/lib/store'
import Nav from '@/components/Nav'

type CrewAgg = {
  name: string
  flights: number
  lastDate: string
  roles: string          // '기장' | '부기장' | '기장·부기장'
  person: Person | null  // 저장된 사번·메모
}

export default function PeoplePage() {
  const [aggs, setAggs] = useState<CrewAgg[]>([])
  const [query, setQuery] = useState('')
  const [openName, setOpenName] = useState<string | null>(null)
  const [empNo, setEmpNo] = useState('')
  const [notes, setNotes] = useState('')
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const [flights, people, myName] = await Promise.all([
      getFlights(),
      getPeople(),
      getSetting('pilotName'),
    ])
    const pMap = new Map(people.map((p) => [p.name, p]))
    const map = new Map<string, { flights: number; lastDate: string; pic: boolean; sic: boolean }>()
    for (const f of flights) {
      for (const [nm, isPic] of [[f.crew_pic, true], [f.crew_sic, false]] as const) {
        if (!nm || nm === myName) continue
        const e = map.get(nm) ?? { flights: 0, lastDate: '', pic: false, sic: false }
        e.flights += 1
        if (f.flight_date > e.lastDate) e.lastDate = f.flight_date
        if (isPic) e.pic = true
        else e.sic = true
        map.set(nm, e)
      }
    }
    // 비행에는 없지만 직접 저장한 사람도 포함
    for (const p of people) {
      if (!map.has(p.name)) map.set(p.name, { flights: 0, lastDate: '', pic: false, sic: false })
    }
    const rows: CrewAgg[] = Array.from(map.entries()).map(([name, e]) => ({
      name,
      flights: e.flights,
      lastDate: e.lastDate,
      roles: e.pic && e.sic ? '기장·부기장' : e.pic ? '기장' : e.sic ? '부기장' : '',
      person: pMap.get(name) ?? null,
    }))
    rows.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.flights - a.flights)
    setAggs(rows)
    setLoaded(true)
  }

  useEffect(() => {
    void load()
    void sync().then(load)
    return onStoreChange(() => { void load() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(
    () => aggs.filter((a) => !query || a.name.includes(query)),
    [aggs, query]
  )

  function openEditor(a: CrewAgg) {
    if (openName === a.name) { setOpenName(null); return }
    setOpenName(a.name)
    setEmpNo(a.person?.employee_no ?? '')
    setNotes(a.person?.notes ?? '')
  }

  async function saveOpen() {
    if (!openName) return
    await savePerson({ name: openName, employee_no: empNo.trim() || null, notes: notes.trim() || null })
    setOpenName(null)
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">크루</h1>
        <Link href="/settings" className="text-sm text-air-600">설정으로</Link>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이름 검색"
        className="mb-3 w-full rounded-xl border border-ink-line bg-white px-4 py-2.5 outline-none focus:border-air-400"
      />

      {!loaded ? (
        <div className="rounded-2xl border border-ink-line bg-white p-8 text-center text-ink-hint">불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-ink-line bg-white p-8 text-center text-ink-sub">
          같이 비행한 크루가 기록에서 자동으로 모여요.
        </div>
      ) : (
        <div className="divide-y divide-ink-line overflow-hidden rounded-2xl border border-ink-line bg-white">
          {filtered.map((a) => (
            <div key={a.name}>
              <button type="button" onClick={() => openEditor(a)} className="w-full px-4 py-3 text-left">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">
                    {a.name}
                    {a.person?.employee_no && (
                      <span className="ml-2 text-xs font-normal text-ink-hint">#{a.person.employee_no}</span>
                    )}
                  </p>
                  <p className="text-sm tabular-nums text-ink-sub">{a.flights.toLocaleString()}편</p>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-xs text-ink-hint">
                  <span>{a.roles}{a.lastDate ? ` · 마지막 ${a.lastDate}` : ''}</span>
                  {a.person?.notes && <span>📝</span>}
                </div>
                {a.person?.notes && openName !== a.name && (
                  <p className="mt-1 truncate text-xs text-ink-sub">{a.person.notes}</p>
                )}
              </button>
              {openName === a.name && (
                <div className="space-y-2 border-t border-ink-line bg-ink-bg px-4 py-3">
                  <input
                    value={empNo}
                    onChange={(e) => setEmpNo(e.target.value)}
                    placeholder="사번"
                    className="w-full rounded-lg border border-ink-line bg-white px-3 py-2 text-sm outline-none focus:border-air-400"
                  />
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="메모 (성향, 기억할 것…)"
                    className="w-full rounded-lg border border-ink-line bg-white px-3 py-2 text-sm outline-none focus:border-air-400"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setOpenName(null)}
                      className="flex-1 rounded-lg border border-ink-line bg-white py-2 text-sm font-medium">취소</button>
                    <button onClick={saveOpen}
                      className="flex-1 rounded-lg bg-air-600 py-2 text-sm font-semibold text-white">저장</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Nav />
    </main>
  )
}
