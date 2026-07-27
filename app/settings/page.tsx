'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getSetting, setSetting, saveProfileSettings, getFlights, getPendingCount, clearLocalData } from '@/lib/store'
import { sortChrono } from '@/lib/aggregate'
import { minToHM } from '@/lib/time'
import { applyTheme, setThemeCookie, readTheme, THEMES, type Theme } from '@/lib/theme'
import Nav from '@/components/Nav'
import LanguagePicker from '@/components/LanguagePicker'
// 이 파일은 테마 map 콜백에서 t를 이미 쓰고 있어 사전은 L로 받는다
import { useT, fmt } from '@/lib/i18n'
import { settings as dict } from '@/lib/i18n/settings'
import { PROFILE_FIELDS as FIELDS } from '@/lib/profile-fields'

// 회사 표기 규칙 (로컬 전용 — 서버 프로필엔 없는 값)
const LOCAL_ONLY = [
  ['regPrefix', 'HS-'],
  ['flightPrefix', 'SL'],
  ['fleetTypes', 'B737-800, B737-900'],
] as const

type Values = Record<string, string>

// 사본 받을 주소 형식 검사 (오타로 엉뚱한 데 가거나 조용히 실패하는 것 방지)
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export default function SettingsPage() {
  const router = useRouter()
  const L = useT(dict)
  const [v, setV] = useState<Values>({})
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mailBusy, setMailBusy] = useState(false)
  const [mailMsg, setMailMsg] = useState('')
  const [theme, setTheme] = useState<Theme>('system')
  const [lim, setLim] = useState({ l28: '100', l90: '270', l365: '1000' })
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    setTheme(readTheme())
    void (async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.rpc('is_admin')
        setIsAdmin(!!data)
      } catch {}
    })()
    void (async () => {
      setLim({
        l28: (await getSetting('limit28')) || '100',
        l90: (await getSetting('limit90')) || '270',
        l365: (await getSetting('limit365')) || '1000',
      })
    })()
  }, [])

  function saveLimit(key: 'limit28' | 'limit90' | 'limit365', v: string) {
    void setSetting(key, v.replace(/[^0-9]/g, ''))
  }

  function changeTheme(t: Theme) {
    setTheme(t)
    setThemeCookie(t)
    applyTheme(t)
  }

  async function sendCopy() {
    const to = (v.copyEmail ?? '').trim()
    if (!isEmail(to)) return
    setMailBusy(true)
    setMailMsg('')
    try {
      if (!navigator.onLine) throw new Error(L.needOnline)
      // 화면에 적힌 주소를 서버에 먼저 반영 — [저장]을 따로 안 눌러도
      // "적은 주소 = 받는 주소"가 되게 (서버는 저장된 값만 보고 보낸다)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error(L.needLogin)
      await setSetting('copyEmail', to)
      const { error: upErr } = await supabase.from('profiles').update({ copy_email: to }).eq('id', user.id)
      if (upErr) throw new Error(L.saveAddressFailed)

      const res = await fetch('/api/send-logbook', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || L.sendFailed)
      setMailMsg(fmt(L.sentOk, { to: data.to, n: Number(data.flights).toLocaleString() }))
    } catch (err) {
      setMailMsg('⚠️ ' + (err instanceof Error ? err.message : String(err)))
    }
    setMailBusy(false)
  }

  function set(key: string, value: string) {
    setV((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  useEffect(() => {
    void (async () => {
      const next: Values = {}
      for (const [localKey] of FIELDS) next[localKey] = (await getSetting(localKey)) ?? ''
      for (const [k, dflt] of LOCAL_ONLY) next[k] = (await getSetting(k)) ?? dflt
      // 비어 있으면 온라인 프로필에서 보충
      if (navigator.onLine && FIELDS.some(([k]) => !next[k])) {
        try {
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
            if (data) {
              for (const [localKey, col] of FIELDS) {
                if (!next[localKey] && data[col]) {
                  next[localKey] = String(data[col])
                  // 화면에 띄우는 데서 끝내지 말고 폰에도 남긴다.
                  // 기록 폼·오프라인은 로컬만 보기 때문에, 여기서 안 심어두면
                  // "설정엔 PIC로 보이는데 기록하면 SIC"가 된다.
                  await setSetting(localKey, next[localKey])
                }
              }
            }
          }
        } catch {}
      }
      setV(next)
    })()
  }, [])

  async function save() {
    setBusy(true)
    setSaved(false)
    for (const [k] of LOCAL_ONLY) await setSetting(k, (v[k] ?? '').trim())
    // 프로필 값은 outbox를 거친다 — 오프라인에서 바꿔도 온라인 복귀 때 올라가고,
    // 다른 기기는 그걸 내려받는다
    await saveProfileSettings(v)
    setBusy(false)
    setSaved(true)
  }

  // CSV 백업 다운로드 (오프라인에서도 동작)
  async function downloadCsv() {
    const flights = sortChrono(await getFlights())
    const header = [
      'date', 'flight_number', 'from', 'to', 'aircraft_reg', 'aircraft_type',
      'out', 'in', 'takeoff', 'landing', 'block_time', 'flight_time',
      'on_duty', 'off_duty', 'duty_time',
      'pic', 'sic', 'picus', 'night', 'actual_inst', 'sim', 'dual_given',
      'day_takeoffs', 'day_landings', 'night_takeoffs', 'night_landings',
      'autolands', 'go_arounds', 'holds', 'approaches',
      'capacity', 'pf', 'crew_pic', 'crew_sic', 'crew_other',
      'pax_count', 'distance_nm', 'remarks',
    ]
    const esc = (s: unknown) => {
      const t = s === null || s === undefined ? '' : String(s)
      return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
    }
    const lines = [header.join(',')]
    for (const f of flights) {
      lines.push([
        f.flight_date, f.flight_number, f.origin, f.destination, f.aircraft_reg, f.aircraft_type,
        f.out_time, f.in_time, f.takeoff_time, f.landing_time,
        minToHM(f.total_min), f.flight_min ? minToHM(f.flight_min) : '',
        f.on_duty_time, f.off_duty_time, f.duty_min ? minToHM(f.duty_min) : '',
        f.pic_min ? minToHM(f.pic_min) : '', f.sic_min ? minToHM(f.sic_min) : '',
        f.picus_min ? minToHM(f.picus_min) : '', f.night_min ? minToHM(f.night_min) : '',
        f.inst_actual_min ? minToHM(f.inst_actual_min) : '',
        f.sim_min ? minToHM(f.sim_min) : '', f.dual_given_min ? minToHM(f.dual_given_min) : '',
        f.day_takeoffs, f.day_landings, f.night_takeoffs, f.night_landings,
        f.autolands, f.go_arounds, f.holds, (f.approaches ?? []).join('; '),
        f.capacity, f.is_pf ? 'PF' : '', f.crew_pic, f.crew_sic, f.crew_other,
        f.pax_count, f.distance_nm, f.remarks,
      ].map(esc).join(','))
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `airlog10-logbook-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function logout() {
    // 안 올라간 기록이 있으면 경고 — 로그아웃하면 이 기기 사본을 비운다 (다음 사용자 노출 방지)
    const pending = await getPendingCount()
    const msg = pending > 0
      ? fmt(L.logoutPending, { n: pending })
      : L.logoutPlain
    if (!window.confirm(msg)) return
    await clearLocalData()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function deleteAccount() {
    if (!window.confirm(L.deleteConfirm1)) return
    if (!window.confirm(L.deleteConfirm2)) return
    try {
      const res = await fetch('/api/delete-account', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || L.deleteFailed)
      await clearLocalData()
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (err) {
      alert(L.deleteFailedAlert + (err instanceof Error ? err.message : String(err)))
    }
  }

  const inputCls = 'mt-1 w-full rounded-xl border border-app-line bg-app-surface px-3 py-2.5 outline-none focus:border-air-400'
  const labelCls = 'text-xs font-medium text-app-sub'

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-4 text-xl font-bold">{L.title}</h1>

      <div className="space-y-4">
        {/* 맨 위 — 읽을 수 없는 언어로 앱이 떴을 때 가장 먼저 찾아야 하는 항목 */}
        <LanguagePicker />

        <div className="rounded-2xl border border-app-line bg-app-surface p-4">
          <h2 className="font-semibold">{L.myInfo}</h2>
          <p className="mt-1 text-xs text-app-hint">
            {L.myInfoHint}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{L.pilotName}</label>
              <input value={v.pilotName ?? ''} onChange={(e) => set('pilotName', e.target.value)}
                placeholder="Sangin Jung" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{L.defaultRole}</label>
              <div className="mt-1 flex gap-1">
                {['PIC', 'SIC'].map((cp) => (
                  <button key={cp} type="button"
                    onClick={() => set('defaultCapacity', v.defaultCapacity === cp ? '' : cp)}
                    className={'flex-1 rounded-lg px-2 py-2.5 text-sm font-semibold ' +
                      (v.defaultCapacity === cp ? 'bg-app-btn text-white' : 'bg-app-bg text-app-sub')}>
                    {cp}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>{L.airline}</label>
              <input value={v.airline ?? ''} onChange={(e) => set('airline', e.target.value)}
                placeholder="Thai Lion Air" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{L.homeBase}</label>
              <input value={v.homeBase ?? ''} onChange={(e) => set('homeBase', e.target.value.toUpperCase())}
                placeholder="VTBD" autoCapitalize="characters" className={inputCls + ' font-mono uppercase'} />
            </div>
            <div>
              <label className={labelCls}>{L.employeeNo}</label>
              <input value={v.employeeNo ?? ''} onChange={(e) => set('employeeNo', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{L.licenceNo}</label>
              <input value={v.licenceNo ?? ''} onChange={(e) => set('licenceNo', e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-app-line bg-app-surface p-4">
          <h2 className="font-semibold">{L.expiriesTitle}</h2>
          <p className="mt-1 text-xs text-app-hint">{L.expiriesHint}</p>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <label className={labelCls}>{L.medical}</label>
              <input type="date" value={v.medicalExpiry ?? ''} onChange={(e) => set('medicalExpiry', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{L.englishProf}</label>
              <input type="date" value={v.englishExpiry ?? ''} onChange={(e) => set('englishExpiry', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{L.recurrent}</label>
              <input type="date" value={v.recurrentExpiry ?? ''} onChange={(e) => set('recurrentExpiry', e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-app-line bg-app-surface p-4">
          <h2 className="font-semibold">{L.companyRules}</h2>
          <p className="mt-1 text-xs text-app-hint">
            {fmt(L.companyRulesHint, { reg: 'LVL', regFull: 'HS-LVL', no: '628', noFull: 'SL628' })}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{L.regPrefix}</label>
              <input value={v.regPrefix ?? ''} onChange={(e) => set('regPrefix', e.target.value.toUpperCase())}
                placeholder="HS-" className={inputCls + ' font-mono uppercase'} />
            </div>
            <div>
              <label className={labelCls}>{L.flightPrefix}</label>
              <input value={v.flightPrefix ?? ''} onChange={(e) => set('flightPrefix', e.target.value.toUpperCase())}
                placeholder="SL" className={inputCls + ' font-mono uppercase'} />
            </div>
          </div>
          <div className="mt-3">
            <label className={labelCls}>{L.fleetTypes}</label>
            <input value={v.fleetTypes ?? ''} onChange={(e) => set('fleetTypes', e.target.value.toUpperCase())}
              placeholder="B737-800, B737-900" className={inputCls + ' font-mono uppercase'} />
            <p className="mt-1 text-xs text-app-hint">{L.fleetTypesHint}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-app-line bg-app-surface p-4">
          <h2 className="font-semibold">{L.limitsTitle}</h2>
          <p className="mt-1 text-xs text-app-hint">{L.limitsHint}</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {([
              ['l28', 'limit28', L.d28],
              ['l90', 'limit90', L.d90],
              ['l365', 'limit365', L.m12],
            ] as const).map(([sk, key, label]) => (
              <div key={key}>
                <label className={labelCls}>{label}</label>
                <input
                  value={lim[sk]}
                  inputMode="numeric"
                  onChange={(e) => setLim((prev) => ({ ...prev, [sk]: e.target.value }))}
                  onBlur={(e) => saveLimit(key, e.target.value)}
                  className={inputCls + ' text-center font-mono'}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-app-line bg-app-surface p-4">
          <h2 className="font-semibold">{L.theme}</h2>
          <div className="mt-3 flex gap-1">
            {THEMES.map((t) => (
              <button
                key={t} type="button" onClick={() => changeTheme(t)}
                className={
                  'flex-1 rounded-lg px-2 py-2.5 text-sm font-semibold ' +
                  (theme === t ? 'bg-app-btn text-white' : 'bg-app-bg text-app-sub')
                }
              >
                {t === 'system' ? L.themeSystem : t === 'light' ? L.themeLight : L.themeDark}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-app-hint">{L.themeHint}</p>
        </div>

        <div className="rounded-2xl border border-app-line bg-app-surface p-4">
          <h2 className="font-semibold">{L.backupTitle}</h2>
          <div className="mt-3">
            <label className={labelCls}>{L.copyEmail}</label>
            <input type="email" value={v.copyEmail ?? ''} onChange={(e) => set('copyEmail', e.target.value)}
              placeholder="you@example.com" className={inputCls} />
          </div>
          <button onClick={downloadCsv}
            className="mt-3 w-full rounded-xl border border-app-accent-soft bg-app-accent-soft py-3 font-semibold text-app-accent">
            {L.downloadCsv}
          </button>
          <button onClick={sendCopy} disabled={mailBusy || !isEmail((v.copyEmail ?? '').trim())}
            className="mt-2 w-full rounded-xl border border-app-line bg-app-surface py-3 font-semibold text-app-text disabled:opacity-50">
            {mailBusy ? L.sending : L.sendCopy}
          </button>
          <p className="mt-1.5 break-words text-center text-xs text-app-hint">
            {!(v.copyEmail ?? '').trim()
              ? L.needAddress
              : !isEmail((v.copyEmail ?? '').trim())
                ? L.badAddress
                : fmt(L.willSendTo, { email: (v.copyEmail ?? '').trim() })}
          </p>
          {mailMsg && <p className="mt-2 break-words text-center text-sm text-app-sub">{mailMsg}</p>}
        </div>

        <button onClick={save} disabled={busy}
          className="w-full rounded-xl bg-app-btn py-3.5 text-lg font-bold text-white disabled:opacity-50">
          {busy ? L.saving : L.save}
        </button>
        {saved && <p className="text-center text-sm text-green-600">{L.saved}</p>}

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-4">
            <Link href="/people" className="text-sm font-medium text-app-accent">{L.crewList}</Link>
            <Link href="/import" className="text-sm font-medium text-app-accent">{L.importLink}</Link>
            {isAdmin && <Link href="/admin/invite" className="text-sm font-medium text-app-accent">{L.inviteCodes}</Link>}
          </div>
          <button onClick={logout} className="text-sm text-app-hint">{L.logout}</button>
        </div>

        <div className="rounded-2xl border border-app-line bg-app-surface p-4">
          <div className="flex items-center justify-center gap-4 text-xs text-app-hint">
            <Link href="/terms" className="underline">{L.terms}</Link>
            <Link href="/privacy" className="underline">{L.privacy}</Link>
          </div>
          <button onClick={deleteAccount}
            className="mt-3 w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 dark:border-red-900/40 dark:text-red-400">
            {L.deleteAccount}
          </button>
          <p className="mt-1.5 text-center text-[11px] text-app-hint">{L.deleteAccountHint}</p>
        </div>
      </div>

      <Nav />
    </main>
  )
}
