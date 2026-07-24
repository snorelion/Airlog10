'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getFlights, getPendingCount, getLastSyncAt, getSetting, setSetting, getRosterFlights, sync, onStoreChange, type Flight, type RosterFlight } from '@/lib/store'
import WxCard from '@/components/WxCard'
import { computeTotals, windowTotalMin, currency90, monthDutyMin, type Totals } from '@/lib/aggregate'
import { minToHMGrouped } from '@/lib/time'
import { Settings as SettingsIcon, Users, Plane } from 'lucide-react'
import Nav from '@/components/Nav'

export default function HomePage() {
  const [totals, setTotals] = useState<Totals | null>(null)
  const [recent, setRecent] = useState<Flight[]>([])
  const [pending, setPending] = useState(0)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [expiries, setExpiries] = useState<{ label: string; date: string; dday: number }[]>([])
  const [rosterCard, setRosterCard] = useState<{ label: string; flights: RosterFlight[] } | null>(null)
  const [limits, setLimits] = useState<{ label: string; used: number; cap: number }[]>([])
  const [curr, setCurr] = useState<{ takeoffs: number; landings: number } | null>(null)
  const [dutyMonth, setDutyMonth] = useState(0)
  const [homeBase, setHomeBase] = useState('')
  const [wxList, setWxList] = useState<string[]>([])
  const [wxQuery, setWxQuery] = useState('')
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

    // 리밋 게이지 (기본 한도: 28일 100h / 90일 270h / 12개월 1,000h — 설정에서 변경)
    const todayLocal = new Date().toLocaleDateString('en-CA')
    const lim28 = parseInt((await getSetting('limit28')) || '100', 10)
    const lim90 = parseInt((await getSetting('limit90')) || '270', 10)
    const lim365 = parseInt((await getSetting('limit365')) || '1000', 10)
    setLimits([
      { label: '28일', used: windowTotalMin(flights, 28, todayLocal), cap: lim28 * 60 },
      { label: '90일', used: windowTotalMin(flights, 90, todayLocal), cap: lim90 * 60 },
      { label: '12개월', used: windowTotalMin(flights, 365, todayLocal), cap: lim365 * 60 },
    ])
    setCurr(currency90(flights, todayLocal))
    setDutyMonth(monthDutyMin(flights, todayLocal))
    const hb = ((await getSetting('homeBase')) ?? '').toUpperCase()
    setHomeBase(hb)
    // 날씨 공항 목록 — 없으면 홈베이스(+예전 마지막 조회)로 시작
    let list: string[] = []
    try { list = JSON.parse((await getSetting('wxIdents')) || '[]') } catch {}
    if (!list.length) {
      const legacy = ((await getSetting('lastWxIdent')) ?? '').toUpperCase()
      list = Array.from(new Set([hb, legacy].filter(Boolean)))
      if (list.length) await setSetting('wxIdents', JSON.stringify(list))
    }
    setWxList(list)

    // 로스터 — 오늘(또는 다음 비행일)의 예정 비행
    const roster = await getRosterFlights()
    const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD (로컬)
    const upcoming = roster.filter((r) => r.flight_date >= todayStr)
    if (upcoming.length) {
      let firstDate = upcoming[0].flight_date
      for (const r of upcoming) if (r.flight_date < firstDate) firstDate = r.flight_date
      const dayFlights = upcoming
        .filter((r) => r.flight_date === firstDate)
        .sort((a, b) => (a.std ?? '').localeCompare(b.std ?? ''))
      setRosterCard({
        label: firstDate === todayStr ? '오늘의 비행' : `다음 비행 · ${firstDate}`,
        flights: dayFlights,
      })
    } else {
      setRosterCard(null)
    }
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
        <div className="text-2xl font-extrabold tracking-tight text-app-accent">
          Air<span className="text-air-400">Log</span>10
        </div>
        <div className="flex items-center gap-2">
          {pending > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
              업로드 대기 {pending}
            </span>
          )}
          <Link href="/aircraft" aria-label="기체" className="p-1 text-app-hint">
            <Plane size={20} />
          </Link>
          <Link href="/people" aria-label="크루" className="p-1 text-app-hint">
            <Users size={20} />
          </Link>
          <Link href="/settings" aria-label="설정" className="p-1 text-app-hint">
            <SettingsIcon size={20} />
          </Link>
        </div>
      </header>

      {!loaded ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-hint">
          불러오는 중…
        </div>
      ) : empty ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-6 text-center">
          <p className="text-4xl">✈️</p>
          <h2 className="mt-3 text-lg font-bold">환영해요! 로그북을 시작해 볼까요?</h2>
          <p className="mt-1 text-sm text-app-sub">
            먼저 ⚙️ 설정에서 이름·소속·홈베이스를 넣으면 기록이 훨씬 편해져요.<br />
            그다음 기존 로그북을 가져오거나 첫 비행을 기록하세요.
          </p>
          <div className="mt-5 space-y-2">
            <Link href="/settings" className="block rounded-xl bg-app-btn py-3 font-semibold text-white">
              ⚙️ 내 정보 먼저 설정하기
            </Link>
            <Link href="/import" className="block rounded-xl border border-app-line py-3 font-semibold">
              기존 로그북 가져오기
            </Link>
            <Link href="/flights/new" className="block rounded-xl border border-app-line py-3 font-semibold">
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

          {rosterCard && (
            <div className="mt-3 rounded-2xl border border-app-accent-soft bg-app-surface p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-app-accent">
                🛫 {rosterCard.label}
              </h2>
              <div className="mt-2 divide-y divide-app-line">
                {rosterCard.flights.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-semibold">
                        <span className="font-mono">{r.flight_number}</span>
                        <span className="ml-2">{r.origin} → {r.destination}</span>
                      </p>
                      <p className="text-xs text-app-hint">
                        {r.std}{r.sta ? ` – ${r.sta}` : ''} {r.aircraft_type ? `· ${r.aircraft_type}` : ''}
                      </p>
                    </div>
                    {r.status === 'logged' ? (
                      <span className="text-sm font-semibold text-green-600">✓ 기록됨</span>
                    ) : (
                      <Link
                        href={`/flights/new?roster=${r.id}`}
                        className="rounded-lg bg-app-btn px-3 py-1.5 text-sm font-semibold text-white"
                      >
                        기록
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {expiries.length > 0 && (
            <div className="mt-3 rounded-2xl border border-app-line bg-app-surface p-4">
              <h2 className="text-sm font-semibold text-app-sub">자격 만료</h2>
              <div className="mt-2 space-y-1.5">
                {expiries.map((e) => (
                  <div key={e.label} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{e.label}</span>
                    <span className="text-xs text-app-hint">{e.date}</span>
                    <span className={
                      'rounded-full px-2 py-0.5 text-xs font-bold ' +
                      (e.dday < 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : e.dday <= 30 ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300'
                        : e.dday <= 60 ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-app-bg text-app-sub')
                    }>
                      {e.dday < 0 ? `만료 ${-e.dday}일 지남` : `D-${e.dday}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {limits.length > 0 && (
            <div className="mt-3 rounded-2xl border border-app-line bg-app-surface p-4">
              <h2 className="text-sm font-semibold text-app-sub">비행시간 리밋 · 기량유지</h2>
              <div className="mt-2 space-y-2">
                {limits.map((l) => {
                  const pct = l.cap > 0 ? (l.used / l.cap) * 100 : 0
                  const barColor = pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-app-btn'
                  return (
                    <div key={l.label} className="flex items-center gap-2">
                      <span className="w-14 text-xs font-medium text-app-sub">{l.label}</span>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-app-bg">
                        <div className={'h-full rounded-full ' + barColor} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <span className="w-32 text-right text-xs tabular-nums text-app-sub">
                        {minToHMGrouped(l.used)} / {minToHMGrouped(l.cap)}
                      </span>
                    </div>
                  )
                })}
              </div>
              {dutyMonth > 0 && (
                <p className="mt-2 text-xs text-app-hint">
                  이번 달 듀티 <b className="text-app-text">{minToHMGrouped(dutyMonth)}</b>
                </p>
              )}
              {curr && (
                <p className="mt-2 text-xs text-app-hint">
                  최근 90일 이륙 <b className="text-app-text">{curr.takeoffs}</b> · 착륙 <b className="text-app-text">{curr.landings}</b>{' '}
                  {curr.takeoffs >= 3 && curr.landings >= 3 ? (
                    <span className="font-semibold text-green-600 dark:text-green-400">✓ 기량유지 충족 (3회 이상)</span>
                  ) : (
                    <span className="font-semibold text-red-600 dark:text-red-400">⚠️ 90일 3회 미달 — 확인 필요</span>
                  )}
                </p>
              )}
            </div>
          )}

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-app-sub">날씨 (METAR / TAF)</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const id = wxQuery.trim().toUpperCase()
                  if (id.length >= 3) {
                    setWxList((prev) => {
                      const next = [id, ...prev.filter((x) => x !== id)]
                      void setSetting('wxIdents', JSON.stringify(next))
                      return next
                    })
                    setWxQuery('')
                  }
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  value={wxQuery}
                  onChange={(e) => setWxQuery(e.target.value.toUpperCase())}
                  placeholder="ICAO"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  className="w-20 rounded-lg border border-app-line bg-app-surface px-2 py-1.5 text-center font-mono text-sm uppercase outline-none focus:border-air-400"
                />
                <button type="submit" className="rounded-lg bg-app-btn px-3 py-1.5 text-sm font-semibold text-white">
                  조회
                </button>
              </form>
            </div>
            {wxList.map((id) => (
              <WxCard
                key={id}
                ident={id}
                onClose={() => {
                  setWxList((prev) => {
                    const next = prev.filter((x) => x !== id)
                    void setSetting('wxIdents', JSON.stringify(next))
                    return next
                  })
                }}
              />
            ))}
            {wxList.length === 0 && (
              <p className="rounded-2xl border border-app-line bg-app-surface p-4 text-sm text-app-sub">
                위 ICAO 칸에 공항 코드를 넣고 조회하면 날씨 카드가 쌓여요. (여러 공항 가능, ✕로 닫기)
              </p>
            )}
          </div>

          <h2 className="mb-2 mt-6 text-sm font-semibold text-app-sub">최근 비행</h2>
          <div className="divide-y divide-app-line overflow-hidden rounded-2xl border border-app-line bg-app-surface">
            {recent.map((f) => (
              <div key={f.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-semibold">
                    {f.origin ?? '?'} → {f.destination ?? '?'}
                    {f.flight_number && <span className="ml-2 text-xs font-normal text-app-hint">{f.flight_number}</span>}
                  </p>
                  <p className="text-xs text-app-hint">{f.flight_date} · {f.aircraft_reg ?? ''}</p>
                </div>
                <p className="font-semibold tabular-nums">{minToHMGrouped(f.total_min)}</p>
              </div>
            ))}
          </div>

          {lastSync && (
            <p className="mt-4 text-center text-xs text-app-hint">
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
    <div className="rounded-xl border border-app-line bg-app-surface p-3 text-center">
      <p className="text-xs text-app-hint">{label}</p>
      <p className="mt-0.5 font-bold tabular-nums">{value}</p>
    </div>
  )
}
