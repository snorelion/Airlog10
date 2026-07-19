// LogTen Pro 내보내기(탭 구분 텍스트) 파서
// 실파일에서 확인된 함정:
//   * 인코딩이 UTF-16 LE (BOM FF FE) — File.text()로 읽으면 깨짐 → decodeLogbookFile 사용
//   * remarks/aircraft_notes 안의 줄바꿈이 레코드를 여러 줄로 쪼갬
//     → "YYYY-MM-DD\t"로 시작하는 줄만 새 레코드, 나머지는 앞 레코드에 이어붙임

import { hmToMin } from './time'

export type ParsedFlight = {
  flight_date: string
  flight_number: string | null
  origin: string | null
  destination: string | null
  out_time: string | null
  in_time: string | null
  aircraft_reg: string | null
  aircraft_type: string | null
  total_min: number
  pic_min: number
  sic_min: number
  picus_min: number
  night_min: number
  inst_actual_min: number
  inst_sim_min: number
  xc_min: number
  multi_pilot_min: number
  dual_received_min: number
  dual_given_min: number
  sim_min: number
  day_takeoffs: number
  day_landings: number
  night_takeoffs: number
  night_landings: number
  autolands: number
  go_arounds: number
  holds: number
  approaches: string[] | null
  capacity: string | null
  is_pf: boolean | null
  crew_pic: string | null
  crew_sic: string | null
  crew_other: string | null
  pax_count: number | null
  distance_nm: number | null
  remarks: string | null
  source: string
}

export type ParsedAircraft = {
  registration: string
  type_code: string | null
  make: string | null
  model: string | null
  notes: string | null
}

export type ParseResult = {
  flights: ParsedFlight[]
  aircraft: ParsedAircraft[]
  errors: string[]
}

// 업로드 파일 → 문자열 (UTF-16 LE/BE BOM, UTF-8 자동 감지)
export async function decodeLogbookFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buf)
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buf)
  }
  return new TextDecoder('utf-8').decode(buf)
}

const DATE_LINE = /^\d{4}-\d{2}-\d{2}\t/

// 기종 표기를 ICAO 코드로 통일 (한국 시절 표기 기준: B738/B739)
const TYPE_NORMALIZE: Record<string, string> = {
  '737-800': 'B738',
  '737-800, BBJ2': 'B738',
  '737-900': 'B739',
  '737-900ER': 'B739',
}
function normType(t: string | null): string | null {
  if (!t) return t
  return TYPE_NORMALIZE[t] ?? t
}

function clean(s: string | undefined): string {
  let t = (s ?? '').trim()
  // LogTen은 텍스트 필드를 따옴표로 감싼다: '"OE check"' → 'OE check', '""' → ''
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    t = t.slice(1, -1).replace(/""/g, '"').trim()
  }
  return t
}

function toInt(s: string | undefined): number {
  const n = parseInt(clean(s) || '0', 10)
  return isNaN(n) ? 0 : n
}

function textOrNull(s: string | undefined): string | null {
  const t = clean(s)
  return t && t !== '0' ? t : null
}

// "2013-06-09 14:20 +0000" / "14:20" / "0340" → "HH:MM" 추출
function timeOrNull(s: string | undefined): string | null {
  const t = clean(s)
  if (!t) return null
  const m = t.match(/(\d{1,2}):(\d{2})/)
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
  const m2 = t.match(/^(\d{2})(\d{2})$/)
  return m2 ? `${m2[1]}:${m2[2]}` : null
}

export function parseLogTen(text: string): ParseResult {
  const errors: string[] = []
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  if (!lines.length || !lines[0].includes('flight_flightDate')) {
    return { flights: [], aircraft: [], errors: ['LogTen 내보내기 형식이 아니에요. 첫 줄에 컬럼 이름(flight_flightDate…)이 있어야 해요.'] }
  }
  const header = lines[0].split('\t').map((h) => h.trim())
  const idx: Record<string, number> = {}
  header.forEach((h, i) => { idx[h] = i })

  // 줄바꿈으로 쪼개진 레코드 복원
  const records: string[] = []
  for (const line of lines.slice(1)) {
    if (DATE_LINE.test(line)) records.push(line)
    else if (records.length && line.trim()) records[records.length - 1] += ' ' + line
  }

  const col = (cells: string[], name: string): string => {
    const i = idx[name]
    return i === undefined ? '' : clean(cells[i])
  }

  const flights: ParsedFlight[] = []
  const acMap = new Map<string, ParsedAircraft>()

  for (const rec of records) {
    const c = rec.split('\t')
    const date = col(c, 'flight_flightDate')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`날짜를 읽을 수 없어 건너뜀: "${date}"`)
      continue
    }

    // capacity 판정
    let capacity: string | null = null
    if (col(c, 'flight_picCapacity') === '1') capacity = 'PIC'
    else if (col(c, 'flight_sicCapacity') === '1') capacity = 'SIC'
    else if (col(c, 'flight_underSupervisionCapacity') === '1') capacity = 'PICUS'
    else if (hmToMin(col(c, 'flight_dualReceived')) > 0) capacity = 'STUDENT'

    // 접근 (selectedApproach1~10)
    const approaches: string[] = []
    for (let i = 1; i <= 10; i++) {
      const a = col(c, `flight_selectedApproach${i}`)
      if (a && a !== '0') approaches.push(a)
    }

    // 기타 크루 (student/observer/relief/purser 묶음)
    const others: string[] = []
    const otherCols = [
      ['flight_selectedCrewStudent', 'STU'],
      ['flight_selectedCrewObserver', 'OBS'],
      ['flight_selectedCrewRelief', 'RLF'],
      ['flight_selectedCrewInstructor', 'INS'],
    ] as const
    for (const [name, tag] of otherCols) {
      const v = col(c, name)
      if (v) others.push(`${tag}:${v}`)
    }

    const reg = textOrNull(col(c, 'aircraft_aircraftID'))
    const typeCode = normType(textOrNull(col(c, 'aircraftType_type')))
    if (reg) {
      const prev = acMap.get(reg)
      const next: ParsedAircraft = {
        registration: reg,
        type_code: typeCode ?? prev?.type_code ?? null,
        make: textOrNull(col(c, 'aircraftType_make')) ?? prev?.make ?? null,
        model: textOrNull(col(c, 'aircraftType_model')) ?? prev?.model ?? null,
        notes: textOrNull(col(c, 'aircraft_notes')) ?? prev?.notes ?? null,
      }
      acMap.set(reg, next)
    }

    const pfRaw = col(c, 'flight_pilotFlyingCapacity')

    flights.push({
      flight_date: date,
      flight_number: textOrNull(col(c, 'flight_flightNumber')),
      origin: textOrNull(col(c, 'flight_from'))?.toUpperCase() ?? null,
      destination: textOrNull(col(c, 'flight_to'))?.toUpperCase() ?? null,
      out_time: timeOrNull(col(c, 'flight_actualDepartureTime')),
      in_time: timeOrNull(col(c, 'flight_actualArrivalTime')),
      aircraft_reg: reg,
      aircraft_type: typeCode,
      total_min: hmToMin(col(c, 'flight_totalTime')),
      pic_min: hmToMin(col(c, 'flight_pic')),
      sic_min: hmToMin(col(c, 'flight_sic')),
      picus_min: hmToMin(col(c, 'flight_p1us')),
      night_min: hmToMin(col(c, 'flight_night')),
      inst_actual_min: hmToMin(col(c, 'flight_actualInstrument')),
      inst_sim_min: hmToMin(col(c, 'flight_simulatedInstrument')),
      xc_min: hmToMin(col(c, 'flight_crossCountry')),
      multi_pilot_min: hmToMin(col(c, 'flight_multiPilot')),
      dual_received_min: hmToMin(col(c, 'flight_dualReceived')),
      dual_given_min: hmToMin(col(c, 'flight_dualGiven')),
      sim_min: hmToMin(col(c, 'flight_simulator')),
      day_takeoffs: toInt(col(c, 'flight_dayTakeoffs')),
      day_landings: toInt(col(c, 'flight_dayLandings')),
      night_takeoffs: toInt(col(c, 'flight_nightTakeoffs')),
      night_landings: toInt(col(c, 'flight_nightLandings')),
      autolands: toInt(col(c, 'flight_autolands')),
      go_arounds: toInt(col(c, 'flight_goArounds')),
      holds: toInt(col(c, 'flight_holds')),
      approaches: approaches.length ? approaches : null,
      capacity,
      is_pf: pfRaw === '' ? null : pfRaw === '1',
      crew_pic: textOrNull(col(c, 'flight_selectedCrewPIC')),
      crew_sic: textOrNull(col(c, 'flight_selectedCrewSIC')),
      crew_other: others.length ? others.join(', ') : null,
      pax_count: toInt(col(c, 'flight_paxCount')) || null,
      distance_nm: Math.round(parseFloat(col(c, 'flight_distance') || '0')) || null,
      remarks: textOrNull(col(c, 'flight_remarks')),
      source: 'logten',
    })
  }

  return { flights, aircraft: Array.from(acMap.values()), errors }
}

// ─────────────────────────────────────────────────────────────
// LogTen "Dynamic Export Flights (Tab)" 형식 — 사람이 읽는 컬럼 이름
// (Aircraft Type / Aircraft ID / Date / Flight # / From / To / Out / In …)
// 실파일 함정: Out·In이 "0340" 형식, Approach가 "1;ILS;19R;VTBS" 형식,
// remarks 줄바꿈으로 행이 쪼개짐(3번째 필드가 날짜인 줄만 새 레코드)
// ─────────────────────────────────────────────────────────────
export function parseDynamic(text: string): ParseResult {
  const errors: string[] = []
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const header = lines[0].split('\t').map((h) => h.trim())
  const idx: Record<string, number> = {}
  header.forEach((h, i) => { idx[h] = i })

  const records: string[][] = []
  for (const line of lines.slice(1)) {
    const c = line.split('\t')
    if (c.length > 2 && /^\d{4}-\d{2}-\d{2}$/.test(c[2].trim())) {
      records.push(c)
    } else if (records.length && line.trim()) {
      const last = records[records.length - 1]
      last[last.length - 1] = (last[last.length - 1] + ' ' + line).trim()
    }
  }

  const col = (cells: string[], name: string): string => {
    const i = idx[name]
    return i === undefined ? '' : clean(cells[i])
  }

  const flights: ParsedFlight[] = []
  const acMap = new Map<string, ParsedAircraft>()

  for (const c of records) {
    const date = col(c, 'Date')
    const picMin = hmToMin(col(c, 'PIC'))
    const sicMin = hmToMin(col(c, 'SIC'))
    const stuMin = hmToMin(col(c, 'STUDENT'))

    let capacity: string | null = null
    if (picMin > 0) capacity = 'PIC'
    else if (sicMin > 0) capacity = 'SIC'
    else if (stuMin > 0) capacity = 'STUDENT'

    // "1;ILS;19R;VTBS" → "ILS 19R VTBS"
    const apRaw = col(c, 'Approach 1')
    let approaches: string[] | null = null
    if (apRaw) {
      const parts = apRaw.split(';').map((p) => p.trim()).filter(Boolean)
      approaches = [parts.length >= 4 ? `${parts[1]} ${parts[2]} ${parts[3]}` : apRaw]
    }

    const others: string[] = []
    const otherCols = [
      ['Relief Crew', 'RLF'],
      ['Relief Crew 2', 'RLF2'],
      ['Student', 'STU'],
      ['Observer', 'OBS'],
      ['Purser', 'PUR'],
    ] as const
    for (const [name, tag] of otherCols) {
      const v = col(c, name)
      if (v) others.push(`${tag}:${v}`)
    }

    const reg = textOrNull(col(c, 'Aircraft ID'))
    const typeCode = normType(textOrNull(col(c, 'Aircraft Type')))
    if (reg && !acMap.has(reg)) {
      acMap.set(reg, { registration: reg, type_code: typeCode, make: null, model: null, notes: null })
    }

    const pfRaw = col(c, 'Pilot Flying')

    flights.push({
      flight_date: date,
      flight_number: textOrNull(col(c, 'Flight #')),
      origin: textOrNull(col(c, 'From'))?.toUpperCase() ?? null,
      destination: textOrNull(col(c, 'To'))?.toUpperCase() ?? null,
      out_time: timeOrNull(col(c, 'Out')),
      in_time: timeOrNull(col(c, 'In')),
      aircraft_reg: reg,
      aircraft_type: typeCode,
      total_min: hmToMin(col(c, 'Total Time')),
      pic_min: picMin,
      sic_min: sicMin,
      picus_min: 0,
      night_min: hmToMin(col(c, 'Night')),
      inst_actual_min: hmToMin(col(c, 'Actual Inst')),
      inst_sim_min: 0,
      xc_min: 0,
      multi_pilot_min: hmToMin(col(c, 'Total Time')),
      dual_received_min: stuMin,
      dual_given_min: 0,
      sim_min: 0,
      day_takeoffs: toInt(col(c, 'Day T/O')),
      day_landings: toInt(col(c, 'Day Ldg')),
      night_takeoffs: toInt(col(c, 'Night T/O')),
      night_landings: toInt(col(c, 'Night Ldg')),
      autolands: toInt(col(c, 'Autolands')),
      go_arounds: toInt(col(c, 'Go Arounds')),
      holds: 0,
      approaches,
      capacity,
      is_pf: pfRaw === '' ? null : pfRaw === '1',
      crew_pic: textOrNull(col(c, 'PIC/P1 Crew')),
      crew_sic: textOrNull(col(c, 'SIC/P2 Crew')),
      crew_other: others.length ? others.join(', ') : null,
      pax_count: null,
      distance_nm: null,
      remarks: textOrNull(col(c, 'Remarks')),
      source: 'logten',
    })
  }

  return { flights, aircraft: Array.from(acMap.values()), errors }
}

// 형식 자동 감지 — 임포트 화면은 이 함수 하나만 쓰면 됨
export function parseLogbook(text: string): ParseResult {
  const head = text.slice(0, 3000)
  if (head.includes('flight_flightDate')) return parseLogTen(text)
  if (head.includes('Aircraft ID') && head.includes('Total Time') && head.includes('Date')) {
    return parseDynamic(text)
  }
  return {
    flights: [],
    aircraft: [],
    errors: ['알아볼 수 없는 형식이에요. LogTen 내보내기(.txt) 또는 Dynamic Export 파일을 올려주세요. 다른 앱 파일이면 그대로 Claude에게 보내주세요 — 형식을 추가할게요.'],
  }
}
