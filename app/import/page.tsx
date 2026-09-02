'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { decodeLogbookFile, parseLogbook, type ParseResult } from '@/lib/logten'
import { addRosterFlights } from '@/lib/store'
import { minToHMGrouped } from '@/lib/time'

type RosterParse = {
  period: { start: string; end: string }
  flights: {
    flight_date: string; flight_number: string; origin: string | null; destination: string | null
    std: string | null; sta: string | null; aircraft_type: string | null; overnight: boolean
    report_time?: string | null; duty_end_time?: string | null
  }[]
  // "비행 없는 날"(오프·스탠바이·SIM·지상) — days를 아직 안 주는 파서면 없다 (앱과 같은 계약)
  days?: { date: string; kind: 'off' | 'standby' | 'sim' | 'ground'; label: string | null }[]
  stats: { flights: number; offDays: number; standbyDays: number }
}

type Step = 'pick' | 'preview' | 'importing' | 'done'

// 중복 판정 키.
// 출발시각까지 넣는 이유: 회사(라이언에어) 로그북엔 편명이 없어서
// 같은 날 같은 구간을 왕복 두 번 하면 날짜+구간만으로는 한 편으로 뭉개진다.
// UTC "HH:MM" → 공항 현지 {day, hm}. tz를 모르면 UTC 그대로 —
// "몇 시간 어긋난 표기라도 스케줄에 있다는 사실이 더 중요하다" (앱 addUpcoming과 같은 원칙)
function utcToLocal(day: string, hm: string, tz: string | null): { day: string; hm: string } {
  if (!tz) return { day, hm }
  try {
    const d = new Date(`${day}T${hm}:00Z`)
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d)
    const get = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
    const yy = get('year'); const mo = get('month'); const dd = get('day')
    const hh = get('hour'); const mi = get('minute')
    if (!yy || !mo || !dd || !hh || !mi) return { day, hm }
    return { day: `${yy}-${mo}-${dd}`, hm: `${hh}:${mi}` }
  } catch {
    return { day, hm }
  }
}

function dupKey(f: {
  flight_date: string; flight_number: string | null
  origin: string | null; destination: string | null; out_time: string | null
}): string {
  return `${f.flight_date}|${f.flight_number ?? ''}|${f.origin ?? ''}|${f.destination ?? ''}|${f.out_time ?? ''}`
}

export default function ImportPage() {
  const [step, setStep] = useState<Step>('pick')
  const [result, setResult] = useState<ParseResult | null>(null)
  const [progress, setProgress] = useState('')
  const [imported, setImported] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [upcoming, setUpcoming] = useState(0)             // 오늘 이후 행 → 스케줄로 등록한 수
  const [futureHeld, setFutureHeld] = useState(0)         // 오늘 이후인데 못 넣은 수(이미 로스터 있는 날짜 등)
  const [error, setError] = useState('')
  const [fileBusy, setFileBusy] = useState(false)
  const [roster, setRoster] = useState<RosterParse | null>(null)
  const [rosterBusy, setRosterBusy] = useState(false)
  const [rosterMsg, setRosterMsg] = useState('')

  async function onRosterFile(e: React.ChangeEvent<HTMLInputElement>) {
    setRosterMsg('')
    setRoster(null)
    const file = e.target.files?.[0]
    if (!file) return
    setRosterBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/roster/parse', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '로스터를 읽지 못했어요.')
      setRoster(data as RosterParse)
    } catch (err) {
      setRosterMsg('⚠️ ' + (err instanceof Error ? err.message : String(err)))
    }
    setRosterBusy(false)
  }

  async function registerRoster() {
    if (!roster) return
    setRosterBusy(true)
    try {
      const n = await addRosterFlights(
        roster.flights.map((f) => ({
          flight_date: f.flight_date,
          flight_number: f.flight_number,
          origin: f.origin,
          destination: f.destination,
          std: f.std,
          sta: f.sta,
          aircraft_type: f.aircraft_type,
          report_time: f.report_time ?? null,
          duty_end_time: f.duty_end_time ?? null,
        }))
      )
      // "비행 없는 날"도 서버에 — 앱과 같은 규칙(로스터 기간 내 전량교체 → 삽입).
      // 웹에는 달력 화면이 없어 IDB에는 안 담는다 — 앱이 다음 동기화 때 읽어 달력을 채운다.
      // 실패해도 비행 등록은 이미 끝났으니 메시지에서 일수만 빠진다 (다음 앱 업로드가 채움)
      let daysSaved = 0
      if (roster.days?.length) {
        try {
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            await supabase.from('roster_days').delete()
              .gte('day_date', roster.period.start)
              .lte('day_date', roster.period.end)
            const { error: dayErr } = await supabase.from('roster_days').upsert(
              roster.days.map((d) => ({
                user_id: user.id, day_date: d.date, kind: d.kind, label: d.label,
              })),
              { onConflict: 'user_id,day_date' }
            )
            if (!dayErr) daysSaved = roster.days.length
          }
        } catch {}
      }
      setRosterMsg(
        `✅ ${n}편 등록!` +
        (daysSaved ? ` 쉬는 날·스탠바이 ${daysSaved}일도 함께 저장했어요.` : '') +
        ' 홈 화면에 "오늘의 비행"으로 떠요.'
      )
      setRoster(null)
    } catch (err) {
      setRosterMsg('⚠️ ' + String(err))
    }
    setRosterBusy(false)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError('')
    const file = e.target.files?.[0]
    e.target.value = ''  // 같은 파일을 다시 고를 수 있게
    if (!file) return
    setFileBusy(true)
    try {
      // 엑셀(.xlsx)은 zip이라 'PK'로 시작한다. 회사 로그북은 확장자가 .csv여도 실제는 엑셀.
      // 같은 로그의 PDF 출력본(%PDF)도 서버가 같은 값으로 읽는다.
      const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
      const isExcel = head[0] === 0x50 && head[1] === 0x4b
      const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46

      let parsed: ParseResult
      if (isExcel || isPdf) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/company-log/parse', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '파일을 읽지 못했어요.')
        parsed = data as ParseResult
      } else {
        const text = await decodeLogbookFile(file)
        parsed = parseLogbook(text)
      }

      if (!parsed.flights.length) {
        setError(parsed.errors[0] || '비행 기록을 찾지 못했어요.')
        return
      }
      setResult(parsed)
      setStep('preview')
    } catch (err) {
      setError('파일을 읽는 중 문제가 생겼어요: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setFileBusy(false)
    }
  }

  async function runImport() {
    if (!result) return
    setStep('importing')
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('로그인이 풀렸어요. 다시 로그인해 주세요.'); setStep('preview'); return }

    try {
      // 1) 기존 기록 키 수집 (중복 건너뛰기) — Supabase 1,000행 한도 때문에 페이지로 나눠 읽음
      setProgress('기존 기록 확인 중…')
      const existing = new Set<string>()
      for (let fromRow = 0; ; fromRow += 1000) {
        const { data, error: qErr } = await supabase
          .from('flights')
          .select('flight_date, flight_number, origin, destination, out_time')
          .eq('deleted', false)
          .order('id') // 정렬 없는 range 페이징은 경계에서 행이 샐 수 있음
          .range(fromRow, fromRow + 999)
        if (qErr) throw new Error(qErr.message)
        for (const f of data ?? []) existing.add(dupKey(f))
        if (!data || data.length < 1000) break
      }

      // 미래 날짜 행은 기록이 아니라 **스케줄**이다 — 앱 1.5.1 addUpcoming과 같은 규칙.
      // 기록으로 넣으면 통계가 부풀고, 홈·위젯(로스터만 본다)엔 안 뜨며, 실제 비행 뒤
      // 중복이 된다 (2026-08-25 라이언님 9월 엑셀 실측 — 웹으로 넣어 셋 다 겪음.
      // "웹으로 넣어도 next flight에 자동으로 떠야 한다"로 확정).
      const todayUTC = new Date().toISOString().slice(0, 10)
      const pastRows = result.flights.filter((f) => f.flight_date <= todayUTC)
      const futureRows = result.flights.filter((f) => f.flight_date > todayUTC)

      const fresh = pastRows.filter((f) => !existing.has(dupKey(f)))
      const skippedCount = pastRows.length - fresh.length
      setSkipped(skippedCount)

      // 2) 내 항공기 upsert
      setProgress('항공기 정보 저장 중…')
      if (result.aircraft.length) {
        const rows = result.aircraft.map((a) => ({ ...a, user_id: user.id }))
        const { error: acErr } = await supabase
          .from('aircraft')
          .upsert(rows, { onConflict: 'user_id,registration' })
        if (acErr) throw new Error('항공기 저장 실패: ' + acErr.message)
      }

      // 3) 비행 기록 500건씩 나눠 저장
      let done = 0
      for (let i = 0; i < fresh.length; i += 500) {
        const chunk = fresh.slice(i, i + 500).map((f) => ({ ...f, user_id: user.id }))
        const { error: insErr } = await supabase.from('flights').insert(chunk)
        if (insErr) throw new Error('저장 실패: ' + insErr.message)
        done += chunk.length
        setProgress(`비행 기록 저장 중… ${done}/${fresh.length}`)
      }
      // 4) 미래 행 → 예정 편 (홈 "오늘의 비행"·앱 위젯에 바로 등장)
      //  · 이미 예정 편이 있는 **날짜**는 건드리지 않는다 — 로스터가 아는 날은 로스터가 진실
      //  · 편명은 회사 로그북에 없다 → ''(빈 문자열): upsert 키(user,날짜,편명,std)가
      //    NULL끼리는 안 겹쳐 재업로드마다 행이 늘 수 있는데 ''는 정상으로 겹쳐 멱등
      //  · 회사 로그북 시각은 UTC → 공항 현지(airports.tz)로. OUT 없는 행은 멱등이 안 돼 제외
      let added = 0
      let held = 0
      if (futureRows.length) {
        setProgress('다가오는 비행을 스케줄에 넣는 중…')
        const { data: ex } = await supabase.from('roster_flights').select('flight_date,status')
        const taken = new Set((ex ?? []).filter((r) => r.status !== 'cancelled').map((r) => r.flight_date))
        const idents = new Set<string>()
        for (const f of futureRows) {
          if (f.origin) idents.add(f.origin)
          if (f.destination) idents.add(f.destination)
        }
        const tzMap = new Map<string, string | null>()
        if (idents.size) {
          const { data: aps } = await supabase
            .from('airports').select('ident,iata,tz').in('ident', Array.from(idents))
          for (const a of aps ?? []) {
            tzMap.set(a.ident, a.tz ?? null)
            if (a.iata) tzMap.set(a.iata, a.tz ?? null)
          }
        }
        const rows: {
          user_id: string; flight_date: string; flight_number: string
          origin: string; destination: string; std: string; sta: string | null
          aircraft_type: string | null; report_time: null; duty_end_time: null; status: string
        }[] = []
        const seen = new Set<string>()
        for (const f of futureRows) {
          if (!f.origin || !f.destination || !f.out_time) { held++; continue }
          const dep = utcToLocal(f.flight_date, f.out_time, tzMap.get(f.origin) ?? null)
          const arr = f.in_time ? utcToLocal(f.flight_date, f.in_time, tzMap.get(f.destination) ?? null).hm : null
          if (taken.has(dep.day)) { held++; continue }
          const key = `${dep.day}|${dep.hm}`
          if (seen.has(key)) { held++; continue }
          seen.add(key)
          rows.push({
            user_id: user.id, flight_date: dep.day, flight_number: '',
            origin: f.origin, destination: f.destination,
            std: dep.hm, sta: arr, aircraft_type: f.aircraft_type ?? null,
            report_time: null, duty_end_time: null, status: 'planned',
          })
        }
        if (rows.length) {
          const { error: roErr } = await supabase
            .from('roster_flights')
            .upsert(rows, { onConflict: 'user_id,flight_date,flight_number,std' })
          if (roErr) throw new Error('스케줄 등록 실패: ' + roErr.message)
          added = rows.length
        }
      }
      setUpcoming(added)
      setFutureHeld(held)

      setImported(done)
      setStep('done')
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
      setStep('preview')
    }
  }

  const totalMin = result?.flights.reduce((s, f) => s + f.total_min, 0) ?? 0
  const dates = result?.flights.map((f) => f.flight_date).sort() ?? []

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">로그북 가져오기</h1>
        <Link href="/" className="text-sm text-app-accent">홈으로</Link>
      </div>

      {step === 'pick' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-app-line bg-app-surface p-5">
            <h2 className="font-semibold">로그북 파일 업로드</h2>
            <p className="mt-1 text-sm text-app-sub">
              아래 형식을 자동으로 알아봐요. 먼저 내용을 요약해 보여드리고, 확인 후에 저장돼요.
              이미 있는 기록은 자동으로 건너뛰니 여러 파일을 올려도 안전해요.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-app-sub">
              <li>· LogTen Pro 내보내기 · Dynamic Export (.txt)</li>
              <li>· 🇹🇭 <b>라이언에어 회사 로그북</b> (PilotLogBookReport — 엑셀·PDF 출력본 둘 다)</li>
            </ul>
            <label className="mt-4 block">
              <span className="inline-block cursor-pointer rounded-xl bg-app-btn px-5 py-3 font-semibold text-white">
                {fileBusy ? '읽는 중…' : '파일 선택'}
              </span>
              <input
                type="file"
                accept=".txt,.tsv,.csv,.xlsx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={onFile}
              />
            </label>
            <p className="mt-3 text-xs text-app-hint">
              회사 파일은 확장자가 .csv여도 그대로 올리시면 돼요. 시간은 회사 로그북
              그대로 들어갑니다 (보정·추정 없음).
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="rounded-2xl border border-app-line bg-app-surface p-5">
            <h2 className="font-semibold">✈️ 로스터 (PDF·엑셀)</h2>
            <p className="mt-1 text-sm text-app-sub">
              회사에서 받은 스케줄 파일을 올리면 한 달 비행이 예정으로 등록되고,
              홈에서 원탭으로 기록할 수 있어요. 항공사는 자동으로 알아봐요.
            </p>
            {!roster ? (
              <label className="mt-4 block">
                <span className="inline-block cursor-pointer rounded-xl border border-app-accent-soft bg-app-accent-soft px-5 py-3 font-semibold text-app-accent">
                  {rosterBusy ? '읽는 중…' : '로스터 파일 선택'}
                </span>
                <input type="file" accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden" onChange={onRosterFile} />
              </label>
            ) : (
              <div className="mt-4 space-y-3">
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-app-hint">비행</dt><dd className="text-lg font-bold">{roster.stats.flights}편</dd></div>
                  <div><dt className="text-app-hint">휴무</dt><dd className="text-lg font-bold">{roster.stats.offDays}일</dd></div>
                  <div><dt className="text-app-hint">스탠바이·훈련</dt><dd className="text-lg font-bold">{roster.stats.standbyDays}일</dd></div>
                </dl>
                <p className="text-xs text-app-hint">{roster.period.start} ~ {roster.period.end}</p>
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl bg-app-bg p-2 text-xs">
                  {roster.flights.slice(0, 50).map((f, i) => (
                    <p key={i} className="font-mono">
                      {f.flight_date.slice(5)} {f.flight_number} {f.origin}→{f.destination} {f.std}-{f.sta}{f.overnight ? '+1' : ''} {f.aircraft_type ?? ''}
                    </p>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setRoster(null)} className="flex-1 rounded-xl border border-app-line bg-app-surface py-2.5 font-semibold">
                    취소
                  </button>
                  <button onClick={registerRoster} disabled={rosterBusy} className="flex-1 rounded-xl bg-app-btn py-2.5 font-semibold text-white disabled:opacity-50">
                    {roster.stats.flights}편 등록
                  </button>
                </div>
              </div>
            )}
            {rosterMsg && <p className="mt-3 text-sm">{rosterMsg}</p>}
          </div>

          <p className="text-xs text-app-hint">
            다른 로그북 앱 형식(CSV 등)도 순차적으로 추가할 예정이에요. 안 열리는 파일이 있으면 그대로 보내주세요.
          </p>
        </div>
      )}

      {step === 'preview' && result && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-app-line bg-app-surface p-5">
            <h2 className="font-semibold">이렇게 읽었어요</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-app-hint">비행 수</dt><dd className="text-lg font-bold">{result.flights.length.toLocaleString()}편</dd></div>
              <div><dt className="text-app-hint">총 비행시간</dt><dd className="text-lg font-bold">{minToHMGrouped(totalMin)}</dd></div>
              <div><dt className="text-app-hint">기간</dt><dd className="font-medium">{dates[0]} ~ {dates[dates.length - 1]}</dd></div>
              <div><dt className="text-app-hint">항공기</dt><dd className="font-medium">{result.aircraft.length}대</dd></div>
            </dl>
            {result.errors.length > 0 && (
              <p className="mt-3 text-xs text-amber-600">건너뛴 줄 {result.errors.length}개 (형식을 읽지 못함)</p>
            )}
          </div>

          {(result.notes?.length || result.warnings?.length) && (
            <div className="rounded-2xl border border-app-line bg-app-surface p-5">
              <h2 className="font-semibold">이렇게 채웠어요</h2>
              {result.notes?.map((n, i) => (
                <p key={`n${i}`} className="mt-2 text-sm text-app-sub" style={{ wordBreak: 'keep-all' }}>· {n}</p>
              ))}
              {result.warnings?.map((w, i) => (
                <p key={`w${i}`} className="mt-2 text-sm text-amber-600" style={{ wordBreak: 'keep-all' }}>⚠️ {w}</p>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-app-line bg-app-surface p-5">
            <h2 className="font-semibold">첫 5편 미리보기</h2>
            <div className="mt-3 space-y-2 text-xs">
              {result.flights.slice(0, 5).map((f, i) => (
                <div key={i} className="rounded-lg bg-app-bg p-2 font-mono">
                  <div>
                    {f.flight_date} · {f.origin ?? '?'}→{f.destination ?? '?'} · {f.out_time ?? '--:--'}-{f.in_time ?? '--:--'}
                    {f.aircraft_reg ? ` · ${f.aircraft_reg}` : ''}
                  </div>
                  <div className="mt-0.5 text-app-sub">
                    블록 {minToHMGrouped(f.total_min)}
                    {f.flight_min ? ` · 공중 ${minToHMGrouped(f.flight_min)}` : ''}
                    {f.night_min ? ` · 야간 ${minToHMGrouped(f.night_min)}` : ''}
                    {f.sim_min ? ` · 시뮬 ${minToHMGrouped(f.sim_min)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => { setStep('pick'); setResult(null) }} className="flex-1 rounded-xl border border-app-line bg-app-surface py-3 font-semibold">
              다시 선택
            </button>
            <button onClick={runImport} className="flex-1 rounded-xl bg-app-btn py-3 font-semibold text-white">
              가져오기
            </button>
          </div>
          <p className="text-xs text-app-hint" style={{ wordBreak: 'keep-all' }}>
            이미 있는 기록(같은 날짜·구간·출발시각)은 자동으로 건너뛰어요.
          </p>
        </div>
      )}

      {step === 'importing' && (
        <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center">
          <p className="font-semibold">{progress || '가져오는 중…'}</p>
          <p className="mt-2 text-sm text-app-sub">화면을 닫지 말고 잠시만 기다려 주세요.</p>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-app-line bg-app-surface p-8 text-center">
            <p className="text-3xl">🎉</p>
            <p className="mt-2 text-lg font-bold">{imported.toLocaleString()}편 가져왔어요</p>
            {skipped > 0 && <p className="mt-1 text-sm text-app-sub">이미 있던 {skipped.toLocaleString()}편은 건너뛰었어요.</p>}
            {upcoming > 0 && (
              <p className="mt-1 text-sm text-app-sub">
                오늘 이후 {upcoming.toLocaleString()}편은 스케줄로 등록했어요 — 홈 화면과 앱 위젯에 떠요.
              </p>
            )}
            {futureHeld > 0 && (
              <p className="mt-1 text-sm text-app-sub">
                오늘 이후 {futureHeld.toLocaleString()}편은 이미 스케줄이 있는 날짜라 그대로 뒀어요.
              </p>
            )}
          </div>
          <Link href="/" className="block rounded-xl bg-app-btn py-3 text-center font-semibold text-white">
            홈에서 확인하기
          </Link>
        </div>
      )}
    </main>
  )
}
