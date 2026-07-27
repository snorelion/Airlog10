'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getFlights, getPeople, savePerson, getSetting, sync, onStoreChange, type Person } from '@/lib/store'
import Nav from '@/components/Nav'
import { useT, fmt } from '@/lib/i18n'
import { people as dict } from '@/lib/i18n/screens'

type CrewAgg = {
  name: string
  flights: number
  lastDate: string
  // 문구가 아니라 키를 담는다 — 문구를 담으면 언어를 바꿔도 여기만 옛 언어로 남는다
  roles: 'pic' | 'sic' | 'both' | ''
  person: Person | null  // 저장된 사번·메모
}

export default function PeoplePage() {
  const L = useT(dict)
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
    // 본인 제외 — 설정 이름과 부분 일치("정상인" ⊂ "정상인 Sangin Jung")도 걸러냄
    const me = (myName ?? '').trim().toLowerCase()
    const isMe = (nm: string) =>
      me.length >= 2 && (nm.toLowerCase().includes(me) || me.includes(nm.toLowerCase()))
    const map = new Map<string, { flights: number; lastDate: string; pic: boolean; sic: boolean }>()
    for (const f of flights) {
      for (const [nm, isPic] of [[f.crew_pic, true], [f.crew_sic, false]] as const) {
        if (!nm || isMe(nm)) continue
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
      roles: e.pic && e.sic ? 'both' : e.pic ? 'pic' : e.sic ? 'sic' : '',
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
        <h1 className="text-xl font-bold">{L.title}</h1>
        <Link href="/settings" className="text-sm text-app-accent">{L.toSettings}</Link>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={L.search}
        className="mb-3 w-full rounded-xl border border-app-line bg-app-surface px-4 py-2.5 outline-none focus:border-air-400"
      />

      {!loaded ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-hint">{L.loading}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-sub">
          {L.empty}
        </div>
      ) : (
        <div className="divide-y divide-app-line overflow-hidden rounded-2xl border border-app-line bg-app-surface">
          {filtered.map((a) => (
            <div key={a.name}>
              <button type="button" onClick={() => openEditor(a)} className="w-full px-4 py-3 text-left">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">
                    {a.name}
                    {a.person?.employee_no && (
                      <span className="ml-2 text-xs font-normal text-app-hint">#{a.person.employee_no}</span>
                    )}
                  </p>
                  <p className="text-sm tabular-nums text-app-sub">{fmt(L.flightsN, { n: a.flights.toLocaleString() })}</p>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-xs text-app-hint">
                  <span>
                    {a.roles === 'both' ? L.roleBoth : a.roles === 'pic' ? L.rolePic : a.roles === 'sic' ? L.roleSic : ''}
                    {a.lastDate ? fmt(L.lastFlown, { date: a.lastDate }) : ''}
                  </span>
                  {a.person?.notes && <span>📝</span>}
                </div>
                {a.person?.notes && openName !== a.name && (
                  <p className="mt-1 truncate text-xs text-app-sub">{a.person.notes}</p>
                )}
              </button>
              {openName === a.name && (
                <div className="space-y-2 border-t border-app-line bg-app-bg px-4 py-3">
                  <input
                    value={empNo}
                    onChange={(e) => setEmpNo(e.target.value)}
                    placeholder={L.staffNo}
                    className="w-full rounded-lg border border-app-line bg-app-surface px-3 py-2 text-sm outline-none focus:border-air-400"
                  />
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder={L.notes}
                    className="w-full rounded-lg border border-app-line bg-app-surface px-3 py-2 text-sm outline-none focus:border-air-400"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setOpenName(null)}
                      className="flex-1 rounded-lg border border-app-line bg-app-surface py-2 text-sm font-medium">{L.cancel}</button>
                    <button onClick={saveOpen}
                      className="flex-1 rounded-lg bg-app-btn py-2 text-sm font-semibold text-white">{L.save}</button>
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
