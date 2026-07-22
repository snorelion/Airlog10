'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getSetting, setSetting, getFlights, getPendingCount, clearLocalData } from '@/lib/store'
import { sortChrono } from '@/lib/aggregate'
import { minToHM } from '@/lib/time'
import { applyTheme, setThemeCookie, readTheme, THEMES, type Theme } from '@/lib/theme'
import Nav from '@/components/Nav'

// 로컬 설정 키 ↔ profiles 컬럼 매핑
const FIELDS = [
  ['pilotName', 'name'],
  ['defaultCapacity', 'default_capacity'],
  ['airline', 'airline'],
  ['homeBase', 'home_base'],
  ['employeeNo', 'employee_no'],
  ['licenceNo', 'licence_no'],
  ['copyEmail', 'copy_email'],
  ['medicalExpiry', 'medical_expiry'],
  ['englishExpiry', 'english_expiry'],
  ['recurrentExpiry', 'recurrent_expiry'],
] as const

// 회사 표기 규칙 (로컬 전용 — 서버 프로필엔 없는 값)
const LOCAL_ONLY = [
  ['regPrefix', 'HS-'],
  ['flightPrefix', 'SL'],
  ['fleetTypes', 'B737-800, B737-900'],
] as const

type Values = Record<string, string>

export default function SettingsPage() {
  const router = useRouter()
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
    setMailBusy(true)
    setMailMsg('')
    try {
      const res = await fetch('/api/send-logbook', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '발송에 실패했어요.')
      setMailMsg(`✅ ${data.to} 로 ${Number(data.flights).toLocaleString()}편 사본을 보냈어요!`)
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
                if (!next[localKey] && data[col]) next[localKey] = String(data[col])
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
    for (const [localKey] of FIELDS) await setSetting(localKey, (v[localKey] ?? '').trim())
    for (const [k] of LOCAL_ONLY) await setSetting(k, (v[k] ?? '').trim())
    if (navigator.onLine) {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const patch: Record<string, string | null> = {}
          for (const [localKey, col] of FIELDS) patch[col] = (v[localKey] ?? '').trim() || null
          await supabase.from('profiles').update(patch).eq('id', user.id)
        }
      } catch {}
    }
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
      ? `아직 서버로 안 올라간 항목이 ${pending}건 있어요. 로그아웃하면 이 기기에서 지워져요. 계속할까요?`
      : '로그아웃할까요? 이 기기의 저장본은 비워져요 (기록은 서버에 안전).'
    if (!window.confirm(msg)) return
    await clearLocalData()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function deleteAccount() {
    if (!window.confirm('정말 계정을 삭제할까요? 모든 비행 기록·프로필이 영구히 지워지고 되돌릴 수 없어요.')) return
    if (!window.confirm('마지막 확인이에요. 백업(CSV)을 받아두셨나요? 삭제를 진행할까요?')) return
    try {
      const res = await fetch('/api/delete-account', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '삭제 실패')
      await clearLocalData()
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (err) {
      alert('삭제에 실패했어요: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const inputCls = 'mt-1 w-full rounded-xl border border-app-line bg-app-surface px-3 py-2.5 outline-none focus:border-air-400'
  const labelCls = 'text-xs font-medium text-app-sub'

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-4 text-xl font-bold">설정</h1>

      <div className="space-y-4">
        <div className="rounded-2xl border border-app-line bg-app-surface p-4">
          <h2 className="font-semibold">내 정보</h2>
          <p className="mt-1 text-xs text-app-hint">
            기록할 때 역할에 맞는 칸에 이름이 자동으로 들어가고, 홈베이스는 출발지로 미리 채워져요.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>이름 (로그북 표기)</label>
              <input value={v.pilotName ?? ''} onChange={(e) => set('pilotName', e.target.value)}
                placeholder="Sangin Jung" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>기본 역할</label>
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
              <label className={labelCls}>소속 항공사</label>
              <input value={v.airline ?? ''} onChange={(e) => set('airline', e.target.value)}
                placeholder="Thai Lion Air" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>홈베이스 (ICAO)</label>
              <input value={v.homeBase ?? ''} onChange={(e) => set('homeBase', e.target.value.toUpperCase())}
                placeholder="VTBD" autoCapitalize="characters" className={inputCls + ' font-mono uppercase'} />
            </div>
            <div>
              <label className={labelCls}>사번</label>
              <input value={v.employeeNo ?? ''} onChange={(e) => set('employeeNo', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>면장 번호</label>
              <input value={v.licenceNo ?? ''} onChange={(e) => set('licenceNo', e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-app-line bg-app-surface p-4">
          <h2 className="font-semibold">자격 만료일</h2>
          <p className="mt-1 text-xs text-app-hint">넣어두면 홈 화면에 D-day로 보여드려요.</p>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <label className={labelCls}>메디컬</label>
              <input type="date" value={v.medicalExpiry ?? ''} onChange={(e) => set('medicalExpiry', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>영어 자격 (ICAO English)</label>
              <input type="date" value={v.englishExpiry ?? ''} onChange={(e) => set('englishExpiry', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>리커런트 (시뮬레이터)</label>
              <input type="date" value={v.recurrentExpiry ?? ''} onChange={(e) => set('recurrentExpiry', e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-app-line bg-app-surface p-4">
          <h2 className="font-semibold">회사 표기 규칙</h2>
          <p className="mt-1 text-xs text-app-hint">
            기록할 때 앞부분을 자동으로 붙여줘요. 예: 등록번호 <b>LVL</b> → <b>HS-LVL</b>, 편명 <b>628</b> → <b>SL628</b>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>등록번호 앞부분</label>
              <input value={v.regPrefix ?? ''} onChange={(e) => set('regPrefix', e.target.value.toUpperCase())}
                placeholder="HS-" className={inputCls + ' font-mono uppercase'} />
            </div>
            <div>
              <label className={labelCls}>편명 앞부분</label>
              <input value={v.flightPrefix ?? ''} onChange={(e) => set('flightPrefix', e.target.value.toUpperCase())}
                placeholder="SL" className={inputCls + ' font-mono uppercase'} />
            </div>
          </div>
          <div className="mt-3">
            <label className={labelCls}>우리 기단 기종 (쉼표로 구분)</label>
            <input value={v.fleetTypes ?? ''} onChange={(e) => set('fleetTypes', e.target.value.toUpperCase())}
              placeholder="B737-800, B737-900" className={inputCls + ' font-mono uppercase'} />
            <p className="mt-1 text-xs text-app-hint">기록 화면 기종 칸 아래에 빠른 선택 버튼으로 나와요.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-app-line bg-app-surface p-4">
          <h2 className="font-semibold">비행시간 한도 (시간)</h2>
          <p className="mt-1 text-xs text-app-hint">홈의 리밋 게이지 기준이에요. 회사 규정에 맞게 조정하세요.</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {([
              ['l28', 'limit28', '28일'],
              ['l90', 'limit90', '90일'],
              ['l365', 'limit365', '12개월'],
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
          <h2 className="font-semibold">화면 테마</h2>
          <div className="mt-3 flex gap-1">
            {THEMES.map((t) => (
              <button
                key={t} type="button" onClick={() => changeTheme(t)}
                className={
                  'flex-1 rounded-lg px-2 py-2.5 text-sm font-semibold ' +
                  (theme === t ? 'bg-app-btn text-white' : 'bg-app-bg text-app-sub')
                }
              >
                {t === 'system' ? '시스템' : t === 'light' ? '밝게' : '어둡게'}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-app-hint">야간 브리핑룸에선 "어둡게"가 눈이 편해요 🌙</p>
        </div>

        <div className="rounded-2xl border border-app-line bg-app-surface p-4">
          <h2 className="font-semibold">백업 · 내보내기</h2>
          <div className="mt-3">
            <label className={labelCls}>사본 받을 이메일 (추후 메일 발송용)</label>
            <input type="email" value={v.copyEmail ?? ''} onChange={(e) => set('copyEmail', e.target.value)}
              placeholder="snorelion@gmail.com" className={inputCls} />
          </div>
          <button onClick={downloadCsv}
            className="mt-3 w-full rounded-xl border border-app-accent-soft bg-app-accent-soft py-3 font-semibold text-app-accent">
            로그북 전체 CSV 다운로드
          </button>
          <button onClick={sendCopy} disabled={mailBusy}
            className="mt-2 w-full rounded-xl border border-app-line bg-app-surface py-3 font-semibold text-app-text disabled:opacity-50">
            {mailBusy ? '보내는 중…' : '📧 이메일로 사본 보내기'}
          </button>
          {mailMsg && <p className="mt-2 text-center text-sm text-app-sub">{mailMsg}</p>}
        </div>

        <button onClick={save} disabled={busy}
          className="w-full rounded-xl bg-app-btn py-3.5 text-lg font-bold text-white disabled:opacity-50">
          {busy ? '저장 중…' : '저장'}
        </button>
        {saved && <p className="text-center text-sm text-green-600">저장했어요 ✓</p>}

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-4">
            <Link href="/people" className="text-sm font-medium text-app-accent">👥 크루 목록</Link>
            <Link href="/import" className="text-sm font-medium text-app-accent">📥 가져오기</Link>
            {isAdmin && <Link href="/admin/invite" className="text-sm font-medium text-app-accent">🎫 초대 코드</Link>}
          </div>
          <button onClick={logout} className="text-sm text-app-hint">로그아웃</button>
        </div>

        <div className="rounded-2xl border border-app-line bg-app-surface p-4">
          <div className="flex items-center justify-center gap-4 text-xs text-app-hint">
            <Link href="/terms" className="underline">이용약관</Link>
            <Link href="/privacy" className="underline">개인정보처리방침</Link>
          </div>
          <button onClick={deleteAccount}
            className="mt-3 w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 dark:border-red-900/40 dark:text-red-400">
            계정 삭제
          </button>
          <p className="mt-1.5 text-center text-[11px] text-app-hint">모든 데이터가 영구 삭제돼요. 먼저 CSV 백업을 권장해요.</p>
        </div>
      </div>

      <Nav />
    </main>
  )
}
