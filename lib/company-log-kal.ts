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

const PILOT_RE = /Flight Log Report\s+(.+?)\s*\|\s*(\d+)\s*\|\s*\S+\s*\|\s*(\S+)/

// 한 줄의 원시 텍스트 조각들 → 의미 단위 토큰.
// PDF 라이브러리에 따라 "N09:50EX"처럼 붙거나 칸 순서가 다르게 읽히므로
// (실측: 서버 pdfjs는 x좌표순이라 HL No가 날짜보다 앞) 순서에 기대지 않고
// 토큰을 "종류"로 분류한다: 날짜·HL기체·KE편명·시각·기종코드·Y/N·공항·듀티코드
const TOKEN_RE = /\d{4}-\d{2}-\d{2}|HL\d{4}|KE\d{2,4}[A-Z]?|\d{1,2}:\d{2}|\d{2}[A-Z0-9]|[A-Z]+|\d+/g

function hmToMinLocal(s: string): number {
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return 0
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

/** PDF → 대한항공 로그 행. 이 형식이 아니면 null (자동 감지용). */
export async function kalExtract(data: Uint8Array): Promise<KalExtract | null> {
  const pdf = await getDocumentProxy(data)

  // 글자 좌표를 읽어 y로 줄을 묶는다 (Lion PDF 파서와 같은 방식) — 줄은 토큰 배열로 유지
  const allLines: string[][] = []
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
        if (cur) allLines.push(cur.parts)
        cur = { y: it.y, parts: [it.t] }
      }
    }
    if (cur) allLines.push(cur.parts)
  }
  const fullText = allLines.map((l) => l.join(' ')).join('\n')

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

  for (const parts of allLines) {
    // 원시 조각 → 의미 토큰 (붙어 나온 "N09:50EX"도 "N","09:50","EX"로 분리)
    const toks: string[] = []
    for (const raw of parts) {
      for (const m of raw.match(TOKEN_RE) ?? []) toks.push(m)
    }
    const date = toks.find((t) => /^\d{4}-\d{2}-\d{2}$/.test(t))
    const reg = toks.find((t) => /^HL\d{4}$/.test(t))
    if (!date || !reg) continue   // 데이터 줄이 아님 (헤더·합계·꼬리말)

    const fltNo = toks.find((t) => /^KE\d{2,4}[A-Z]?$/.test(t)) ?? ''
    const times = toks.filter((t) => /^\d{1,2}:\d{2}$/.test(t))
    let dep = ''
    let arr = ''
    let typeCode = ''
    let dutyCode: string | null = null
    const yn: string[] = []
    for (const t of toks) {
      if (t === date || t === reg || /^KE\d/.test(t) || /^\d{1,2}:\d{2}$/.test(t)) continue
      if (t === 'Y' || t === 'N') { yn.push(t); continue }                 // T/O·L/D·A/L (x순)
      if (!arr && /^[A-Z]{3}$/.test(t)) { if (!dep) dep = t; else arr = t; continue }  // DEP→ARR
      if (!typeCode && /^\d{2}[A-Z0-9]$/.test(t)) { typeCode = t; continue }          // 74I·772…
      if (!dutyCode && /^[A-Z]{1,4}$/.test(t)) { dutyCode = t; continue }              // EX·GF·NF·F
    }

    if (!dep || !arr || times.length < 7) {
      ex.errors.push(parts.join(' '))
      continue
    }

    ex.rows.push({
      date, reg,
      typeCode: typeCode || '?',
      fltNo, dep, arr,
      ro: times[0], ri: times[1],
      blockMin: hmToMinLocal(times[2]),
      nightMin: hmToMinLocal(times[5]),
      instMin: hmToMinLocal(times[times.length - 1]),
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
      ? `Unknown rank '${rank}' — capacity (PIC/SIC) left blank.`
      : 'Rank (FO/CA) not found in the header — capacity left blank.')
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
    warnings.push(`Unfamiliar aircraft type codes kept as-is: ${Array.from(unknownTypes).join(', ')}`)
  }
  if (dupInFile) warnings.push(`Skipped ${dupInFile} duplicate rows in the file.`)
  if (ex.errors.length) warnings.push(`Skipped ${ex.errors.length} lines that didn't match the expected format.`)

  return {
    flights,
    aircraft: Array.from(acMap.values()),
    errors: flights.length ? [] : ['No flight rows found. Please upload the Flight Log Report PDF from the company system as-is.'],
    warnings: warnings.length ? warnings : undefined,
    notes: [
      'Read as a Korean Air Flight Log Report — times are GMT and dates are UTC, exactly as recorded.',
      'Block, night and instrument times are imported as-is from the company file (no adjustments).',
      "Day/night split for takeoffs and landings isn't in the file — counts were put in the day columns.",
    ],
  }
}
