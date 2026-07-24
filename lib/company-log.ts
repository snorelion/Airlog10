// Thai Lion Air 회사 로그북(PilotLogBookReport, 확장자는 .csv지만 실제는 .xlsx) 파서
//
// 회사 파일 컬럼 (20개):
//   Id, Name, Date, DepPlace, DepTime, ArrPlace, ArrTime, ACType, Reg, FltTime,
//   PicName, TKoffsDay, TKoffsNight, LandsDay, LandsNight, PIC, CoPlt, Instr, SimTime, SimType
//
// 실파일에서 확인된 것:
//   * Date는 DD/MM/YY (01/06/26 = 2026-06-01)
//   * 공항은 IATA (DMK) — ICAO 변환은 호출자가 airports 테이블로 넘겨줌
//   * 편명(Flight #)이 아예 없음 → 같은 날 같은 구간 왕복 2회가 흔함.
//     중복 판정 키에 반드시 출발시각을 포함해야 한다.
//   * FltTime은 블록타임(ArrTime-DepTime). 공중시간 컬럼이 없음
//     → 보정: 이륙 = OUT+10분, 착륙 = IN-5분, flight_min = 블록-15분
//   * 야간 비행"시간" 컬럼이 없음 (야간 이착륙 여부만 있음)
//     → A안: 태국 야간 19:00~06:00(= UTC 12:00~23:00)과 블록시간의 겹침으로 계산
//   * 계기시간(instrument)·접근(approach) 컬럼은 회사 파일에 존재하지 않음 → 빈칸
//   * SimTime/SimType 행은 Reg·FltTime이 비어 있음 (시뮬 세션)
//     → sim_min에만 넣고 비행시간에는 미포함. 시뮬 이착륙은 실비행 currency를
//       오염시키므로 이착륙 칸에 넣지 않고 비고에 남긴다.

import { hmToMin } from './time'
import type { ParsedFlight, ParsedAircraft, ParseResult } from './logten'

export const COMPANY_COLUMNS = [
  'Id', 'Name', 'Date', 'DepPlace', 'DepTime', 'ArrPlace', 'ArrTime', 'ACType', 'Reg', 'FltTime',
  'PicName', 'TKoffsDay', 'TKoffsNight', 'LandsDay', 'LandsNight', 'PIC', 'CoPlt', 'Instr', 'SimTime', 'SimType',
]

// 회사 기종 코드 → 앱 표준 표기.
// T79A/T79X는 HS-LVO·HS-LVP 두 대뿐이고 T739와 같은 HS-LV* 대역 (실데이터로 확인).
const TYPE_MAP: Record<string, string> = {
  T738: 'B737-800',
  T739: 'B737-900',
  T79A: 'B737-900',
  T79X: 'B737-900',
}

// 태국 야간(19:00~06:00)을 UTC로: 12:00 ~ 23:00
const NIGHT_FROM = 12 * 60
const NIGHT_TO = 23 * 60

// 블록타임에서 빼는 지상 활주 시간 (이륙 +10분, 착륙 -5분)
const TAXI_OUT_MIN = 10
const TAXI_IN_MIN = 5

// 첫 줄이 회사 리포트 헤더인지
export function isCompanyLog(header: string[]): boolean {
  const h = header.map((s) => s.trim())
  return h.includes('DepPlace') && h.includes('FltTime') && h.includes('ACType')
}

// "01/06/26" (DD/MM/YY) → "2026-06-01"
function toISODate(s: string): string | null {
  const t = s.trim()
  // 이미 ISO면 그대로
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (!m) return null
  const dd = m[1].padStart(2, '0')
  const mm = m[2].padStart(2, '0')
  let yy = m[3]
  if (yy.length === 2) yy = parseInt(yy, 10) < 70 ? `20${yy}` : `19${yy}`
  if (parseInt(mm, 10) > 12 || parseInt(dd, 10) > 31) return null
  return `${yy}-${mm}-${dd}`
}

// "02:30" → 150 (자정부터의 분). 못 읽으면 null
function toMinOfDay(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mi = parseInt(m[2], 10)
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

function hhmm(minOfDay: number): string {
  const m = ((minOfDay % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function overlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
}

// 블록 구간과 야간창(UTC 12:00~23:00)의 겹침 = 야간시간.
// 자정을 넘기는 비행도 있으므로 앞뒤 날의 야간창까지 3개를 본다.
export function nightMinutes(outMin: number, inMin: number): number {
  const end = inMin < outMin ? inMin + 1440 : inMin
  let n = 0
  for (const shift of [-1440, 0, 1440]) {
    n += overlap(outMin, end, NIGHT_FROM + shift, NIGHT_TO + shift)
  }
  return Math.min(n, end - outMin)
}

function toInt(s: string): number {
  const n = parseInt(s.trim(), 10)
  return isNaN(n) ? 0 : n
}

export type CompanyParseOptions = {
  // IATA(DMK) → ICAO(VTBD). 호출자가 airports 테이블에서 만들어 넘긴다.
  iataToIcao?: Record<string, string>
}

// rows[0] = 헤더, 나머지 = 데이터. 셀은 전부 문자열로 정규화되어 들어온다.
export function parseCompanyLog(rows: string[][], opts: CompanyParseOptions = {}): ParseResult {
  const errors: string[] = []
  const warnings: string[] = []
  const iataMap = opts.iataToIcao ?? {}

  if (!rows.length) {
    return { flights: [], aircraft: [], errors: ['빈 파일이에요.'] }
  }
  const header = rows[0].map((s) => (s ?? '').trim())
  if (!isCompanyLog(header)) {
    return {
      flights: [],
      aircraft: [],
      errors: ['회사 로그북 형식이 아니에요. 첫 줄에 Date·DepPlace·FltTime 같은 컬럼 이름이 있어야 해요.'],
    }
  }
  const idx: Record<string, number> = {}
  header.forEach((h, i) => { if (idx[h] === undefined) idx[h] = i })
  const col = (cells: string[], name: string): string => {
    const i = idx[name]
    return i === undefined ? '' : (cells[i] ?? '').trim()
  }

  const flights: ParsedFlight[] = []
  const acMap = new Map<string, ParsedAircraft>()
  const seen = new Set<string>()          // 파일 안 중복 (2025년이 두 파일에 겹쳐 있음)
  const unknownTypes = new Set<string>()
  const unknownAirports = new Set<string>()
  let simCount = 0
  let dupInFile = 0

  for (let r = 1; r < rows.length; r++) {
    const c = rows[r]
    if (!c || c.every((v) => !(v ?? '').trim())) continue

    const rawDate = col(c, 'Date')
    const date = toISODate(rawDate)
    if (!date) {
      errors.push(`${r + 1}번째 줄: 날짜를 읽을 수 없어 건너뜀 ("${rawDate}")`)
      continue
    }

    // 기종
    const rawType = col(c, 'ACType')
    let type: string | null = null
    if (rawType) {
      type = TYPE_MAP[rawType.toUpperCase()] ?? rawType
      if (!TYPE_MAP[rawType.toUpperCase()]) unknownTypes.add(rawType)
    }

    // 공항 IATA → ICAO (못 찾으면 원문 유지)
    const toIcao = (v: string): string | null => {
      const t = v.trim().toUpperCase()
      if (!t) return null
      if (t.length === 4 && !iataMap[t]) return t   // 이미 ICAO
      const icao = iataMap[t]
      if (!icao) { unknownAirports.add(t); return t }
      return icao
    }
    const origin = toIcao(col(c, 'DepPlace'))
    const destination = toIcao(col(c, 'ArrPlace'))

    const outMin = toMinOfDay(col(c, 'DepTime'))
    const inMin = toMinOfDay(col(c, 'ArrTime'))
    const outTime = outMin === null ? null : hhmm(outMin)
    const inTime = inMin === null ? null : hhmm(inMin)

    const simMin = hmToMin(col(c, 'SimTime'))
    const blockMin = hmToMin(col(c, 'FltTime'))
    const reg = col(c, 'Reg').toUpperCase() || null

    const dayTO = toInt(col(c, 'TKoffsDay'))
    const nightTO = toInt(col(c, 'TKoffsNight'))
    const dayLdg = toInt(col(c, 'LandsDay'))
    const nightLdg = toInt(col(c, 'LandsNight'))

    const picName = col(c, 'PicName')
    const isSelfPic = /^self$/i.test(picName)
    const picMin = hmToMin(col(c, 'PIC'))
    const sicMin = hmToMin(col(c, 'CoPlt'))
    const instrMin = hmToMin(col(c, 'Instr'))   // 교관시간 (라이언님 파일엔 전부 빈칸)

    // ── 시뮬 세션 행 (Reg·FltTime 없이 SimTime만) ──
    if (simMin > 0 && blockMin === 0) {
      const simKey = `SIM|${date}|${outTime ?? ''}|${col(c, 'SimType')}`
      if (seen.has(simKey)) { dupInFile++; continue }
      seen.add(simKey)
      simCount++
      const kind = col(c, 'SimType') || 'SIM'
      const marks: string[] = [`시뮬 세션 (${kind})`]
      if (dayTO + nightTO > 0) marks.push(`T/O ${dayTO + nightTO}`)
      if (dayLdg + nightLdg > 0) marks.push(`LDG ${dayLdg + nightLdg}`)
      flights.push({
        ...blankFlight(),
        flight_date: date,
        origin, destination,
        out_time: outTime, in_time: inTime,
        aircraft_type: type,
        sim_min: simMin,
        dual_given_min: instrMin,
        capacity: instrMin > 0 ? 'INSTRUCTOR' : null,
        crew_pic: isSelfPic ? null : (picName || null),
        remarks: marks.join(' · '),
        source: 'lionair',
      })
      continue
    }

    // ── 일반 비행 행 ──
    const key = `${date}|${outTime ?? ''}|${origin ?? ''}|${destination ?? ''}`
    if (seen.has(key)) { dupInFile++; continue }
    seen.add(key)

    if (reg) {
      const prev = acMap.get(reg)
      acMap.set(reg, {
        registration: reg,
        type_code: type ?? prev?.type_code ?? null,
        make: prev?.make ?? null,
        model: prev?.model ?? null,
        notes: prev?.notes ?? null,
      })
    }

    // 공중시간 = 블록 - 15분 (이륙 OUT+10, 착륙 IN-5)
    const flightMin = Math.max(0, blockMin - TAXI_OUT_MIN - TAXI_IN_MIN)
    const nightMin = outMin !== null && inMin !== null ? nightMinutes(outMin, inMin) : 0

    let capacity: string | null = null
    if (instrMin > 0) capacity = 'INSTRUCTOR'
    else if (picMin > 0) capacity = 'PIC'
    else if (sicMin > 0) capacity = 'SIC'

    flights.push({
      ...blankFlight(),
      flight_date: date,
      flight_number: null,              // 회사 파일에 편명 컬럼이 없음
      origin, destination,
      out_time: outTime, in_time: inTime,
      aircraft_reg: reg,
      aircraft_type: type,
      total_min: blockMin,              // 블록
      flight_min: flightMin,            // 공중 (추정)
      pic_min: picMin,
      sic_min: sicMin,
      night_min: Math.min(nightMin, blockMin || nightMin),
      multi_pilot_min: blockMin,        // 737 2인 운항
      dual_given_min: instrMin,
      day_takeoffs: dayTO,
      night_takeoffs: nightTO,
      day_landings: dayLdg,
      night_landings: nightLdg,
      capacity,
      crew_pic: isSelfPic ? null : (picName || null),
      source: 'lionair',
    })
  }

  if (unknownTypes.size) {
    warnings.push(
      `처음 보는 기종 코드: ${Array.from(unknownTypes).join(', ')} — 코드 그대로 저장했어요. 알려주시면 정식 기종명으로 바꿔드릴게요.`
    )
  }
  if (unknownAirports.size) {
    const list = Array.from(unknownAirports)
    warnings.push(
      `공항 코드 ${list.length}개는 ICAO로 못 바꿔서 그대로 뒀어요: ${list.slice(0, 10).join(', ')}${list.length > 10 ? ' 외' : ''}`
    )
  }
  if (dupInFile) {
    warnings.push(`파일 안에서 똑같은 기록 ${dupInFile}편이 중복돼 있어 한 번만 남겼어요.`)
  }

  const notes = [
    '회사 파일엔 공중시간이 없어 블록시간에서 15분을 뺀 값으로 추정했어요 (이륙 = OUT+10분, 착륙 = IN−5분).',
    '야간시간도 컬럼이 없어 태국 기준 야간(19:00~06:00)과 겹치는 만큼으로 계산했어요.',
    '계기시간·접근(approach)은 회사 파일에 아예 없어서 빈칸이에요 — 앱에서 직접 채우시면 돼요.',
  ]
  if (simCount) notes.push(`시뮬 ${simCount}건은 시뮬시간으로만 넣고 비행시간에는 넣지 않았어요.`)

  return { flights, aircraft: Array.from(acMap.values()), errors, warnings, notes }
}

// ParsedFlight의 기본값 (필수 필드가 많아 한곳에 모아둠)
function blankFlight(): ParsedFlight {
  return {
    flight_date: '',
    flight_number: null,
    origin: null,
    destination: null,
    out_time: null,
    in_time: null,
    aircraft_reg: null,
    aircraft_type: null,
    total_min: 0,
    pic_min: 0,
    sic_min: 0,
    picus_min: 0,
    night_min: 0,
    inst_actual_min: 0,
    inst_sim_min: 0,
    xc_min: 0,
    multi_pilot_min: 0,
    dual_received_min: 0,
    dual_given_min: 0,
    sim_min: 0,
    day_takeoffs: 0,
    day_landings: 0,
    night_takeoffs: 0,
    night_landings: 0,
    autolands: 0,
    go_arounds: 0,
    holds: 0,
    approaches: null,
    capacity: null,
    is_pf: null,
    crew_pic: null,
    crew_sic: null,
    crew_other: null,
    pax_count: null,
    distance_nm: null,
    remarks: null,
    source: 'lionair',
  }
}
