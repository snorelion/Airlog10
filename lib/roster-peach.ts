// Peach Aviation(MM) "Crew Web Portal" Individual Roster 파서
// 실파일(27JUL26-31AUG26, 2쪽) 검증: 23편 · 자정 병합(MM860) · C/I·C/O — 2026-07-31
//
// 형식 특징 (Lion Air와 다름):
//  · 하루 여러 줄: "28TUE MM031 09:30 KIX 10:50 KHH 14:10 321" + 들여쓴 이어지는 줄
//  · C/I(리포트)는 그날 첫 비행 앞, C/O(듀티 종료)는 마지막 비행 ATA 뒤, 이어서 기종·듀티시간
//  · 자정 넘는 편은 "출발 줄(목적지 없음)" + "다음 날 도착 줄"로 쪼개짐 → 병합
//  · HTL(호텔)·H/HQ(휴무 등)·훈련 코드(GSB, CRM …) 줄은 건너뜀
//  · ⚠️ 시각은 "그 공항의 로컬" (Lion은 베이스 로컬 통일) — UTC 변환은 Airline 프로필 단계에서

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
}
const TIME = /^\d{2}:\d{2}$/
const AP = /^[A-Z]{3}$/
const ACTYPE = /^\d{2}[A-Z0-9]$/
const DAY = /^(\d{2})(MON|TUE|WED|THU|FRI|SAT|SUN)\b\s*(.*)$/
const FLT = /^(MM\d+[A-Z]?)\s*(.*)$/
const TYPE_MAP: Record<string, string> = {
  '320': 'A320', '321': 'A321', '32N': 'A320neo', '32Q': 'A321neo',
}

type PeachFlight = {
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

export function isPeachRoster(text: string): boolean {
  return text.includes('Individual Roster')
    && (text.includes('Crew Web Portal') || text.includes('Peach Aviation'))
}

type PdfLike = {
  numPages: number
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>
}

export async function parsePeachRoster(pdf: PdfLike) {
  // 1) 글자 좌표 → 줄 재구성 (전 페이지)
  const lines: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const items: { x: number; y: number; t: string }[] = []
    for (const raw of tc.items as { str?: string; transform?: number[] }[]) {
      const t = (raw.str ?? '').replace(/\u200B/g, '').trim()
      if (t && raw.transform) items.push({ t, x: raw.transform[4], y: raw.transform[5] })
    }
    items.sort((a, b) => (Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x))
    const pageLines: { y: number; toks: string[] }[] = []
    for (const it of items) {
      const last = pageLines[pageLines.length - 1]
      if (last && Math.abs(last.y - it.y) <= 2) last.toks.push(it.t)
      else pageLines.push({ y: it.y, toks: [it.t] })
    }
    for (const l of pageLines) lines.push(l.toks.join(' '))
  }

  // 2) 기간 → 연·월 문맥 (로스터가 월을 넘어가면 일(day)이 줄어드는 지점에서 다음 달로)
  const full = lines.join(' ')
  const pm = full.match(/(\d{2})([A-Z]{3})(\d{2})\s*-\s*(\d{2})([A-Z]{3})(\d{2})/)
  if (!pm) {
    return { period: null, flights: [] as PeachFlight[], stats: { flights: 0, offDays: 0, standbyDays: 0 } }
  }
  const start = `${2000 + parseInt(pm[3], 10)}-${String(MONTHS[pm[2]]).padStart(2, '0')}-${pm[1]}`
  const end = `${2000 + parseInt(pm[6], 10)}-${String(MONTHS[pm[5]]).padStart(2, '0')}-${pm[4]}`

  let curY = 2000 + parseInt(pm[3], 10)
  let curM = MONTHS[pm[2]]
  let lastDay = 0
  let curDate = ''

  const flights: PeachFlight[] = []
  const report: Record<string, string> = {}
  const dutyEnd: Record<string, string> = {}
  let offDays = 0
  let standbyDays = 0
  let pending: PeachFlight | null = null   // 자정 넘긴 출발 (다음 날 도착 줄 대기)

  const parseActivity = (text: string, date: string) => {
    const m = text.match(FLT)
    if (!m) return
    const flt = m[1]
    const toks = m[2].split(/\s+/).filter(Boolean)
    let ci: string | null = null
    if (toks.length && TIME.test(toks[0])) ci = toks.shift()!

    // 자정 병합 — 대기 중인 같은 편명의 도착 줄: DEST ATA [C/O] TYPE
    if (pending && pending.flight_number === flt) {
      if (toks.length >= 2 && AP.test(toks[0]) && TIME.test(toks[1])) {
        pending.destination = toks[0]
        pending.sta = toks[1]
        pending.overnight = true
        if (toks.length >= 3 && TIME.test(toks[2])) dutyEnd[pending.flight_date] = toks[2]
        flights.push(pending)
      }
      pending = null
      return
    }

    if (toks.length >= 2 && AP.test(toks[0]) && TIME.test(toks[1])) {
      const orig = toks[0]
      const atd = toks[1]
      let k = 2
      if (k + 1 < toks.length && AP.test(toks[k]) && TIME.test(toks[k + 1])) {
        // 완전한 비행 줄: ORIG ATD DEST ATA [C/O] TYPE [DUTY]
        const dest = toks[k]
        const ata = toks[k + 1]
        k += 2
        let co: string | null = null
        if (k < toks.length && TIME.test(toks[k])) { co = toks[k]; k += 1 }
        const acRaw = k < toks.length && ACTYPE.test(toks[k]) ? toks[k] : null
        flights.push({
          flight_date: date, flight_number: flt,
          origin: orig, destination: dest, std: atd, sta: ata,
          aircraft_type: acRaw ? (TYPE_MAP[acRaw] ?? acRaw) : null, overnight: false,
        })
        if (ci && !report[date]) report[date] = ci
        if (co) dutyEnd[date] = co
      } else if (k < toks.length && ACTYPE.test(toks[k])) {
        // 출발만 있는 줄 (자정 넘김) — 다음 날 도착 줄과 병합
        const acRaw = toks[k]
        pending = {
          flight_date: date, flight_number: flt,
          origin: orig, destination: null, std: atd, sta: null,
          aircraft_type: TYPE_MAP[acRaw] ?? acRaw, overnight: true,
        }
        if (ci && !report[date]) report[date] = ci
      }
    }
  }

  for (const line of lines) {
    const dm = line.match(DAY)
    if (!dm) {
      if (curDate) parseActivity(line, curDate)
      continue
    }
    const d = parseInt(dm[1], 10)
    if (d < lastDay) {
      curM += 1
      if (curM > 12) { curM = 1; curY += 1 }
    }
    lastDay = d
    curDate = `${curY}-${String(curM).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const rest = dm[3].trim()
    if (rest === 'H' || rest === 'HQ') offDays += 1
    else if (rest.startsWith('SB')) standbyDays += 1
    else if (rest) parseActivity(rest, curDate)
  }

  // 리포트/듀티 종료를 그날 첫 비행에 (Lion 응답과 같은 규칙)
  const byDay: Record<string, PeachFlight[]> = {}
  for (const f of flights) (byDay[f.flight_date] ??= []).push(f)
  for (const day of Object.keys(byDay)) {
    const fs = byDay[day].sort((a, b) => (a.std ?? '').localeCompare(b.std ?? ''))
    fs[0].report_time = report[day] ?? null
    fs[0].duty_end_time = dutyEnd[day] ?? null
  }

  return {
    period: { start, end },
    flights,
    stats: { flights: flights.length, offDays, standbyDays },
  }
}
