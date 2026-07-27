'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getFlights, getPendingCount, getLastSyncAt, getSetting, setSetting, getRosterFlights, sync, onStoreChange, type RosterFlight } from '@/lib/store'
import WxCard from '@/components/WxCard'
import { computeTotals, windowTotalMin, currency90, monthDutyMin, type Totals } from '@/lib/aggregate'
import { minToHMGrouped } from '@/lib/time'
import { Settings as SettingsIcon, Users, Plane } from 'lucide-react'
import Nav from '@/components/Nav'
import { useT, useLang, fmt, LOCALE } from '@/lib/i18n'
import { home as dict } from '@/lib/i18n/home'

// 라벨은 상태에 담지 않고 "키"만 담는다 — 문구를 담아두면 언어를 바꿔도
// 그 부분만 옛 언어로 남는다(load()는 화면을 열 때 한 번만 도니까).
type ExpiryKey = 'medical' | 'englishProf' | 'recurrent'
type LimitKey = 'd28' | 'd90' | 'm12'

export default function HomePage() {
  const t = useT(dict)
  const lang = useLang()
  const [totals, setTotals] = useState<Totals | null>(null)
  const [monthStat, setMonthStat] = useState({ flights: 0, min: 0 })
  const [limitsOpen, setLimitsOpen] = useState<boolean | null>(null) // null = 자동(임계일 때만 펼침)
  const [pending, setPending] = useState(0)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [expiries, setExpiries] = useState<{ key: ExpiryKey; date: string; dday: number }[]>([])
  const [rosterCard, setRosterCard] = useState<{ isToday: boolean; date: string; flights: RosterFlight[] } | null>(null)
  const [limits, setLimits] = useState<{ key: LimitKey; used: number; cap: number }[]>([])
  const [curr, setCurr] = useState<{ takeoffs: number; landings: number } | null>(null)
  const [dutyMonth, setDutyMonth] = useState(0)
  const [homeBase, setHomeBase] = useState('')
  const [wxList, setWxList] = useState<string[]>([])
  const [wxQuery, setWxQuery] = useState('')
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const flights = await getFlights()
    setTotals(computeTotals(flights))
    // 이번 달 — 히어로 카드 한 줄로 "요즘 얼마나 날았나"를 보여준다 (시뮬 제외)
    const ym = new Date().toLocaleDateString('en-CA').slice(0, 7)
    let mf = 0
    let mm = 0
    for (const f of flights) {
      if (f.total_min > 0 && f.flight_date.slice(0, 7) === ym) { mf += 1; mm += f.total_min }
    }
    setMonthStat({ flights: mf, min: mm })
    setPending(await getPendingCount())
    setLastSync(await getLastSyncAt())

    // 자격 만료 D-day (설정에 넣어둔 것만)
    const defs = [
      ['medicalExpiry', 'medical'],
      ['englishExpiry', 'englishProf'],
      ['recurrentExpiry', 'recurrent'],
    ] as const
    const items: { key: ExpiryKey; date: string; dday: number }[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (const [settingKey, key] of defs) {
      const d = await getSetting(settingKey)
      if (d) {
        const dday = Math.ceil((new Date(d + 'T00:00:00').getTime() - today.getTime()) / 86400000)
        items.push({ key, date: d, dday })
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
      { key: 'd28', used: windowTotalMin(flights, 28, todayLocal), cap: lim28 * 60 },
      { key: 'd90', used: windowTotalMin(flights, 90, todayLocal), cap: lim90 * 60 },
      { key: 'm12', used: windowTotalMin(flights, 365, todayLocal), cap: lim365 * 60 },
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
        isToday: firstDate === todayStr,
        date: firstDate,
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
              {fmt(t.pendingUpload, { n: pending })}
            </span>
          )}
          <Link href="/aircraft" aria-label={t.aircraft} className="p-1 text-app-hint">
            <Plane size={20} />
          </Link>
          <Link href="/people" aria-label={t.crew} className="p-1 text-app-hint">
            <Users size={20} />
          </Link>
          <Link href="/settings" aria-label={t.settings} className="p-1 text-app-hint">
            <SettingsIcon size={20} />
          </Link>
        </div>
      </header>

      {!loaded ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center text-app-hint">
          {t.loading}
        </div>
      ) : empty ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-6 text-center">
          <p className="text-4xl">✈️</p>
          <h2 className="mt-3 text-lg font-bold">{t.welcomeTitle}</h2>
          <p className="mt-1 text-sm text-app-sub">
            {t.welcomeBody1}<br />
            {t.welcomeBody2}
          </p>
          <div className="mt-5 space-y-2">
            <Link href="/settings" className="block rounded-xl bg-app-btn py-3 font-semibold text-white">
              {t.setupFirst}
            </Link>
            <Link href="/import" className="block rounded-xl border border-app-line py-3 font-semibold">
              {t.importLogbook}
            </Link>
            <Link href="/flights/new" className="block rounded-xl border border-app-line py-3 font-semibold">
              {t.logManually}
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* 총시간·역할시간·이번 달을 한 카드로 압축 — 매일 볼 필요 없는 숫자가
              화면 절반을 먹고 정작 자주 쓰는 [기록] 버튼을 아래로 밀어내던 문제 해결 */}
          <div className="rounded-2xl bg-air-800 p-5 text-white">
            <p className="text-sm text-air-200">{t.totalTime}</p>
            <p className="mt-1 text-4xl font-extrabold tabular-nums">
              {minToHMGrouped(totals?.total_min ?? 0)}
            </p>
            <p className="mt-1.5 text-sm text-air-100">
              {fmt(t.flightsLandings, {
                f: (totals?.flights ?? 0).toLocaleString(),
                l: (totals?.landings ?? 0).toLocaleString(),
              })}
            </p>
            <div className="mt-3 flex items-center gap-3 border-t border-white/15 pt-2.5 text-xs text-air-100">
              <span>PIC <b className="tabular-nums text-white">{minToHMGrouped(totals?.pic_min ?? 0)}</b></span>
              <span>SIC <b className="tabular-nums text-white">{minToHMGrouped(totals?.sic_min ?? 0)}</b></span>
              <span>🌙 <b className="tabular-nums text-white">{minToHMGrouped(totals?.night_min ?? 0)}</b></span>
            </div>
            <Link href="/stats" className="mt-2 flex items-center justify-between text-xs text-air-100">
              <span>
                {t.thisMonth}{' '}
                <b className="tabular-nums text-white">{fmt(t.monthFlights, { n: monthStat.flights })}</b>
                {monthStat.min > 0 && <> · <b className="tabular-nums text-white">{minToHMGrouped(monthStat.min)}</b></>}
              </span>
              <span className="text-air-200">{t.recap}</span>
            </Link>
          </div>

          {rosterCard && (
            <div className="mt-3 rounded-2xl border border-app-accent-soft bg-app-surface p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-app-accent">
                🛫 {rosterCard.isToday ? t.todayFlights : fmt(t.nextFlight, { date: rosterCard.date })}
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
                      <span className="text-sm font-semibold text-green-600">{t.logged}</span>
                    ) : (
                      <Link
                        href={`/flights/new?roster=${r.id}`}
                        className="rounded-lg bg-app-btn px-3 py-1.5 text-sm font-semibold text-white"
                      >
                        {t.logIt}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {expiries.length > 0 && (
            <div className="mt-3 rounded-2xl border border-app-line bg-app-surface p-4">
              <h2 className="text-sm font-semibold text-app-sub">{t.expiriesTitle}</h2>
              <div className="mt-2 space-y-1.5">
                {expiries.map((e) => (
                  <div key={e.key} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{t[e.key]}</span>
                    <span className="text-xs text-app-hint">{e.date}</span>
                    <span className={
                      'rounded-full px-2 py-0.5 text-xs font-bold ' +
                      (e.dday < 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : e.dday <= 30 ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300'
                        : e.dday <= 60 ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-app-bg text-app-sub')
                    }>
                      {e.dday < 0 ? fmt(t.overdue, { n: -e.dday }) : `D-${e.dday}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {limits.length > 0 && (() => {
            // 평소엔 접어둔다 — 여유 있을 때 게이지는 정보 가치가 낮다.
            // 단 한도의 90%를 넘거나 90일 기량유지가 미달이면 자동으로 펼쳐 경고한다.
            const maxPct = Math.max(...limits.map((l) => (l.cap > 0 ? (l.used / l.cap) * 100 : 0)))
            const currencyShort = !!curr && (curr.takeoffs < 3 || curr.landings < 3)
            const alert = maxPct >= 90 || currencyShort
            const open = limitsOpen ?? alert
            const tightest = limits.reduce((a, b) =>
              (b.cap > 0 ? b.used / b.cap : 0) > (a.cap > 0 ? a.used / a.cap : 0) ? b : a
            )
            return (
            <div className="mt-3 rounded-2xl border border-app-line bg-app-surface p-4">
              <button
                type="button"
                onClick={() => setLimitsOpen(!open)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <h2 className="text-sm font-semibold text-app-sub">{t.limitsTitle}</h2>
                <span className="flex items-center gap-1.5 text-xs">
                  {!open && (
                    <span className={alert ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-app-hint'}>
                      {currencyShort ? t.currencyCheck : `${t[tightest.key]} ${Math.round(maxPct)}%`}
                    </span>
                  )}
                  <span className="text-app-hint">{open ? '▲' : '▼'}</span>
                </span>
              </button>
              {open && (
              <>
              <div className="mt-2 space-y-2">
                {limits.map((l) => {
                  const pct = l.cap > 0 ? (l.used / l.cap) * 100 : 0
                  const barColor = pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-app-btn'
                  return (
                    <div key={l.key} className="flex items-center gap-2">
                      <span className="w-16 text-xs font-medium text-app-sub">{t[l.key]}</span>
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
                  {t.dutyThisMonth} <b className="text-app-text">{minToHMGrouped(dutyMonth)}</b>
                </p>
              )}
              {curr && (
                <p className="mt-2 text-xs text-app-hint">
                  {fmt(t.last90, { t: curr.takeoffs, l: curr.landings })}{' '}
                  {curr.takeoffs >= 3 && curr.landings >= 3 ? (
                    <span className="font-semibold text-green-600 dark:text-green-400">{t.currencyOk}</span>
                  ) : (
                    <span className="font-semibold text-red-600 dark:text-red-400">{t.currencyShort}</span>
                  )}
                </p>
              )}
              </>
              )}
            </div>
            )
          })()}

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-app-sub">{t.weather}</h2>
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
                  {t.lookup}
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
                {t.wxEmpty}
              </p>
            )}
          </div>

          {/* 최근 비행 목록은 뺐다 — 하단 [로그북] 탭과 역할이 겹치고,
              홈 맨 아래라 실제로 잘 보지 않는 자리였다 */}

          {lastSync && (
            <p className="mt-4 text-center text-xs text-app-hint">
              {fmt(t.lastSync, { when: new Date(lastSync).toLocaleString(LOCALE[lang]) })}
            </p>
          )}
        </>
      )}

      <Nav />
    </main>
  )
}
