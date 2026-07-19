'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { addFlight, rememberAircraft, getAircraftList } from '@/lib/store'
import { hmToMin, minToHM } from '@/lib/time'
import Nav from '@/components/Nav'

// 입력 칸을 벗어나면 "105"→"1:05" 로 정돈 (비행시간·야간·실계기)
function tidyDuration(v: string, set: (s: string) => void) {
  const min = hmToMin(v)
  if (v.trim() && min > 0) set(minToHM(min))
}

// 시각(OUT/IN)은 "0100"→"01:00" 로 정돈
function tidyClock(v: string, set: (s: string) => void) {
  const min = hmToMin(v)
  if (!v.trim() || min <= 0) return
  const hh = Math.floor(min / 60) % 24
  set(`${String(hh).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`)
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
      <label className="text-xs font-medium text-ink-sub">{label}</label>
      <input
        value={value}
        onChange={(e) => search(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="ICAO/IATA"
        autoCapitalize="characters"
        autoCorrect="off"
        className="mt-1 w-full rounded-xl border border-ink-line bg-white px-3 py-2.5 font-mono uppercase outline-none focus:border-air-400"
      />
      {open && hits.length > 0 && (
        <div className="absolute z-30 mt-1 w-72 max-w-[80vw] overflow-hidden rounded-xl border border-ink-line bg-white shadow-lg">
          {hits.map((h) => (
            <button
              type="button"
              key={h.ident}
              onMouseDown={() => { onChange(h.ident); setOpen(false) }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-air-50"
            >
              <span className="font-mono font-semibold">{h.ident}</span>
              {h.iata && <span className="ml-1 text-ink-hint">({h.iata})</span>}
              <span className="ml-2 text-ink-sub">{h.name ?? h.municipality ?? ''}</span>
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
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
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
  const regTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        .slice(0, 5)
        .map((a) => ({ registration: a.registration, type_code: a.type_code }))
      setRegHits(hits)
      setRegOpen(true)
    }, 150)
  }

  // OUT/IN 시각이 둘 다 있으면 블록타임 자동 계산 (자정 넘김 처리)
  useEffect(() => {
    if (!outTime || !inTime || totalHM) return
    const o = hmToMin(outTime)
    const i = hmToMin(inTime)
    if (o === 0 && i === 0) return
    let diff = i - o
    if (diff < 0) diff += 24 * 60
    if (diff > 0) {
      setTotalHM(`${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, '0')}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outTime, inTime])

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
    if (totalMin <= 0) { setError('비행시간을 입력해 주세요. (예: 1:15)'); return }
    setBusy(true)

    const regUp = reg.trim().toUpperCase() || null
    const typeUp = typeCode.trim().toUpperCase() || null

    // 오프라인 우선: 로컬 사본+보낼함에 저장 → 온라인이면 자동 업로드
    if (regUp) {
      await rememberAircraft({ registration: regUp, type_code: typeUp })
    }

    await addFlight({
      flight_date: date,
      flight_number: flightNumber.trim() || null,
      origin: origin.trim().toUpperCase() || null,
      destination: destination.trim().toUpperCase() || null,
      out_time: outTime || null,
      in_time: inTime || null,
      aircraft_reg: regUp,
      aircraft_type: typeUp,
      total_min: totalMin,
      pic_min: capacity === 'PIC' ? totalMin : 0,
      sic_min: capacity === 'SIC' ? totalMin : 0,
      picus_min: capacity === 'PICUS' ? totalMin : 0,
      night_min: hmToMin(nightHM),
      inst_actual_min: hmToMin(instHM),
      inst_sim_min: 0,
      xc_min: 0,
      multi_pilot_min: totalMin,
      dual_received_min: 0,
      dual_given_min: 0,
      sim_min: 0,
      day_takeoffs: dayTO,
      day_landings: dayLDG,
      night_takeoffs: nightTO,
      night_landings: nightLDG,
      autolands,
      go_arounds: 0,
      holds: 0,
      approaches: null,
      capacity,
      is_pf: isPf,
      crew_pic: crewPic.trim() || null,
      crew_sic: crewSic.trim() || null,
      crew_other: null,
      pax_count: null,
      distance_nm: null,
      remarks: remarks.trim() || null,
      source: 'manual',
    })
    setBusy(false)
    router.push('/logbook')
  }

  const inputCls = 'mt-1 w-full rounded-xl border border-ink-line bg-white px-3 py-2.5 outline-none focus:border-air-400'

  return (
    <main className="mx-auto max-w-lg px-4 pb-28 pt-6">
      <h1 className="mb-4 text-xl font-bold">비행 기록</h1>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-sub">날짜</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-sub">편명</label>
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
            <label className="text-xs font-medium text-ink-sub">기체 등록번호</label>
            <input
              value={reg}
              onChange={(e) => searchReg(e.target.value)}
              onFocus={() => regHits.length && setRegOpen(true)}
              onBlur={() => setTimeout(() => setRegOpen(false), 150)}
              placeholder="HS-LVL" autoCapitalize="characters" autoCorrect="off"
              className={inputCls + ' font-mono uppercase'}
            />
            {regOpen && regHits.length > 0 && (
              <div className="absolute z-30 mt-1 w-56 overflow-hidden rounded-xl border border-ink-line bg-white shadow-lg">
                {regHits.map((h) => (
                  <button
                    type="button" key={h.registration}
                    onMouseDown={() => {
                      setReg(h.registration)
                      if (h.type_code) setTypeCode(h.type_code)
                      setRegOpen(false)
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-air-50"
                  >
                    <span className="font-mono font-semibold">{h.registration}</span>
                    {h.type_code && <span className="ml-2 text-ink-sub">{h.type_code}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-ink-sub">기종</label>
            <input value={typeCode} onChange={(e) => setTypeCode(e.target.value.toUpperCase())}
              placeholder="B738" autoCapitalize="characters" className={inputCls + ' font-mono uppercase'} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-sub">OUT (UTC)</label>
            <input value={outTime} onChange={(e) => setOutTime(e.target.value)}
              onBlur={() => tidyClock(outTime, setOutTime)} placeholder="09:30"
              inputMode="numeric" className={inputCls + ' font-mono'} />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-sub">IN (UTC)</label>
            <input value={inTime} onChange={(e) => setInTime(e.target.value)}
              onBlur={() => tidyClock(inTime, setInTime)} placeholder="10:45"
              inputMode="numeric" className={inputCls + ' font-mono'} />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-sub">비행시간</label>
            <input value={totalHM} onChange={(e) => setTotalHM(e.target.value)}
              onBlur={() => tidyDuration(totalHM, setTotalHM)} placeholder="1:15"
              inputMode="numeric" className={inputCls + ' font-mono font-semibold'} />
          </div>
        </div>

        <div className="rounded-2xl border border-ink-line bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {['PIC', 'SIC', 'PICUS'].map((cp) => (
                <button
                  key={cp} type="button" onClick={() => setCapacity(cp)}
                  className={
                    'rounded-lg px-3 py-1.5 text-sm font-semibold ' +
                    (capacity === cp ? 'bg-air-600 text-white' : 'bg-ink-bg text-ink-sub')
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
              <label className="text-xs font-medium text-ink-sub">야간</label>
              <input value={nightHM} onChange={(e) => setNightHM(e.target.value)}
                onBlur={() => tidyDuration(nightHM, setNightHM)} placeholder="0:00"
                inputMode="numeric" className={inputCls + ' font-mono'} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-sub">실계기</label>
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
            <label className="text-xs font-medium text-ink-sub">기장 (PIC)</label>
            <input value={crewPic} onChange={(e) => setCrewPic(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-sub">부기장 (SIC)</label>
            <input value={crewSic} onChange={(e) => setCrewSic(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-sub">메모</label>
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className={inputCls} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={save} disabled={busy}
          className="w-full rounded-xl bg-air-600 py-3.5 text-lg font-bold text-white disabled:opacity-50"
        >
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>

      <Nav />
    </main>
  )
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="rounded-xl bg-ink-bg p-2 text-center">
      <p className="text-[10px] text-ink-hint">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="px-1 text-lg text-ink-sub">−</button>
        <span className="font-bold tabular-nums">{value}</span>
        <button type="button" onClick={() => onChange(value + 1)} className="px-1 text-lg text-ink-sub">＋</button>
      </div>
    </div>
  )
}
