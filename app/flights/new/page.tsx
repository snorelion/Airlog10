'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  addFlight, updateFlight, getFlight, rememberAircraft, getAircraftList,
  getSetting, setSetting, getFlights, getRosterFlight, updateRosterStatus, type Flight,
} from '@/lib/store'
import { hmToMin, minToHM } from '@/lib/time'
import Nav from '@/components/Nav'

// 입력 칸을 벗어나면 "105"→"1:05" 로 정돈 (비행시간·야간·실계기)
function tidyDuration(v: string, set: (s: string) => void) {
  const min = hmToMin(v)
  if (v.trim() && min > 0) set(minToHM(min))
}

// 시각(OUT/IN)은 "0100"→"01:00" 로 정돈
function tidyClock(v: string, set: (s: string) => void) {
  const t = v.trim()
  if (!t || !/^(\d{1,2}:\d{2}|\d{3,4})$/.test(t)) return
  set(fmtClock(hmToMin(t)))
}

// "1000"·"10:00" → 분. 형식이 아니면 null ("00:00"도 유효한 0분)
function parseClock(s: string): number | null {
  const t = s.trim()
  if (!/^(\d{1,2}:\d{2}|\d{3,4})$/.test(t)) return null
  return hmToMin(t)
}

// 분 → "HH:MM" (자정 넘김은 24시간으로 감아서)
function fmtClock(m: number): string {
  const mm = ((m % 1440) + 1440) % 1440
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
}

// 로스터 시각은 '베이스 로컬'(방콕 UTC+7) — 로그북의 OUT/IN 칸은 UTC라 변환해서 넣는다
function localBaseToUtc(hm: string): string {
  return fmtClock(hmToMin(hm) - 420)
}

// 시각·시각·시간 3칸 연동 — 어느 칸을 고치든 나머지가 맞게 계산된다
//  start+end → dur / start+dur → end / end+dur → start (자정 넘김 처리)
function linkTimes(
  edited: 'start' | 'end' | 'dur',
  start: string, end: string, dur: string,
  setStart: (s: string) => void, setEnd: (s: string) => void, setDur: (s: string) => void
) {
  const s = parseClock(start)
  const e = parseClock(end)
  const d = dur.trim() ? hmToMin(dur) || null : null
  if (edited === 'dur') {
    if (!d) return
    if (s !== null) setEnd(fmtClock(s + d))
    else if (e !== null) setStart(fmtClock(e - d))
  } else {
    if (s !== null && e !== null) setDur(minToHM(((e - s) + 1440) % 1440))
    else if (edited === 'start' && s !== null && d) setEnd(fmtClock(s + d))
    else if (edited === 'end' && e !== null && d) setStart(fmtClock(e - d))
  }
}

type AirportHit = { ident: string; iata: string | null; name: string | null; municipality: string | null }
type AircraftHit = { registration: string; type_code: string | null }

// ── 공항 자동완성 입력 ──────────────────────────────
function AirportField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  const [hits, setHits] = useState<AirportHit[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function search(q: string) {
    onChange(q.toUpperCase())
    if (timer.current) clearTimeout(timer.current)
    if (q.length < 2) { setHits([]); return }
    timer.current = setTimeout(async () => {
      const supabase = createClient()
      const term = q.toUpperCase()
      const { data } = await supabase
        .from('airports')
        .select('ident, iata, name, municipality')
        .or(`ident.ilike.${term}%,iata.ilike.${term}%`)
        .order('type')
        .limit(6)
      setHits(data ?? [])
      setOpen(true)
    }, 200)
  }

  return (
    <div className="relative">
      <label className="text-xs font-medium text-app-sub">{label}</label>
      <input
        value={value}
        onChange={(e) => search(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="ICAO/IATA"
        autoCapitalize="characters"
        autoCorrect="off"
        className="mt-1 w-full rounded-xl border border-app-line bg-app-surface px-3 py-2.5 font-mono uppercase outline-none focus:border-air-400"
      />
      {open && hits.length > 0 && (
        <div className="absolute z-30 mt-1 w-72 max-w-[80vw] overflow-hidden rounded-xl border border-app-line bg-app-surface shadow-lg">
          {hits.map((h) => (
            <button
              type="button"
              key={h.ident}
              onMouseDown={() => { onChange(h.ident); setOpen(false) }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-app-accent-soft"
            >
              <span className="font-mono font-semibold">{h.ident}</span>
              {h.iata && <span className="ml-1 text-app-hint">({h.iata})</span>}
              <span className="ml-2 text-app-sub">{h.name ?? h.municipality ?? ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 비행 입력 폼 ──────────────────────────────
export default function NewFlightPage() {
  const router = useRouter()
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [flightNumber, setFlightNumber] = useState('')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [reg, setReg] = useState('')
  const [typeCode, setTypeCode] = useState('')
  const [regHits, setRegHits] = useState<AircraftHit[]>([])
  const [regOpen, setRegOpen] = useState(false)
  const [outTime, setOutTime] = useState('')
  const [inTime, setInTime] = useState('')
  const [totalHM, setTotalHM] = useState('')
  const [tkoTime, setTkoTime] = useState('')
  const [ldgTime, setLdgTime] = useState('')
  const [flightHM, setFlightHM] = useState('')
  const [typeHits, setTypeHits] = useState<AircraftHit[]>([])
  const [typeOpen, setTypeOpen] = useState(false)
  const [myName, setMyName] = useState('')
  const [capacity, setCapacity] = useState('SIC')
  const [isPf, setIsPf] = useState(false)
  const [nightHM, setNightHM] = useState('')
  const [instHM, setInstHM] = useState('')
  const [dayTO, setDayTO] = useState(0)
  const [dayLDG, setDayLDG] = useState(0)
  const [nightTO, setNightTO] = useState(0)
  const [nightLDG, setNightLDG] = useState(0)
  const [autolands, setAutolands] = useState(0)
  const [crewPic, setCrewPic] = useState('')
  const [crewSic, setCrewSic] = useState('')
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rosterId, setRosterId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [draftRestored, setDraftRestored] = useState(false)
  const editOriginal = useRef<Flight | null>(null)
  const initDone = useRef(false)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const regTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 기체별 마지막 비행일 — 최근에 탄 기체(현 소속 기단)가 자동완성 맨 위로
  const lastFlown = useRef<Map<string, string>>(new Map())

  // 폼 상태 묶음 (임시저장용)
  function snapshot() {
    return {
      date, flightNumber, origin, destination, reg, typeCode,
      outTime, inTime, totalHM, tkoTime, ldgTime, flightHM,
      capacity, isPf, nightHM, instHM,
      dayTO, dayLDG, nightTO, nightLDG, autolands,
      crewPic, crewSic, remarks, rosterId,
    }
  }

  function restore(d: ReturnType<typeof snapshot>) {
    setDate(d.date); setFlightNumber(d.flightNumber); setOrigin(d.origin); setDestination(d.destination)
    setReg(d.reg); setTypeCode(d.typeCode)
    setOutTime(d.outTime); setInTime(d.inTime); setTotalHM(d.totalHM)
    setTkoTime(d.tkoTime); setLdgTime(d.ldgTime); setFlightHM(d.flightHM)
    setCapacity(d.capacity); setIsPf(d.isPf); setNightHM(d.nightHM); setInstHM(d.instHM)
    setDayTO(d.dayTO); setDayLDG(d.dayLDG); setNightTO(d.nightTO); setNightLDG(d.nightLDG)
    setAutolands(d.autolands); setCrewPic(d.crewPic); setCrewSic(d.crewSic); setRemarks(d.remarks)
    setRosterId(d.rosterId)
  }

  // 의미 있는 내용이 있어야만 임시저장으로 취급 (빈 폼 저장이 프리필을 막지 않게)
  function draftMeaningful(d: ReturnType<typeof snapshot>): boolean {
    return Boolean(
      d.flightNumber || d.reg || d.outTime || d.inTime || d.totalHM ||
      d.tkoTime || d.ldgTime || d.flightHM || d.remarks || d.nightHM || d.instHM ||
      d.dayTO || d.dayLDG || d.nightTO || d.nightLDG || d.autolands
    )
  }

  // 초기화: 수정 모드 → 임시저장 복원 → 로스터 프리필 → 설정 프리필 순
  useEffect(() => {
    void (async () => {
      const params = new URLSearchParams(window.location.search)
      const eid = params.get('edit')
      const rid = params.get('roster')
      const name = (await getSetting('pilotName')) ?? ''
      setMyName(name)

      if (eid) {
        const f = await getFlight(eid)
        if (f) {
          setEditId(eid)
          editOriginal.current = f
          setDate(f.flight_date)
          setFlightNumber(f.flight_number ?? '')
          setOrigin(f.origin ?? '')
          setDestination(f.destination ?? '')
          setReg(f.aircraft_reg ?? '')
          setTypeCode(f.aircraft_type ?? '')
          setOutTime(f.out_time ?? '')
          setInTime(f.in_time ?? '')
          setTotalHM(f.total_min ? minToHM(f.total_min) : '')
          setTkoTime(f.takeoff_time ?? '')
          setLdgTime(f.landing_time ?? '')
          setFlightHM(f.flight_min ? minToHM(f.flight_min) : '')
          setCapacity(f.capacity ?? 'SIC')
          setIsPf(f.is_pf ?? false)
          setNightHM(f.night_min ? minToHM(f.night_min) : '')
          setInstHM(f.inst_actual_min ? minToHM(f.inst_actual_min) : '')
          setDayTO(f.day_takeoffs); setDayLDG(f.day_landings)
          setNightTO(f.night_takeoffs); setNightLDG(f.night_landings)
          setAutolands(f.autolands)
          setCrewPic(f.crew_pic ?? ''); setCrewSic(f.crew_sic ?? '')
          setRemarks(f.remarks ?? '')
        }
      } else {
        // 임시저장 복원 (같은 맥락 + 실제 내용이 있을 때만)
        let restored = false
        try {
          const raw = await getSetting('flightDraft')
          if (raw) {
            const d = JSON.parse(raw)
            if ((d.rosterId ?? null) === (rid ?? null) && draftMeaningful(d)) {
              restore(d)
              // 복원본에 크루가 비어 있으면 내 이름은 채워준다 (설정 역할 기준)
              if (name && !d.crewPic && !d.crewSic) {
                if (d.capacity === 'PIC') setCrewPic(name)
                else setCrewSic(name)
              }
              setDraftRestored(true)
              restored = true
            }
          }
        } catch {}

        if (!restored) {
          const cap = (await getSetting('defaultCapacity')) ?? ''
          const hb = (await getSetting('homeBase')) ?? ''
          if (cap === 'PIC' || cap === 'SIC' || cap === 'PICUS') {
            setCapacity(cap)
            if (name) {
              if (cap === 'PIC') setCrewPic(name)
              else setCrewSic(name)
            }
          }
          if (rid) {
            const r = await getRosterFlight(rid)
            if (r) {
              setRosterId(rid)
              setDate(r.flight_date)
              if (r.flight_number) setFlightNumber(r.flight_number)
              if (r.origin) setOrigin(r.origin)
              if (r.destination) setDestination(r.destination)
              if (r.aircraft_type) setTypeCode(r.aircraft_type)
              if (r.std) setOutTime(localBaseToUtc(r.std))
              if (r.sta) setInTime(localBaseToUtc(r.sta))
              if (r.std && r.sta) {
                const s = hmToMin(r.std)
                const e = hmToMin(r.sta)
                setTotalHM(minToHM(((e - s) + 1440) % 1440))
              }
            }
          } else if (hb) {
            setOrigin((prev) => prev || hb)
          }
        }
      }

      const flights = await getFlights()
      const map = new Map<string, string>()
      for (const f of flights) {
        if (!f.aircraft_reg) continue
        const cur = map.get(f.aircraft_reg)
        if (!cur || f.flight_date > cur) map.set(f.aircraft_reg, f.flight_date)
      }
      lastFlown.current = map
      initDone.current = true
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 임시저장 — 쓰다가 닫아도 안 사라지게 (비행 중 절반만 쓰고 착륙 후 마저 쓰는 흐름)
  useEffect(() => {
    if (!initDone.current || editId) return
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      const snap = snapshot()
      // 빈 폼은 저장하지 않는다 (다음 방문의 이름·역할 프리필을 막지 않게)
      void setSetting('flightDraft', draftMeaningful(snap) ? JSON.stringify(snap) : '')
    }, 400)
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, flightNumber, origin, destination, reg, typeCode, outTime, inTime, totalHM,
      tkoTime, ldgTime, flightHM, capacity, isPf, nightHM, instHM,
      dayTO, dayLDG, nightTO, nightLDG, autolands, crewPic, crewSic, remarks, rosterId])

  async function clearDraft() {
    await setSetting('flightDraft', '')
  }

  function byRecency(a: { registration: string }, b: { registration: string }): number {
    const da = lastFlown.current.get(a.registration) ?? ''
    const db = lastFlown.current.get(b.registration) ?? ''
    return db.localeCompare(da)
  }

  // 역할 바꾸면 내 이름을 맞는 칸으로 옮김 (자동 채운 값만)
  function changeCapacity(cp: string) {
    setCapacity(cp)
    if (!myName) return
    if (cp === 'PIC') {
      if (crewSic === myName) setCrewSic('')
      if (!crewPic) setCrewPic(myName)
    } else {
      if (crewPic === myName) setCrewPic('')
      if (!crewSic) setCrewSic(myName)
    }
  }

  // 등록번호 자동완성 — 로컬 사본에서 (오프라인에서도 동작)
  function searchReg(q: string) {
    const term = q.toUpperCase()
    setReg(term)
    if (regTimer.current) clearTimeout(regTimer.current)
    if (q.length < 2) { setRegHits([]); return }
    regTimer.current = setTimeout(async () => {
      const list = await getAircraftList()
      const hits = list
        .filter((a) => a.registration.startsWith(term))
        .sort(byRecency)
        .slice(0, 5)
        .map((a) => ({ registration: a.registration, type_code: a.type_code }))
      setRegHits(hits)
      setRegOpen(true)
    }, 150)
  }

  // 등록번호 칸을 벗어날 때 아는 기체면 기종 자동 채움
  async function fillTypeFromReg() {
    const term = reg.trim().toUpperCase()
    if (!term) return
    const list = await getAircraftList()
    const hit = list.find((a) => a.registration === term)
    if (hit?.type_code) setTypeCode(hit.type_code)
  }

  // 기종 자동완성 — 그 기종의 기체번호를 골라 넣기
  function searchType(q: string) {
    const term = q.toUpperCase()
    setTypeCode(term)
    if (typeTimer.current) clearTimeout(typeTimer.current)
    if (term.length < 2) { setTypeHits([]); return }
    typeTimer.current = setTimeout(async () => {
      const list = await getAircraftList()
      const hits = list
        .filter((a) => (a.type_code ?? '').startsWith(term))
        .sort(byRecency)
        .slice(0, 8)
        .map((a) => ({ registration: a.registration, type_code: a.type_code }))
      setTypeHits(hits)
      setTypeOpen(true)
    }, 150)
  }

  // PF 켜면 이착륙 기본 1회 (전부 0일 때만)
  function togglePf(v: boolean) {
    setIsPf(v)
    if (v && dayTO === 0 && dayLDG === 0 && nightTO === 0 && nightLDG === 0) {
      setDayTO(1); setDayLDG(1)
    }
  }

  async function save() {
    setError('')
    const totalMin = hmToMin(totalHM)
    if (!date) { setError('날짜를 입력해 주세요.'); return }
    if (totalMin <= 0) { setError('블록타임(총시간)을 입력해 주세요. (예: 1:15)'); return }
    setBusy(true)

    const regUp = reg.trim().toUpperCase() || null
    const typeUp = typeCode.trim().toUpperCase() || null

    if (regUp) {
      await rememberAircraft({ registration: regUp, type_code: typeUp })
    }

    const fields = {
      flight_date: date,
      flight_number: flightNumber.trim() || null,
      origin: origin.trim().toUpperCase() || null,
      destination: destination.trim().toUpperCase() || null,
      out_time: outTime.trim() || null,
      in_time: inTime.trim() || null,
      takeoff_time: tkoTime.trim() || null,
      landing_time: ldgTime.trim() || null,
      flight_min: hmToMin(flightHM),
      aircraft_reg: regUp,
      aircraft_type: typeUp,
      total_min: totalMin,
      pic_min: capacity === 'PIC' ? totalMin : 0,
      sic_min: capacity === 'SIC' ? totalMin : 0,
      picus_min: capacity === 'PICUS' ? totalMin : 0,
      night_min: hmToMin(nightHM),
      inst_actual_min: hmToMin(instHM),
      multi_pilot_min: totalMin,
      day_takeoffs: dayTO,
      day_landings: dayLDG,
      night_takeoffs: nightTO,
      night_landings: nightLDG,
      autolands,
      capacity,
      is_pf: isPf,
      crew_pic: crewPic.trim() || null,
      crew_sic: crewSic.trim() || null,
      remarks: remarks.trim() || null,
    }

    if (editId && editOriginal.current) {
      if (draftTimer.current) clearTimeout(draftTimer.current)
      // 임포트된 기록 보호: 역할·총시간을 실제로 바꾼 경우에만 PIC/SIC/PICUS·멀티 시간을
      // 다시 계산한다. (메모만 고쳤는데 PIC 시간이 0이 되는 사고 방지)
      const orig = editOriginal.current
      const roleOrTimeChanged =
        capacity !== (orig.capacity ?? 'SIC') || totalMin !== orig.total_min
      const mins = roleOrTimeChanged
        ? {
            pic_min: capacity === 'PIC' ? totalMin : 0,
            sic_min: capacity === 'SIC' ? totalMin : 0,
            picus_min: capacity === 'PICUS' ? totalMin : 0,
            multi_pilot_min: totalMin,
            capacity,
          }
        : {
            pic_min: orig.pic_min,
            sic_min: orig.sic_min,
            picus_min: orig.picus_min,
            multi_pilot_min: orig.multi_pilot_min,
            capacity: orig.capacity,
          }
      await updateFlight({ ...orig, ...fields, ...mins })
      setBusy(false)
      router.push('/logbook')
      return
    }

    await addFlight({
      ...fields,
      inst_sim_min: 0,
      xc_min: 0,
      dual_received_min: 0,
      dual_given_min: 0,
      sim_min: 0,
      go_arounds: 0,
      holds: 0,
      approaches: null,
      crew_other: null,
      pax_count: null,
      distance_nm: null,
      source: 'manual',
    })
    if (rosterId) await updateRosterStatus(rosterId, 'logged')
    // blur가 막 예약해 둔 임시저장 타이머까지 지워야 저장 후 draft가 되살아나지 않는다
    if (draftTimer.current) clearTimeout(draftTimer.current)
    await clearDraft()
    setBusy(false)
    router.push(rosterId ? '/' : '/logbook')
  }

  async function discardDraft() {
    if (draftTimer.current) clearTimeout(draftTimer.current)
    await clearDraft()
    window.location.href = '/flights/new'
  }

  const inputCls = 'mt-1 w-full rounded-xl border border-app-line bg-app-surface px-3 py-2.5 outline-none focus:border-air-400'

  return (
    <main className="mx-auto max-w-lg px-4 pb-28 pt-6">
      <h1 className="mb-2 text-xl font-bold">{editId ? '비행 수정' : '비행 기록'}</h1>

      {draftRestored && !editId && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/25 dark:text-amber-200">
          <span>✍️ 쓰다 만 내용을 불러왔어요 (자동 임시저장)</span>
          <button onClick={discardDraft} className="font-semibold underline">비우기</button>
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-app-sub">날짜</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-app-sub">편명</label>
            <input value={flightNumber} onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
              placeholder="SL501" autoCapitalize="characters" className={inputCls + ' font-mono uppercase'} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <AirportField label="출발 (FROM)" value={origin} onChange={setOrigin} />
          <AirportField label="도착 (TO)" value={destination} onChange={setDestination} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <label className="text-xs font-medium text-app-sub">기체 등록번호</label>
            <input
              value={reg}
              onChange={(e) => searchReg(e.target.value)}
              onFocus={() => regHits.length && setRegOpen(true)}
              onBlur={() => { setTimeout(() => setRegOpen(false), 150); void fillTypeFromReg() }}
              placeholder="HS-LVL" autoCapitalize="characters" autoCorrect="off"
              className={inputCls + ' font-mono uppercase'}
            />
            {regOpen && regHits.length > 0 && (
              <div className="absolute z-30 mt-1 w-56 overflow-hidden rounded-xl border border-app-line bg-app-surface shadow-lg">
                {regHits.map((h) => (
                  <button
                    type="button" key={h.registration}
                    onMouseDown={() => {
                      setReg(h.registration)
                      if (h.type_code) setTypeCode(h.type_code)
                      setRegOpen(false)
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-app-accent-soft"
                  >
                    <span className="font-mono font-semibold">{h.registration}</span>
                    {h.type_code && <span className="ml-2 text-app-sub">{h.type_code}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <label className="text-xs font-medium text-app-sub">기종</label>
            <input
              value={typeCode}
              onChange={(e) => searchType(e.target.value)}
              onFocus={() => typeHits.length && setTypeOpen(true)}
              onBlur={() => setTimeout(() => setTypeOpen(false), 150)}
              placeholder="B738" autoCapitalize="characters" autoCorrect="off"
              className={inputCls + ' font-mono uppercase'}
            />
            {typeOpen && typeHits.length > 0 && (
              <div className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-app-line bg-app-surface shadow-lg">
                {typeHits.map((h) => (
                  <button
                    type="button" key={h.registration}
                    onMouseDown={() => {
                      setReg(h.registration)
                      if (h.type_code) setTypeCode(h.type_code)
                      setTypeOpen(false)
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-app-accent-soft"
                  >
                    <span className="font-mono font-semibold">{h.registration}</span>
                    {h.type_code && <span className="ml-2 text-app-sub">{h.type_code}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-app-sub">OUT (UTC)</label>
            <input value={outTime} onChange={(e) => setOutTime(e.target.value)}
              onBlur={() => {
                tidyClock(outTime, setOutTime)
                linkTimes('start', outTime, inTime, totalHM, setOutTime, setInTime, setTotalHM)
              }}
              placeholder="09:30" inputMode="numeric" className={inputCls + ' font-mono'} />
          </div>
          <div>
            <label className="text-xs font-medium text-app-sub">IN (UTC)</label>
            <input value={inTime} onChange={(e) => setInTime(e.target.value)}
              onBlur={() => {
                tidyClock(inTime, setInTime)
                linkTimes('end', outTime, inTime, totalHM, setOutTime, setInTime, setTotalHM)
              }}
              placeholder="11:30" inputMode="numeric" className={inputCls + ' font-mono'} />
          </div>
          <div>
            <label className="text-xs font-medium text-app-sub">블록타임 (총시간)</label>
            <input value={totalHM} onChange={(e) => setTotalHM(e.target.value)}
              onBlur={() => {
                tidyDuration(totalHM, setTotalHM)
                linkTimes('dur', outTime, inTime, totalHM, setOutTime, setInTime, setTotalHM)
              }}
              placeholder="1:30" inputMode="numeric" className={inputCls + ' font-mono font-semibold'} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-app-sub">T/O (UTC)</label>
            <input value={tkoTime} onChange={(e) => setTkoTime(e.target.value)}
              onBlur={() => {
                tidyClock(tkoTime, setTkoTime)
                linkTimes('start', tkoTime, ldgTime, flightHM, setTkoTime, setLdgTime, setFlightHM)
              }}
              placeholder="09:42" inputMode="numeric" className={inputCls + ' font-mono'} />
          </div>
          <div>
            <label className="text-xs font-medium text-app-sub">LDG (UTC)</label>
            <input value={ldgTime} onChange={(e) => setLdgTime(e.target.value)}
              onBlur={() => {
                tidyClock(ldgTime, setLdgTime)
                linkTimes('end', tkoTime, ldgTime, flightHM, setTkoTime, setLdgTime, setFlightHM)
              }}
              placeholder="11:18" inputMode="numeric" className={inputCls + ' font-mono'} />
          </div>
          <div>
            <label className="text-xs font-medium text-app-sub">Flight Time</label>
            <input value={flightHM} onChange={(e) => setFlightHM(e.target.value)}
              onBlur={() => {
                tidyDuration(flightHM, setFlightHM)
                linkTimes('dur', tkoTime, ldgTime, flightHM, setTkoTime, setLdgTime, setFlightHM)
              }}
              placeholder="1:36" inputMode="numeric" className={inputCls + ' font-mono'} />
          </div>
        </div>

        <div className="rounded-2xl border border-app-line bg-app-surface p-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {['PIC', 'SIC', 'PICUS'].map((cp) => (
                <button
                  key={cp} type="button" onClick={() => changeCapacity(cp)}
                  className={
                    'rounded-lg px-3 py-1.5 text-sm font-semibold ' +
                    (capacity === cp ? 'bg-app-btn text-white' : 'bg-app-bg text-app-sub')
                  }
                >
                  {cp}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={isPf} onChange={(e) => togglePf(e.target.checked)}
                className="h-5 w-5 accent-air-600" style={{ appearance: 'auto' }} />
              PF
            </label>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-app-sub">야간</label>
              <input value={nightHM} onChange={(e) => setNightHM(e.target.value)}
                onBlur={() => tidyDuration(nightHM, setNightHM)} placeholder="0:00"
                inputMode="numeric" className={inputCls + ' font-mono'} />
            </div>
            <div>
              <label className="text-xs font-medium text-app-sub">실계기</label>
              <input value={instHM} onChange={(e) => setInstHM(e.target.value)}
                onBlur={() => tidyDuration(instHM, setInstHM)} placeholder="0:00"
                inputMode="numeric" className={inputCls + ' font-mono'} />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-2">
            <Counter label="주간이륙" value={dayTO} onChange={setDayTO} />
            <Counter label="주간착륙" value={dayLDG} onChange={setDayLDG} />
            <Counter label="야간이륙" value={nightTO} onChange={setNightTO} />
            <Counter label="야간착륙" value={nightLDG} onChange={setNightLDG} />
            <Counter label="오토랜드" value={autolands} onChange={setAutolands} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-app-sub">기장 (PIC)</label>
            <input value={crewPic} onChange={(e) => setCrewPic(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-app-sub">부기장 (SIC)</label>
            <input value={crewSic} onChange={(e) => setCrewSic(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-app-sub">메모</label>
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className={inputCls} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={save} disabled={busy}
          className="w-full rounded-xl bg-app-btn py-3.5 text-lg font-bold text-white disabled:opacity-50"
        >
          {busy ? '저장 중…' : editId ? '수정 저장' : '저장'}
        </button>
      </div>

      <Nav />
    </main>
  )
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="rounded-xl bg-app-bg p-2 text-center">
      <p className="text-[10px] text-app-hint">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="px-1 text-lg text-app-sub">−</button>
        <span className="font-bold tabular-nums">{value}</span>
        <button type="button" onClick={() => onChange(value + 1)} className="px-1 text-lg text-app-sub">＋</button>
      </div>
    </div>
  )
}
