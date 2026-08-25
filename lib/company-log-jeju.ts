// 제주항공(Jeju Air) 회사 비행기록(flightHistory) 엑셀 파서
//
// 실파일(flightHistory_2026.xlsx — 2026년 121편, 기장)로 확인된 구조.
// 첫 줄 헤더 19컬럼 (camelCase가 이 양식의 지문):
//   rowNo, acType, fltDat, fltTime, fltNo, fltAcNo, fclEmpId, fclEmpNam, fclEmpCls,
//   order1, dutyCode, stFr, stTo, at, bt, ntTme, instTme, toCnt, ldCnt
//
// 실측으로 확정한 해석 규칙:
//   * fltDat(YYYYMMDD)·fltTime(HHMM)은 **UTC 출발시각**이다.
//     (7C1615 ICN→HIJ 실제 출발 07:55 KST = 22:55Z — 파일 값 2254와 일치.
//      KST로 읽으면 히로시마 심야 도착이 되어 공항 운영시간과 모순.
//      STD가 아니라 실제 OUT으로 보인다 — 7C1616 STD 01:20Z에 파일 값 01:38)
//   * 도착시각 컬럼이 없다 → in = out + bt (Air Canada 파서와 같은 방식)
//   * at=공중시간, bt=블록타임. 비행시간 = bt 그대로 — 회사 로그북이 공식 기록이라
//     시간을 만들어내지 않는다 (Lion·KAL과 같은 정책). at는 넣을 칸이 없어 저장 안 함.
//   * ntTme(야간)·instTme(계기)는 회사가 계산해 둔 값 그대로 가져온다
//     (실측: ntTme가 at 아닌 bt와 같은 행이 있다 — 야간도 블록 기준)
//   * toCnt/ldCnt는 Y/'-' (그 레그에서 이륙/착륙을 수행했는가) → 횟수 1/0.
//     주간/야간 구분이 파일에 없어 주간 칸에 넣는다 (KAL과 같은 정책, note로 안내)
//   * fclEmpCls(기장/부기장)가 곧 본인 직책 — 본인 비행기록 파일이라 매 행이 본인
//     → 기장=PIC, 부기장=SIC. 이름 컬럼(fclEmpNam)도 본인이므로 crew에 넣지 않는다.
//   * dutyCode: C(일반) · 3NC/3PC(증원 편조) · C1/C2 · EX — C가 아니면 비고에 남긴다

import { hmToMin } from './time'
import { blankFlight } from './company-log'
import type { ParsedAircraft, ParseResult } from './logten'

// 제주 기종 코드 → 앱 표준 표기 (실파일에서 확인된 두 종)
const JEJU_TYPE_MAP: Record<string, string> = {
  '738': 'B737-800',
  '7M8': 'B737-8', // 737 MAX 8의 보잉 공식 표기
}

// 첫 줄이 제주 비행기록 헤더인지 — camelCase 컬럼명이라 다른 양식과 겹치지 않는다
export function isJejuCompanyLog(header: string[]): boolean {
  const h = header.map((s) => (s ?? '').trim())
  return h.includes('fltDat') && h.includes('stFr') && h.includes('stTo')
}

// '20260103' 또는 '2026-01-03'(엑셀 날짜 셀) → '2026-01-03'
function toISODate(s: string): string | null {
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (!m) return null
  if (parseInt(m[2], 10) > 12 || parseInt(m[3], 10) > 31) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

// '2254' · '807'(숫자 셀이라 앞 0이 떨어진 것) · '22:54'(시각 셀) → 'HH:MM'
function toHHMM(s: string): string | null {
  const t = s.trim()
  const m = t.match(/^(\d{1,2}):(\d{2})$/)
  const digits = m ? m[1].padStart(2, '0') + m[2] : t.replace(/\D/g, '').padStart(4, '0')
  if (!/^\d{4}$/.test(digits)) return null
  const h = parseInt(digits.slice(0, 2), 10)
  const mi = parseInt(digits.slice(2), 10)
  if (h > 23 || mi > 59) return null
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function minToHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

const isYes = (v: string) => /^y/i.test(v.trim())

export type JejuParseOptions = {
  // IATA(ICN) → ICAO(RKSI). 호출자가 airports 테이블에서 만들어 넘긴다 (Lion과 동일)
  iataToIcao?: Record<string, string>
}

// rows[0] = 헤더, 나머지 = 데이터. 셀은 전부 문자열로 정규화되어 들어온다.
export function parseJejuCompanyLog(rows: string[][], opts: JejuParseOptions = {}): ParseResult {
  const errors: string[] = []
  const warnings: string[] = []
  const iataMap = opts.iataToIcao ?? {}

  const header = (rows[0] ?? []).map((s) => (s ?? '').trim())
  const idx: Record<string, number> = {}
  header.forEach((h, i) => { if (idx[h] === undefined) idx[h] = i })
  const col = (cells: string[], name: string): string => {
    const i = idx[name]
    return i === undefined ? '' : (cells[i] ?? '').trim()
  }

  const flights: ParseResult['flights'] = []
  const acMap = new Map<string, ParsedAircraft>()
  const seen = new Set<string>() // 파일 안 중복 방어 (연도 파일이 겹쳐 합쳐진 경우)
  const unknownTypes = new Set<string>()
  const unknownAirports = new Set<string>()
  const unknownRanks = new Set<string>()
  let dupInFile = 0

  const toIcao = (v: string): string | null => {
    const t = v.trim().toUpperCase()
    if (!t) return null
    if (t.length === 4 && !iataMap[t]) return t // 이미 ICAO
    const icao = iataMap[t]
    if (!icao) { unknownAirports.add(t); return t }
    return icao
  }

  for (let r = 1; r < rows.length; r++) {
    const c = rows[r]
    if (!c || c.every((v) => !(v ?? '').trim())) continue

    const rawDate = col(c, 'fltDat')
    const date = toISODate(rawDate)
    if (!date) {
      errors.push(`Row ${r + 1}: skipped — couldn't read the date ("${rawDate}")`)
      continue
    }

    const outTime = toHHMM(col(c, 'fltTime'))
    const blockMin = hmToMin(col(c, 'bt'))
    const inTime = outTime !== null && blockMin > 0 ? minToHHMM(hmToMin(outTime) + blockMin) : null
    const nightMin = hmToMin(col(c, 'ntTme'))
    const instMin = hmToMin(col(c, 'instTme'))

    const reg = col(c, 'fltAcNo').toUpperCase() || null
    const rawType = col(c, 'acType')
    let type: string | null = null
    if (rawType) {
      type = JEJU_TYPE_MAP[rawType.toUpperCase()] ?? rawType
      if (!JEJU_TYPE_MAP[rawType.toUpperCase()]) unknownTypes.add(rawType)
    }

    const origin = toIcao(col(c, 'stFr'))
    const destination = toIcao(col(c, 'stTo'))

    const key = `${date}|${outTime ?? ''}|${origin ?? ''}|${destination ?? ''}`
    if (seen.has(key)) { dupInFile++; continue }
    seen.add(key)

    // 직책 → 역할. '부기장'이 '기장'을 포함하므로 부기장을 먼저 본다
    const rank = col(c, 'fclEmpCls').replace(/\s+/g, '')
    const capacity = rank.includes('부기장') ? 'SIC' : rank.includes('기장') ? 'PIC' : null
    if (!capacity && rank) unknownRanks.add(rank)

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

    const duty = col(c, 'dutyCode').toUpperCase()

    flights.push({
      ...blankFlight(),
      flight_date: date,
      flight_number: col(c, 'fltNo').toUpperCase() || null,
      origin,
      destination,
      out_time: outTime,
      in_time: inTime,
      aircraft_reg: reg,
      aircraft_type: type,
      total_min: blockMin,
      flight_min: blockMin, // 회사 bt 그대로 (공식 기록, 보정 없음)
      pic_min: capacity === 'PIC' ? blockMin : 0,
      sic_min: capacity === 'SIC' ? blockMin : 0,
      night_min: Math.min(nightMin, blockMin || nightMin),
      inst_actual_min: instMin,
      multi_pilot_min: blockMin, // 737 2인 운항
      day_takeoffs: isYes(col(c, 'toCnt')) ? 1 : 0,
      day_landings: isYes(col(c, 'ldCnt')) ? 1 : 0,
      capacity,
      remarks: duty && duty !== 'C' ? `Duty ${duty}` : null,
      source: 'jejuair',
    })
  }

  if (unknownTypes.size) {
    warnings.push(`Unfamiliar aircraft type codes kept as-is: ${Array.from(unknownTypes).join(', ')}`)
  }
  if (unknownAirports.size) {
    const list = Array.from(unknownAirports)
    warnings.push(
      `${list.length} airport code(s) couldn't be matched to ICAO and were kept as-is: ${list.slice(0, 10).join(', ')}${list.length > 10 ? '…' : ''}`
    )
  }
  if (unknownRanks.size) {
    warnings.push(`Unknown crew class (${Array.from(unknownRanks).join(', ')}) — capacity (PIC/SIC) left blank for those rows.`)
  }
  if (dupInFile) warnings.push(`Skipped ${dupInFile} duplicate rows in the file.`)

  if (!flights.length) {
    errors.push('No flight rows found. Please upload the flight history Excel from the company system as-is.')
  }

  return {
    flights,
    aircraft: Array.from(acMap.values()),
    errors,
    warnings: warnings.length ? warnings : undefined,
    notes: [
      'Read as a Jeju Air flight history — dates and departure times are UTC, exactly as recorded.',
      'Arrival time = departure + block time (the file has no arrival column).',
      'Flight time = company block time (bt); night and instrument times are imported as-is.',
      "Day/night split for takeoffs and landings isn't in the file — counts went into the day columns.",
    ],
  }
}
