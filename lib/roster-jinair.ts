// Jin Air "Crew Daily Roster" 로스터 파서 — 2026-08-21 실파일(36편) 검증
//
// ⚠️ **이름만 .xls이고 실제는 HTML 표다** (옛 웹 시스템의 내보내기 방식).
//    라우트가 첫 글자 '<'를 보고 이리로 넘긴다. 파싱은 <tr>/<td> 정규식으로 충분하다.
//
// 표 구조 (헤더: Sn No. | Date of Duty | Type of Duty | Flight Details | Reporting |
//          Start Time | End Time | Schedule Block | Flight Block | Total | Trg/Remarks):
//  · 날짜 행: [순번, 01-Aug-2026, 듀티, 편, 리포팅, 출발, 도착, …] (11칸)
//  · 같은 듀티의 이어지는 레그: 앞 두 칸(순번·날짜)이 없는 9칸 행 — 직전 날짜를 물려받는다
//  · 시각은 "31-Jul 21:35(Z)01-Aug 06:35(L)"처럼 **Z/L 두 벌 + 날짜까지** 온다
//    → **(L)을 쓴다** (공항 현지, RosterTime 정책). 날짜가 명시돼 자정 넘김이 정확하다.
//    연도는 시각에 없어서 행 날짜의 연도를 쓰고, 12월↔1월 걸침만 보정한다.
//  · Flight Details: "LJ671(T) GMP-RSU(L)" · "LJ506CJU-GMP"(붙음) · "LJ693FGMP-PUS(L)" ·
//    "KE 1811GMP-PUS"(대한항공 편승) — (T)/(L) 장식을 떼고 **끝의 XXX-YYY가 루트**,
//    남은 앞부분이 편명이다 (공백 제거: "KE 1811"→"KE1811")
//  · Type of Duty: OP-*=운항 · DH*=편승(제외+건수 알림, 이스타 정책) ·
//    DO/LDO/RDO/ATDO/POFF/LEAVE*=휴무 · RSV/HSB* 계열=대기 · NDA-LayOver=무시
//  · 기종 칸이 없다(737·777 혼합 기단) → aircraft_type은 null로 두고 Log it 때 채운다
//  · 하단에 요약·듀티 사전 표가 붙지만 칸 수가 적어(≤3) 본문 필터에서 걸러진다

export type JinairRosterFlight = {
  flight_date: string
  flight_number: string
  origin: string | null
  destination: string | null
  std: string | null
  sta: string | null
  aircraft_type: string | null
  overnight: boolean
  report_time?: string | null
}

export type JinairRosterResult = {
  period: { start: string; end: string }
  flights: JinairRosterFlight[]
  stats: { flights: number; offDays: number; standbyDays: number }
  notes?: string[]
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const ROW_DATE = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/ // 01-Aug-2026
const L_TIME = /(\d{1,2})-([A-Za-z]{3})\s*(\d{1,2}):(\d{2})\(L\)/ // …01-Aug 06:35(L)
const ROUTE = /([A-Z]{3})-([A-Z]{3})\s*$/
const OFF_TYPES = new Set(['DO', 'LDO', 'RDO', 'ATDO', 'POFF'])
const SBY_TOKENS = ['RSV', 'HSB1', 'HSB2', 'HSB3', 'HSB4', 'HSB5',
  'GHSB1', 'GHSB2', 'GHSB3', 'GHSB4', 'GHSB5', 'BX_SB', 'RS_SB']

const pad = (n: number) => String(n).padStart(2, '0')

export function isJinairRoster(html: string): boolean {
  return html.includes('Crew Daily Roster') && html.includes('Type of Duty') &&
    html.includes('Flight Details') && html.includes('Schedule Block')
}

/** HTML 표 → 행(칸 텍스트 배열) 목록. 태그를 떼고 &nbsp;를 공백으로 */
function tableRows(html: string): string[][] {
  const rows: string[][] = []
  for (const tr of Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi))) {
    const cells: string[] = []
    for (const td of Array.from(tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi))) {
      cells.push(td[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())
    }
    rows.push(cells)
  }
  return rows
}

/** "…01-Aug 06:35(L)" → 현지 날짜·시각. 연도는 행 연도 기준, 12월↔1월 걸침만 보정 */
function localDateTime(s: string, rowYear: number, rowMonth: number):
  { day: string; hm: string } | null {
  const m = L_TIME.exec(s)
  if (!m) return null
  const mo = MONTHS[m[2].toLowerCase()]
  if (!mo) return null
  let y = rowYear
  if (mo === 12 && rowMonth === 1) y -= 1
  else if (mo === 1 && rowMonth === 12) y += 1
  return { day: `${y}-${pad(mo)}-${pad(Number(m[1]))}`, hm: `${pad(Number(m[3]))}:${m[4]}` }
}

export function parseJinairRoster(html: string): JinairRosterResult | null {
  const rows = tableRows(html)
  const headIdx = rows.findIndex((r) => r.some((c) => c.includes('Date of Duty')))
  if (headIdx < 0) return null

  const flights: JinairRosterFlight[] = []
  let offDays = 0
  let standbyDays = 0
  let deadheads = 0
  let cur: { year: number; month: number } | null = null

  for (const r of rows.slice(headIdx + 1)) {
    if (r.length < 8) continue // 하단 요약·듀티 사전 표
    let typ: string, det: string, rep: string, st: string, en: string
    const dm = r.length >= 10 ? ROW_DATE.exec(r[1] ?? '') : null
    if (dm && /^\d{1,3}$/.test(r[0] ?? '')) {
      const mo = MONTHS[dm[2].toLowerCase()]
      if (!mo) continue
      cur = { year: Number(dm[3]), month: mo }
      typ = r[2]; det = r[3]; rep = r[4]; st = r[5]; en = r[6]
    } else {
      // 이어지는 레그 — 직전 날짜의 듀티
      typ = r[0]; det = r[1]; rep = r[2]; st = r[3]; en = r[4]
    }
    if (!cur) continue
    const t = (typ ?? '').trim()

    if (t.startsWith('OP')) {
      const clean = (det ?? '').replace(/\(T\)/g, '').replace(/\(L\)/g, '').trim()
      const rt = ROUTE.exec(clean)
      if (!rt || rt.index === undefined) continue
      const sl = localDateTime(st ?? '', cur.year, cur.month)
      const el = localDateTime(en ?? '', cur.year, cur.month)
      if (!sl || !el) continue
      const rl = localDateTime(rep ?? '', cur.year, cur.month)
      flights.push({
        flight_date: sl.day, // 출발의 현지 날짜 (행 날짜와 같지만 명시된 쪽을 믿는다)
        flight_number: clean.slice(0, rt.index).replace(/\s+/g, ''),
        origin: rt[1],
        destination: rt[2],
        std: sl.hm,
        sta: el.hm,
        aircraft_type: null, // 737·777 혼합 기단 — 로스터에 기종이 없다
        overnight: el.day > sl.day,
        report_time: rl ? rl.hm : null,
      })
    } else if (t.startsWith('DH')) {
      deadheads++
    } else if (OFF_TYPES.has(t) || t.startsWith('LEAVE')) {
      offDays++
    } else if (SBY_TOKENS.some((k) => t.includes(k))) {
      standbyDays++
    }
    // NDA-LayOver 등 나머지는 조용히 지나간다
  }

  if (!flights.length) return null
  const dates = flights.map((f) => f.flight_date).sort()
  const first = dates[0]
  const last = dates[dates.length - 1]
  let period: { start: string; end: string }
  if (first.slice(0, 7) === last.slice(0, 7)) {
    const y = Number(first.slice(0, 4))
    const mo = Number(first.slice(5, 7))
    period = { start: `${first.slice(0, 7)}-01`, end: `${first.slice(0, 7)}-${pad(new Date(y, mo, 0).getDate())}` }
  } else {
    period = { start: first, end: last }
  }
  return {
    period,
    flights,
    stats: { flights: flights.length, offDays, standbyDays },
    notes: deadheads
      ? [`Skipped ${deadheads} deadhead (DH) leg(s) — add them manually if you need them.`]
      : undefined,
  }
}
