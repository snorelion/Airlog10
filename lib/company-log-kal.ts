// 대한항공(Korean Air) "Flight Log Report" PDF 파서
//
// 실파일(2026-02, 지병윤 FO 747)로 확인된 구조:
//   헤더: "Flight Log Report  <이름> | <사번> | <기종한정> | <직책(FO/CA)>"
//   행:   Flight Date | HL No | A/C | FLT No | DEP | ARR | Duty Code |
//         RO(GMT) | RI(GMT) | BT | Company Time | Molit Time | Night |
//         T/O | L/D | A/L | INST
//
// 실측으로 확정한 해석 규칙:
//   * 날짜 컬럼은 라벨이 "(SLT)"지만 실제 값은 GMT(UTC) 날짜다.
//     (KE9204: 날짜 2/9 · RO 01:31 GMT · 야간 13:35 전구간 — LA 현지 2/8 저녁
//      출발이어야만 성립 → 컬럼 값 = GMT 날짜. 로그북 표준(UTC 날짜)과 일치)
//   * RO/RI는 GMT라 시간대 변환이 아예 없다 → out/in 그대로
//   * BT = 블록타임. 시간은 회사 값 그대로, 추정 보정 없음 (Lion과 같은 정책)
//   * Night·INST는 회사가 계산한 시간이 그대로 있다 → 그대로 가져온다
//   * T/O·L/D는 Y/N (그 레그에서 이륙/착륙을 수행했는가) → 횟수 1/0
//     주간/야간 구분은 파일에 없어 주간 칸에 넣는다 (warning으로 안내)
//   * A/L(오토랜드 여부)·Company/Molit Time(증원운항 분할 시간)은 저장하지 않는다
//   * 공항은 IATA (ICN/LAX) — ICAO 변환은 호출자가 airports 테이블로 넘겨줌

import { getDocumentProxy } from 'unpdf'
import { blankFlight } from './company-log'
import type { ParseResult, ParsedAircraft } from './logten'

export type KalRow = {
  date: string          // 'YYYY-MM-DD' (GMT 날짜)
  reg: string           // HL7638
  typeCode: string      // 74I
  fltNo: string         // KE011
  dep: string           // IATA
  arr: string
  ro: string | null     // 'HH:MM' GMT
  ri: string | null
  blockMin: number
  nightMin: number
  instMin: number
  tkoff: boolean
  landing: boolean
  dutyCode: string | null
}

export type KalExtract = {
  rows: KalRow[]
  pilotName: string | null
  pilotId: string | null
  rank: string | null    // FO / CA …
  errors: string[]       // 못 읽은 줄 (날짜로 시작하는데 형식이 안 맞는 것)
}

// 대한항공 기종 코드 → 표준 표기 (실파일 등록번호로 확인된 것만).
// 모르는 코드는 원문 그대로 두고 warning으로 알린다.
const KAL_TYPE_MAP: Record<string, string> = {
  '74I': 'B747-8I',
  '74N': 'B747-8F',
  '74F': 'B747-400F',
  '772': 'B777-200ER',
  '773': 'B777-300',
  '77W': 'B777-300ER',
  '789': 'B787-9',
  '78X': 'B787-10',
  '333': 'A330-300',
  '332': 'A330-200',
  '359': 'A350-900',
  '388': 'A380-800',
  '739': 'B737-900',
  '73J': 'B737-900ER',
  '738': 'B737-800',
  '223': 'A220-300',
}

const ROW_RE = /^(\d{4}-\d{2}-\d{2})\s+(HL\d{4})\s+(\S{2,4})\s+(KE\d{2,4}[A-Z]?)\s+([A-Z]{3})\s+([A-Z]{3})\s+(.*)$/
const PILOT_RE = /Flight Log Report\s+(.+?)\s*\|\s*(\d+)\s*\|\s*\S+\s*\|\s*(\S+)/

function hmToMinLocal(s: string): number {
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return 0
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

/** PDF → 대한항공 로그 행. 이 형식이 아니면 null (자동 감지용). */
export async function kalExtract(data: Uint8Array): Promise<KalExtract | null> {
  const pdf = await getDocumentProxy(data)

  // 글자 좌표를 읽어 y로 줄을 묶는다 (Lion PDF 파서와 같은 방식)
  const allLines: string[] = []
  let fullText = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const items: { x: number; y: number; t: string }[] = []
    for (const raw of tc.items as { str?: string; transform?: number[] }[]) {
      const t = (raw.str ?? '').replace(/\u200B/g, '').trim()
      if (t && raw.transform) items.push({ t, x: raw.transform[4], y: raw.transform[5] })
    }
    items.sort((a, b) => (Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x))
    let cur: { y: number; parts: string[] } | null = null
    for (const it of items) {
      if (cur && Math.abs(cur.y - it.y) <= 2) cur.parts.push(it.t)
      else {
        if (cur) allLines.push(cur.parts.join(' '))
        cur = { y: it.y, parts: [it.t] }
      }
    }
    if (cur) allLines.push(cur.parts.join(' '))
  }
  fullText = allLines.join('\n')

  if (!fullText.includes('Flight Log Report')) return null

  const ex: KalExtract = { rows: [], pilotName: null, pilotId: null, rank: null, errors: [] }
  // 헤더 줄이 추출 과정에서 쪼개져도 "이름 | 사번 | 기종 | 직책" 패턴은 찾도록 폴백
  const pm = fullText.match(PILOT_RE)
    ?? fullText.match(/([A-Z][A-Z .'-]+?)\s*\|\s*(\d{5,})\s*\|\s*\S+\s*\|\s*([A-Z]{2,4})/)
  if (pm) {
    ex.pilotName = pm[1].trim()
    ex.pilotId = pm[2]
    ex.rank = pm[3].toUpperCase()
  }

  for (const line of allLines) {
    const m = line.trim().match(ROW_RE)
    if (!m) continue
    const [, date, reg, typeCode, fltNo, dep, arr, restRaw] = m
    let rest = restRaw.trim()

    // Duty Code — 표 순서상 ARR 뒤에 오지만, 추출 순서에 따라 줄 끝에 붙기도 한다
    let dutyCode: string | null = null
    const lead = rest.match(/^([A-Z]{1,4})\s+/)
    if (lead && !/^\d/.test(lead[1])) {
      dutyCode = lead[1]
      rest = rest.slice(lead[0].length)
    }

    // 시각 7개: RO RI BT Company Molit Night ... INST
    // (이터레이터 스프레드 [...matchAll]은 이 tsconfig에서 빌드가 깨진다 — Array.from)
    const times = Array.from(rest.matchAll(/\d{1,2}:\d{2}/g))
    if (times.length < 7) {
      ex.errors.push(line.trim())
      continue
    }
    const val = (i: number) => times[i][0]
    const last = times[times.length - 1]

    // T/O·L/D 플래그: Night 시각과 INST 시각 사이의 Y/N
    const between = rest.slice((times[5].index ?? 0) + times[5][0].length, last.index ?? rest.length)
    const yn = between.match(/[YN]/g) ?? []

    // 줄 끝에 붙은 duty code (앞에서 못 찾은 경우): "…05:00F" / "…09:50EX"
    if (!dutyCode) {
      const trail = rest.slice((last.index ?? 0) + last[0].length).match(/([A-Z]{1,4})\s*$/)
      if (trail) dutyCode = trail[1]
    }

    ex.rows.push({
      date, reg, typeCode, fltNo, dep, arr,
      ro: val(0), ri: val(1),
      blockMin: hmToMinLocal(val(2)),
      nightMin: hmToMinLocal(val(5)),
      instMin: hmToMinLocal(last[0]),
      tkoff: yn[0] === 'Y',
      landing: yn[1] === 'Y',
      dutyCode,
    })
  }
  return ex
}

/** 추출된 행 → 저장용 비행 목록. iataToIcao는 호출자가 airports 테이블에서 만든다. */
export function kalBuildFlights(ex: KalExtract, iataToIcao: Record<string, string>): ParseResult {
  const flights: ParseResult['flights'] = []
  const acMap = new Map<string, ParsedAircraft>()
  const warnings: string[] = []
  const unknownTypes = new Set<string>()
  const seen = new Set<string>()
  let dupInFile = 0

  // 직책 → 역할 (헤더의 FO/CA). 모르면 비워두고 알린다
  const rank = ex.rank ?? ''
  const capacity = /^(CA|CPT|CAPT)/.test(rank) ? 'PIC' : rank.startsWith('FO') ? 'SIC' : null
  if (!capacity) {
    warnings.push(rank
      ? `직책 '${rank}'을 몰라 역할(PIC/SIC)을 비워뒀어요.`
      : '헤더에서 직책(FO/CA)을 찾지 못해 역할을 비워뒀어요 — 필요하면 저장 후 일괄 수정하세요.')
  }

  for (const r of ex.rows) {
    const key = `${r.date}|${r.ro ?? ''}|${r.dep}|${r.arr}`
    if (seen.has(key)) { dupInFile++; continue }
    seen.add(key)

    const type = KAL_TYPE_MAP[r.typeCode.toUpperCase()]
    if (!type) unknownTypes.add(r.typeCode)

    acMap.set(r.reg, {
      registration: r.reg,
      type_code: type ?? r.typeCode,
      make: null, model: null, notes: null,
    })

    flights.push({
      ...blankFlight(),
      flight_date: r.date,
      flight_number: r.fltNo,
      origin: iataToIcao[r.dep] ?? r.dep,
      destination: iataToIcao[r.arr] ?? r.arr,
      out_time: r.ro,
      in_time: r.ri,
      aircraft_reg: r.reg,
      aircraft_type: type ?? r.typeCode,
      total_min: r.blockMin,
      flight_min: r.blockMin,                              // 회사 값 그대로 (공중시간 컬럼 없음)
      pic_min: capacity === 'PIC' ? r.blockMin : 0,
      sic_min: capacity === 'SIC' ? r.blockMin : 0,
      night_min: Math.min(r.nightMin, r.blockMin || r.nightMin),
      inst_actual_min: r.instMin,
      multi_pilot_min: r.blockMin,
      day_takeoffs: r.tkoff ? 1 : 0,
      day_landings: r.landing ? 1 : 0,
      capacity,
      remarks: r.dutyCode ? `Duty ${r.dutyCode}` : null,
      source: 'koreanair',
    })
  }

  if (unknownTypes.size) {
    warnings.push(`처음 보는 기종 코드가 있어 원문 그대로 뒀어요: ${Array.from(unknownTypes).join(', ')}`)
  }
  if (dupInFile) warnings.push(`파일 안 중복 ${dupInFile}건은 건너뛰었어요.`)
  if (ex.errors.length) warnings.push(`형식이 달라 못 읽은 줄 ${ex.errors.length}개를 건너뛰었어요.`)

  return {
    flights,
    aircraft: Array.from(acMap.values()),
    errors: flights.length ? [] : ['비행 줄을 찾지 못했어요. 회사 시스템의 Flight Log Report PDF 그대로 올려주세요.'],
    warnings: warnings.length ? warnings : undefined,
    notes: [
      'Korean Air Flight Log Report로 읽었어요 — 시각은 GMT, 날짜는 UTC 기준 그대로예요.',
      '블록·야간·계기시간은 회사 값 그대로 가져왔어요 (보정 없음).',
      'T/O·L/D의 주간/야간 구분은 파일에 없어 주간 칸으로 넣었어요.',
    ],
  }
}
