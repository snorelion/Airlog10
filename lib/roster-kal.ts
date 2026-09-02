// Korean Air 로스터 파서 — 크루넷 어디서 뽑느냐에 따라 양식이 다르다 (2026-08-20, 실파일 2종+엑셀)
//
//  ① "Crew Roster Report" (파일명 cwpCrewRosterReport…) — 비행마다 승무원 명단이 딸린 표.
//     STD/STA가 "2026-08-01 19:42"처럼 **날짜까지** 온다 (공항 현지시각).
//     휴무·스탠바이는 행이 없고 머리글 "FLY 55:49 TVL 00:00 DO 10 RESERVE 6"에 요약만 있다.
//  ② "Roster Report" 달력형 (crew-roster-calendar) — 한 달이 날짜별 한 줄씩.
//     DO·RESERVE·ALM 같은 활동도 있고, 도착이 이틀 뒤면 "03:43 (+2)"로 온다.
//     같은 표를 엑셀로도 뽑는다 → parseKalRosterXlsx (컬럼 이름으로 찾아 순서가 바뀌어도 버틴다).
//
// 공통 정책:
//  · 좌표를 쓰지 않는다 — 항목을 공백으로 쪼갠 **단어 스트림**을 종류·순서로만 판독한다.
//    (제주항공 교훈: 서버 unpdf와 로컬 pypdf가 다른 좌표·조각을 준다. 단어로 쪼개면 병합·분할 무관)
//  · 시각은 공항 현지시각 그대로 넘긴다 — UTC 변환은 앱의 RosterTime이 맡는다 (Thai·Peach 정책).
//  · 자기 듀티가 TVL(편승)인 편은 넣지 않는다 — 이스타 DH와 같은 정책. 건수만 세어 알린다.
//  · 장거리는 도착이 이틀 뒤일 수 있다(+2). 계약(overnight: Bool)엔 하루 이상이 없으므로
//    일단 overnight=true로만 넘긴다 — 정밀한 도착일 처리는 앱 쪽 개선 대기 (2026-08-20 보류).

import ExcelJS from 'exceljs'
import { KAL_TYPE_MAP } from './company-log-kal'

export type KalRosterFlight = {
  flight_date: string
  flight_number: string
  origin: string | null
  destination: string | null
  std: string | null
  sta: string | null
  aircraft_type: string | null
  overnight: boolean
  report_time?: string | null
  duty_end_time?: string | null
}

export type KalRosterResult = {
  period: { start: string; end: string }
  flights: KalRosterFlight[]
  /// 날짜별 "비행 없는 날" — 앱 스케줄 달력용 (2026-09-02, route.ts ParsedRosterDay와 동일 모양)
  days?: { date: string; kind: 'off' | 'standby' | 'sim' | 'ground'; label: string | null }[]
  stats: { flights: number; offDays: number; standbyDays: number }
  notes?: string[]
}

/** unpdf 문서에서 우리가 쓰는 부분만 (Eastar·Peach 파서와 같은 형태) */
type PdfLike = {
  numPages: number
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>
}

// 로그북 파서의 기종 맵을 물려받고, 로스터에만 나오는 표기를 얹는다
const ROSTER_TYPE_MAP: Record<string, string> = {
  ...KAL_TYPE_MAP,
  '38S': 'A380-800', // 로스터의 A380 표기 (로그북은 388)
  A380: 'A380-800', // 달력형 페어링 꼬리 (KE011/010826/A380)
}

const FLT = /^[A-Z]{2}\d{2,4}$/ // KE011 · KE2001 (KAL 계열이면 LJ도 그대로 탄다)
const AP = /^[A-Z]{3}$/
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/
const AC = /^(?:\d{2}[A-Z0-9]|7M8)$/ // 38S·773·74I·77W … (7M8만 예외 꼴)
const RDATE = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/ // 01-Aug-2026
const PLUS_N = /^\(\+(\d+)\)$/
const RANKS = new Set(['CAP', 'FO', 'SO'])
const WTS = new Set(['FLY', 'TVL'])
// 달력형의 비행 아닌 활동 — 휴무 계열과 대기 계열만 통계에 세고 나머지는 조용히 지나간다
const OFF_CODES = new Set(['DO', 'ATDO', 'ALM', 'ALV', 'AL', 'VAC', 'ANL'])
const isStandbyCode = (c: string) =>
  c === 'RESERVE' || c.startsWith('HM_SBY') || c.startsWith('SBY') || c.startsWith('APSBY')

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "8:05" 꼴도 "08:05"로 — 시각이 아니면 null */
function hm(s: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null
  return `${pad(Number(m[1]))}:${m[2]}`
}

/** "01-Aug-2026" → "2026-08-01". 아니면 null */
function isoFromDMY(s: string): string | null {
  const m = RDATE.exec(s)
  if (!m) return null
  const mo = MONTHS[m[2].toLowerCase()]
  return mo ? `${m[3]}-${pad(mo)}-${m[1]}` : null
}

/** 비행 날짜들로 기간을 만든다 — 한 달 안이면 그 달 전체로 넓힌다 */
function periodFromFlights(flights: KalRosterFlight[]): { start: string; end: string } {
  const dates = flights.map((f) => f.flight_date).sort()
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (first.slice(0, 7) === last.slice(0, 7)) {
    const y = Number(first.slice(0, 4))
    const mo = Number(first.slice(5, 7))
    return { start: `${first.slice(0, 7)}-01`, end: `${first.slice(0, 7)}-${pad(new Date(y, mo, 0).getDate())}` }
  }
  return { start: first, end: last }
}

/** 편승 안내문 — 두 양식 공용 */
function tvlNote(n: number): string[] | undefined {
  return n > 0 ? [`Skipped ${n} positioning (TVL) leg(s) — only flights you operate are added.`] : undefined
}

/** 문서 전체를 "단어 스트림"으로 — 항목이 어떻게 조각나든 공백으로 쪼개면 같아진다 */
async function wordsOf(pdf: PdfLike): Promise<string[]> {
  const words: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    for (const raw of tc.items as { str?: string }[]) {
      const t = (raw.str ?? '').replace(/\u200B/g, '').trim()
      if (!t) continue
      for (const w of t.split(/\s+/)) if (w) words.push(w)
    }
  }
  return words
}

// ───────────────────────── ① Crew Roster Report (cwp…) ─────────────────────────

export function isKalCwpRoster(text: string): boolean {
  // 헤더가 낱글자·역순으로 와도 버티게 공백 제거본으로 본다 (제주항공 판별 실패 교훈)
  const c = text.replace(/\s+/g, '')
  return c.includes('Flight/Activity') && c.includes('PICcode') && c.includes('CrewID') &&
    c.includes('SpecialDutyCode')
}

export async function parseKalCwpRoster(pdf: PdfLike): Promise<KalRosterResult | null> {
  const w = await wordsOf(pdf)

  // 머리글 "… | 1603103 | 380 | FO" 에서 본인 사번 — 파이프 옆 5~8자리.
  // (본문 크루 사번은 파이프가 없어서 안 걸린다. 못 찾으면 TVL 거르기만 포기한다)
  let ownId: string | null = null
  for (let i = 0; i < w.length && !ownId; i++) {
    const m = /^\|?(\d{5,8})\|?$/.exec(w[i])
    if (!m) continue
    if (w[i].includes('|') || w[i - 1] === '|' || w[i + 1] === '|') ownId = m[1]
  }

  // 머리글 요약 "DO 10 RESERVE 6" → 통계 (행이 따로 없는 양식이라 여기서만 나온다)
  let offDays = 0
  let standbyDays = 0
  for (let i = 0; i + 1 < w.length; i++) {
    if (!offDays && w[i] === 'DO' && /^\d{1,2}$/.test(w[i + 1])) offDays = Number(w[i + 1])
    if (!standbyDays && w[i] === 'RESERVE' && /^\d{1,2}$/.test(w[i + 1])) standbyDays = Number(w[i + 1])
  }

  // 비행: 편명 뒤 [공항, 날짜, 시각, 공항, 날짜, 시각, 기종] 일곱 단어가 정확히 서야만 믿는다
  const flights: KalRosterFlight[] = []
  let skippedTvl = 0
  let i = 0
  while (i < w.length) {
    if (!FLT.test(w[i])) { i++; continue }
    const s = w.slice(i + 1, i + 8)
    const std = s.length === 7 ? hm(s[2]) : null
    const sta = s.length === 7 ? hm(s[5]) : null
    if (!(s.length === 7 && AP.test(s[0]) && DATE_ISO.test(s[1]) && std &&
          AP.test(s[3]) && DATE_ISO.test(s[4]) && sta && AC.test(s[6]))) { i++; continue }

    // 다음 편명 전까지의 크루 명단에서 본인 줄을 찾아 듀티 확인 — "FO FLY F2 1603103 …"
    let duty: string | null = null
    for (let j = i + 8; j < w.length && !FLT.test(w[j]); j++) {
      if (ownId && w[j] === ownId) {
        duty = w.slice(Math.max(0, j - 3), j).indexOf('TVL') >= 0 ? 'TVL' : 'FLY'
        break
      }
    }
    if (duty === 'TVL') skippedTvl++
    else flights.push({
      flight_date: s[1],
      flight_number: w[i],
      origin: s[0],
      destination: s[3],
      std,
      sta,
      aircraft_type: ROSTER_TYPE_MAP[s[6]] ?? s[6],
      overnight: s[4] > s[1], // 도착 날짜가 뒤면 자정 넘김 (+2도 일단 true로만)
    })
    i += 8
  }

  if (!flights.length) return null
  return {
    period: periodFromFlights(flights),
    flights,
    stats: { flights: flights.length, offDays, standbyDays },
    notes: tvlNote(skippedTvl),
  }
}

// ───────────────────────── ② Roster Report 달력형 (PDF) ─────────────────────────

export function isKalCalendarRoster(text: string): boolean {
  const c = text.replace(/\s+/g, '')
  return c.includes('RosterReport') && c.includes('Pairing/Activity') &&
    /\d{2}-[A-Za-z]{3}-\d{4}to\d{2}-[A-Za-z]{3}-\d{4}/.test(c)
}

/** 달력형 한 행(단어 배열)을 비행/활동으로 해석 — PDF·엑셀이 같은 로직을 쓴다 */
function calendarRow(date: string, body: string[]): { flight?: KalRosterFlight; wt?: string; code?: string } {
  const itemIdx = body.findIndex((x) => FLT.test(x))
  if (itemIdx < 0) return { code: body[0] ?? '' }

  // 아이템 바로 앞이 시각이면 리포트 시각 (페어링 첫 편·이어지는 편 모두 이 자리에 온다)
  const report = itemIdx >= 1 ? hm(body[itemIdx - 1]) : null
  const pairing = body.slice(0, itemIdx).find((x) => x.includes('/')) ?? null

  // 아이템 뒤: [직급] [듀티] 출발지 시각 도착지 시각 [(+N)] … 기종 — 순서대로만 집는다
  let wt: string | null = null
  let org: string | null = null
  let std: string | null = null
  let dst: string | null = null
  let sta: string | null = null
  let plus = 0
  let acCode: string | null = null
  let expectPlus = false
  for (const x of body.slice(itemIdx + 1)) {
    if (expectPlus) {
      expectPlus = false
      const pm = PLUS_N.exec(x)
      if (pm) { plus = Number(pm[1]); continue }
    }
    if (!org && (RANKS.has(x) || WTS.has(x))) { if (WTS.has(x)) wt = x; continue }
    if (!org && AP.test(x)) { org = x; continue }
    if (org && !std) { const t = hm(x); if (t) { std = t; continue } }
    if (std && !dst && AP.test(x)) { dst = x; continue }
    if (dst && !sta) { const t = hm(x); if (t) { sta = t; expectPlus = true; continue } }
    if (!acCode && AC.test(x) && !hm(x)) { acCode = x; continue }
  }

  const pairTail = pairing ? pairing.slice(pairing.lastIndexOf('/') + 1) : null
  const aircraft = acCode
    ? (ROSTER_TYPE_MAP[acCode] ?? acCode)
    : pairTail && /^[A-Z]?\d{3}[A-Z]?$/.test(pairTail)
      ? (ROSTER_TYPE_MAP[pairTail] ?? pairTail)
      : null

  return {
    wt: wt ?? undefined,
    flight: {
      flight_date: date,
      flight_number: body[itemIdx],
      origin: org,
      destination: dst,
      std,
      sta,
      aircraft_type: aircraft,
      overnight: plus > 0,
      report_time: report,
    },
  }
}

/** 행 목록 → 결과 (PDF·엑셀 공용 마무리) */
function calendarResult(
  rows: { date: string; body: string[] }[],
  period: { start: string; end: string } | null
): KalRosterResult | null {
  const flights: KalRosterFlight[] = []
  const codeByDate: { date: string; kind: 'off' | 'standby'; label: string }[] = []
  let offDays = 0
  let standbyDays = 0
  let skippedTvl = 0
  for (const r of rows) {
    const parsed = calendarRow(r.date, r.body)
    if (parsed.flight) {
      if (parsed.wt === 'TVL') skippedTvl++
      else flights.push(parsed.flight)
    } else if (parsed.code) {
      if (OFF_CODES.has(parsed.code)) {
        offDays++
        codeByDate.push({ date: r.date, kind: 'off', label: parsed.code })
      } else if (isStandbyCode(parsed.code)) {
        standbyDays++
        codeByDate.push({ date: r.date, kind: 'standby', label: parsed.code })
      }
    }
  }
  if (!flights.length) return null
  // 비행 없는 날만 day 행 — TVL(편승)만 있는 날도 코드가 함께 오면 여기 남는다
  const flightDates = new Set(flights.map((f) => f.flight_date))
  const days = codeByDate.filter((d) => !flightDates.has(d.date))
  return {
    period: period ?? periodFromFlights(flights),
    flights,
    days: days.length ? days : undefined,
    stats: { flights: flights.length, offDays, standbyDays },
    notes: tvlNote(skippedTvl),
  }
}

export async function parseKalCalendarRoster(pdf: PdfLike): Promise<KalRosterResult | null> {
  const w = await wordsOf(pdf)

  // 기간: "01-Aug-2026to31-Aug-2026" (공백 유무 무관하게 공백 제거본에서)
  let period: { start: string; end: string } | null = null
  const pm = /(\d{2}-[A-Za-z]{3}-\d{4})to(\d{2}-[A-Za-z]{3}-\d{4})/.exec(w.join(' ').replace(/\s+/g, ''))
  if (pm) {
    const s = isoFromDMY(pm[1])
    const e = isoFromDMY(pm[2])
    if (s && e) period = { start: s, end: e }
  }

  // "01-Aug-2026" 단어를 앵커로 행을 나눈다 (쪽 넘김·헤더 반복은 앞 행 꼬리에 붙지만 무해)
  const rows: { date: string; body: string[] }[] = []
  let cur: { date: string; body: string[] } | null = null
  for (const x of w) {
    const d = isoFromDMY(x)
    if (d) {
      if (cur) rows.push(cur)
      cur = { date: d, body: [] }
    } else if (cur) {
      cur.body.push(x)
    }
  }
  if (cur) rows.push(cur)

  return calendarResult(rows, period)
}

// ───────────────────────── ③ Roster Report 달력형 (엑셀) ─────────────────────────

// 엑셀 셀 값 → 문자열 (company-log 라우트와 같은 규칙 — exceljs는 타입이 제각각이다)
function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) {
    if (v.getUTCFullYear() < 1901) {
      return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`
    }
    return v.toISOString().slice(0, 10)
  }
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] }
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('').trim()
    if (o.text !== undefined) return String(o.text).trim()
    if (o.result !== undefined) return String(o.result).trim()
  }
  return String(v).trim()
}

/** "ICN 19:42" / "ICN  03:43 (+2)" → 공항·시각·+N */
function apTime(s: string): { ap: string; hm: string; plus: number } | null {
  const m = /^([A-Z]{3})\s+(\d{1,2}:\d{2})/.exec(s)
  if (!m) return null
  const t = hm(m[2])
  if (!t) return null
  const p = /\(\+(\d+)\)/.exec(s)
  return { ap: m[1], hm: t, plus: p ? Number(p[1]) : 0 }
}

/** 회사 로그북 엑셀을 로스터 칸에 올렸는지 가벼운 감지 — "다른 칸" 안내용.
 *  회사 로그북 판별(Lion isCompanyLog · 제주 isJejuCompanyLog)과 같은 첫 줄 헤더를 본다 */
export async function xlsxLooksLikeCompanyLog(buf: ArrayBuffer): Promise<boolean> {
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.worksheets[0]
    if (!ws) return false
    const names = new Set<string>()
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
      names.add(cellText(cell.value).trim())
    })
    return (names.has('DepPlace') && names.has('FltTime') && names.has('ACType'))
      || (names.has('fltDat') && names.has('stFr') && names.has('stTo'))
  } catch {
    return false
  }
}

/** 대한항공 달력형 엑셀이 아니면 null (그래야 라우트가 "지원 안 함"을 구분해 알린다) */
export async function parseKalRosterXlsx(buf: ArrayBuffer): Promise<KalRosterResult | null> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const ws = wb.worksheets[0]
  if (!ws) return null

  // 행을 통째 문자열 배열로 (1-based 컬럼 그대로)
  const grid: string[][] = []
  ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
    const cells: string[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNo) => {
      cells[colNo] = cellText(cell.value)
    })
    grid[rowNo] = cells
  })

  // 헤더 행에서 컬럼 위치를 이름으로 찾는다 — 순서가 바뀌어도 버틴다
  let head: string[] | null = null
  let headRow = 0
  for (let r = 1; r < Math.min(grid.length, 6); r++) {
    const cells = grid[r]
    if (cells && cells.indexOf('Date') >= 0 && cells.indexOf('Pairing/Activity') >= 0) {
      head = cells
      headRow = r
      break
    }
  }
  if (!head) return null
  const col = (name: string) => (head ? head.indexOf(name) : -1)
  const cDate = col('Date')
  const cPair = col('Pairing/Activity')
  const cReport = col('Report')
  const cItem = col('Item')
  const cWt = col('WT')
  const cDep = col('Dep')
  const cArr = col('Arr')
  const cDebrief = col('Debrief')
  const cType = col('A/C Type')
  if (cDate < 0 || cItem < 0 || cDep < 0 || cArr < 0) return null

  // 기간: 1행 어딘가의 "01-Aug-2026to31-Aug-2026" (to 앞뒤 공백 유무 무관)
  let period: { start: string; end: string } | null = null
  const headText = (grid[1] ?? []).join(' ')
  const pm = /(\d{2}-[A-Za-z]{3}-\d{4})\s*to\s*(\d{2}-[A-Za-z]{3}-\d{4})/.exec(headText)
  if (pm) {
    const s = isoFromDMY(pm[1])
    const e = isoFromDMY(pm[2])
    if (s && e) period = { start: s, end: e }
  }

  const flights: KalRosterFlight[] = []
  let offDays = 0
  let standbyDays = 0
  let skippedTvl = 0
  for (let r = headRow + 1; r < grid.length; r++) {
    const cells = grid[r]
    if (!cells) continue
    const rawDate = cells[cDate] ?? ''
    const date = DATE_ISO.test(rawDate) ? rawDate : isoFromDMY(rawDate)
    if (!date) continue

    const item = cells[cItem] ?? ''
    if (!FLT.test(item)) {
      const code = cells[cPair] ?? ''
      if (OFF_CODES.has(code)) offDays++
      else if (isStandbyCode(code)) standbyDays++
      continue
    }
    if (cWt >= 0 && (cells[cWt] ?? '') === 'TVL') { skippedTvl++; continue }

    const dep = apTime(cells[cDep] ?? '')
    const arr = apTime(cells[cArr] ?? '')
    const pairing = cells[cPair] ?? ''
    const pairTail = pairing.includes('/') ? pairing.slice(pairing.lastIndexOf('/') + 1) : ''
    const acCode = cType >= 0 && (cells[cType] ?? '') !== '' ? cells[cType] : pairTail
    // 듀티 종료(Debrief)는 같은 날일 때만 — "(+2)" 붙은 값은 이틀 뒤라 그날 시각이 아니다
    const debrief = cDebrief >= 0 ? hm(cells[cDebrief] ?? '') : null

    flights.push({
      flight_date: date,
      flight_number: item,
      origin: dep ? dep.ap : null,
      destination: arr ? arr.ap : null,
      std: dep ? dep.hm : null,
      sta: arr ? arr.hm : null,
      aircraft_type: acCode ? (ROSTER_TYPE_MAP[acCode] ?? acCode) : null,
      overnight: (arr ? arr.plus : 0) > 0,
      report_time: hm(cells[cReport] ?? ''),
      duty_end_time: debrief,
    })
  }

  if (!flights.length) return null
  return {
    period: period ?? periodFromFlights(flights),
    flights,
    stats: { flights: flights.length, offDays, standbyDays },
    notes: tvlNote(skippedTvl),
  }
}
