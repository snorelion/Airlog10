// Thai Lion Air "Personal Crew Schedule Report" — **목록형(long)** 로스터 파서
// (2026-08-25, 실파일 sche_lionair_long.pdf로 검증: 30레그·OFF 8·SBY 4·비행일 13 = 문서 통계와 일치)
//
// 같은 제목의 **격자형**(날짜=컬럼, 1쪽)은 route.ts의 기본 파서가 맡는다. 이 양식은:
//   · 여러 쪽 세로 목록 — Date | Duties | Details | Report | Actual | Debrief | Indicators | Crew
//   · 셀 내용이 행의 **세로 가운데**에 정렬 — 레그가 많은 날은 첫 레그가 날짜보다 위에 그려진다
//     → 행 배정은 y-범위가 아니라 **가장 가까운 날짜 앵커**로 해야 한다 (범위로 하면 앞 날로 샌다)
//   · 시각은 "(All times in Local Station)" = 공항 현지 — 앱 RosterTime 기본 규칙과 동일
//   · 자정 넘김은 위첨자 ⁺¹(글꼴에 따라 '+1' 조각) — **출발에 붙으면 flight_date를 그만큼 민다**
//     (SL921: 6일 행이지만 01:20⁺¹ = 7일 출발. Premia 파서와 같은 정책 — 알림·홈 카드가 맞으려면 필수)
//   · OFF=휴무, SB2/SB3/SB4=스탠바이, FTL=훈련 — 비행 아님. 크루 명단 컬럼은 통째로 버린다
//   · 멀티섹터는 같은 편명이 연달아 온다 (SL394 DMK-TPE, SL394 TPE-NRT) — legKey가 구간으로 가른다

export type LionLongFlight = {
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

export type LionLongResult = {
  period: { start: string; end: string }
  flights: LionLongFlight[]
  stats: { flights: number; offDays: number; standbyDays: number }
}

/** unpdf 문서에서 우리가 쓰는 부분만 (다른 로스터 파서들과 같은 형태) */
type PdfLike = {
  numPages: number
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>
}

type It = { t: string; x: number; y: number }

const TYPE_MAP: Record<string, string> = {
  T738: 'B737-800',
  T739: 'B737-900',
  T79A: 'B737-900',
}

const HEADERS = ['Date', 'Duties', 'Details', 'Report', 'Actual', 'Debrief', 'Indicators', 'Crew']
const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})/

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO 날짜 + n일 (출발 ⁺N 반영용) */
function addDays(day: string, n: number): string {
  if (!n) return day
  const d = new Date(Date.UTC(
    Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + n))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** 위첨자 ⁺¹/⁺²(또는 '+1' 조각)를 시각에 붙여 "HH:MM+N"으로 정규화 */
function normSup(s: string): string {
  return s.replace(/(\d{2}:\d{2})\s*[⁺+]\s*([¹²³123])/g, (_m, t: string, d: string) => {
    const i = '¹²³'.indexOf(d)
    return t + '+' + (i >= 0 ? String(i + 1) : d)
  })
}

/** 문자열에서 시각들을 순서대로 — { hm: "00:15", plus: 1 } */
function timesOf(s: string): { hm: string; plus: number }[] {
  const out: { hm: string; plus: number }[] = []
  const re = /(\d{2}):(\d{2})(?:\+(\d))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (Number(m[1]) > 23 || Number(m[2]) > 59) continue
    out.push({ hm: `${m[1]}:${m[2]}`, plus: m[3] ? Number(m[3]) : 0 })
  }
  return out
}

export function isLionLongRoster(text: string): boolean {
  const c = text.replace(/\s+/g, '')
  return c.includes('PersonalCrewScheduleReport')
    && c.includes('ScheduleDetails')
    && c.includes('Debrieftimes')
}

export async function parseLionLongRoster(pdf: PdfLike): Promise<LionLongResult | null> {
  const flights: LionLongFlight[] = []
  let offDays = 0
  let standbyDays = 0
  let period: { start: string; end: string } | null = null

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const items: It[] = []
    for (const raw of tc.items as { str?: string; transform?: number[] }[]) {
      const t = (raw.str ?? '').replace(/\u200B/g, '').trim()
      if (t && raw.transform) items.push({ t, x: raw.transform[4], y: raw.transform[5] })
    }
    if (!items.length) continue

    if (!period) {
      const joined = items.map((i) => i.t).join(' ')
      const pm = /(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(joined)
      if (pm) period = { start: `${pm[3]}-${pm[2]}-${pm[1]}`, end: `${pm[6]}-${pm[5]}-${pm[4]}` }
    }

    // 헤더 컬럼 x — 같은 문구가 본문에 또 있어도 **가장 위(y 최대)** 것이 헤더다
    const hx: Record<string, { x: number; y: number } | undefined> = {}
    for (const it of items) {
      for (const k of HEADERS) {
        if (!it.t.startsWith(k)) continue
        const cur = hx[k]
        if (!cur || it.y > cur.y) hx[k] = { x: it.x, y: it.y }
      }
    }
    const dutH = hx['Duties']
    if (!dutH || !hx['Details'] || !hx['Date']) continue   // 스케줄 표가 없는 쪽 (만료일·호텔 등)
    const headerY = dutH.y

    // 표 바닥 — 통계 블록·쪽 번호 위까지만 본문이다
    let floor = 0
    for (const it of items) {
      if ((it.t.startsWith('Total Hours') || it.t.startsWith('Page ')) && it.y < headerY - 4 && it.y > floor) {
        floor = it.y
      }
    }

    const colsArr: { k: string; x: number }[] = []
    for (const k of HEADERS) {
      const h = hx[k]
      if (h && Math.abs(h.y - headerY) < 8) colsArr.push({ k, x: h.x })
    }
    colsArr.sort((a, b) => a.x - b.x)
    if (colsArr.length < 4) continue
    const bounds: number[] = []
    for (let i = 0; i < colsArr.length - 1; i++) bounds.push((colsArr[i].x + colsArr[i + 1].x) / 2)
    const colOf = (x: number): string => {
      for (let i = 0; i < bounds.length; i++) if (x < bounds[i]) return colsArr[i].k
      return colsArr[colsArr.length - 1].k
    }

    const body = items.filter((i) => i.y > floor && i.y < headerY - 2)

    // 날짜 앵커(행 중심) — 셀이 세로 가운데 정렬이라 각 토큰은 가장 가까운 앵커의 행이다
    const rows: { date: string; y: number; items: It[] }[] = []
    for (const it of body) {
      if (colOf(it.x) !== 'Date') continue
      const m = DATE_RE.exec(it.t)
      if (m) rows.push({ date: `${m[3]}-${m[2]}-${m[1]}`, y: it.y, items: [] })
    }
    if (!rows.length) continue
    rows.sort((a, b) => b.y - a.y)
    for (const it of body) {
      const c = colOf(it.x)
      if (c === 'Date' || c === 'Indicators' || c === 'Crew') continue
      let best = rows[0]
      for (const r of rows) if (Math.abs(it.y - r.y) < Math.abs(it.y - best.y)) best = r
      best.items.push(it)
    }

    for (const row of rows) {
      row.items.sort((a, b) => (b.y - a.y) || (a.x - b.x))
      const colText: Record<string, string> = {}
      for (const it of row.items) {
        const c = colOf(it.x)
        colText[c] = colText[c] ? colText[c] + ' ' + it.t : it.t
      }
      const duties = colText['Duties'] ?? ''
      const details = colText['Details'] ?? ''
      if (/\bOFF\b/.test(duties)) { offDays++; continue }
      if (/\bSB\d?\b/.test(duties)) { standbyDays++; continue }
      if (/\bFTL\b/.test(duties) || /Training/.test(details)) continue

      // 편명 [기종] 목록 — 기종 괄호가 딴 조각으로 왔으면 순서로 다시 짝짓는다
      const legs: { num: string; type: string | null }[] = []
      {
        const re = /\b([A-Z]{2}\d{2,4})\b(?:\s*\[(\w+)\])?/g
        let m: RegExpExecArray | null
        while ((m = re.exec(duties))) legs.push({ num: m[1], type: m[2] ?? null })
      }
      if (!legs.length) continue
      const typeList: string[] = []
      {
        const re = /\[(\w+)\]/g
        let m: RegExpExecArray | null
        while ((m = re.exec(duties))) typeList.push(m[1])
      }
      const routes: [string, string][] = []
      {
        const re = /\b([A-Z]{3})\s{0,4}-\s{0,4}([A-Z]{3})\b/g
        let m: RegExpExecArray | null
        while ((m = re.exec(details))) routes.push([m[1], m[2]])
      }

      const times = timesOf(normSup((colText['Report'] ?? '') + ' ' + (colText['Actual'] ?? '')))
      const report = times.length === 1 + legs.length * 2 ? times[0] : null
      const legTimes = report ? times.slice(1) : times
      const debTimes = timesOf(normSup(colText['Debrief'] ?? ''))
      const debrief = debTimes.length ? debTimes[debTimes.length - 1].hm : null

      const firstIdx = flights.length
      for (let i = 0; i < legs.length; i++) {
        const std = legTimes[2 * i] ?? null
        const sta = legTimes[2 * i + 1] ?? null
        const typ = legs[i].type ?? typeList[i] ?? null
        const f: LionLongFlight = {
          flight_date: addDays(row.date, std ? std.plus : 0),
          flight_number: legs[i].num,
          origin: routes[i] ? routes[i][0] : null,
          destination: routes[i] ? routes[i][1] : null,
          std: std ? std.hm : null,
          sta: sta ? sta.hm : null,
          aircraft_type: typ ? (TYPE_MAP[typ] ?? typ) : null,
          overnight: !!(sta && std && sta.plus > std.plus),
        }
        // 편명만 있고 구간·시각이 전혀 없는 줄은 넣지 않는다 (격자 파서의 bare 보호와 동일)
        if (!f.origin && !f.destination && !f.std && !f.sta) continue
        flights.push(f)
      }
      if (flights.length > firstIdx) {
        flights[firstIdx].report_time = report ? report.hm : null
        flights[firstIdx].duty_end_time = debrief
      }
    }
  }

  if (!flights.length) return null
  if (!period) {
    const ds = flights.map((f) => f.flight_date).sort()
    period = { start: ds[0], end: ds[ds.length - 1] }
  }
  return { period, flights, stats: { flights: flights.length, offDays, standbyDays } }
}
