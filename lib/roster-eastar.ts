// Eastar Jet "Crew Roster Report" 로스터 파서
// 실파일(1 August 2026 - 31 August 2026, 4쪽) 검증 — 2026-08-09
//
// 형식 (Lion·Peach·Thai와 또 다르다):
//  · **한 줄이 한 활동인 표.** 컬럼이 일정한 x에 선다 (모든 쪽 동일, 실측):
//      Date44  DC95  Activity118  C/I160  C/O193  From231  Start263  To306  Finish336  ACType383 … A/CReg756
//  · 날짜는 **그날 첫 줄에만** 있다 — 이어지는 편은 날짜 칸이 비므로 직전 날짜를 물려받는다
//  · 시각은 네 자리(1129)이고 **각 공항 현지시각**이다 (컬럼 이름이 Start(L)·Finish(L)).
//    UTC 변환은 앱의 RosterTime이 맡는다 — 여기서 손대지 않는다 (Thai·Peach와 같은 정책)
//  · 비행이 아닌 활동이 섞인다: DO·RDO(휴무) · OFP-Z(교육) · NS(나이트스톱) · DH(데드헤드)
//    → **편명이 ZE###인 줄만** 비행으로 본다
//  · ⚠️ 자정을 넘으면 도착 시각에 `+N`이 붙는다 (실파일 8/20 NS 줄의 `0350+2` = 이틀 뒤 03:50).
//    비행 편에도 붙을 수 있으므로 읽어서 overnight으로 넘긴다
//  · ⚠️ **여러 쪽이다.** 라우트는 1쪽만 읽으므로 여기서 문서 전체를 받아 순회한다 (Peach와 같은 방식)
//
// 데드헤드(DH)는 **넣지 않는다** — 편명이 없어서 중복 판정과 화면 표기가 다른 로스터와 어긋난다.
// 대신 몇 건이었는지 세어 돌려주고, 라우트가 "직접 넣어 주세요"로 알린다.

export type EastarRosterFlight = {
  flight_date: string
  flight_number: string
  origin: string | null
  destination: string | null
  std: string | null
  sta: string | null
  aircraft_type: string | null
  overnight: boolean
}

/** unpdf 문서에서 우리가 쓰는 부분만 (Peach 파서와 같은 형태) */
type PdfLike = {
  numPages: number
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>
}

type Item = { t: string; x: number; y: number }

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** 컬럼 경계 [시작, 끝) — 실파일 실측. 값 형태로 한 번 더 거르므로 조금 어긋나도 버틴다 */
const C_DATE = [0, 90] as const
const C_ACT = [115, 158] as const
const C_FROM = [228, 260] as const
const C_START = [260, 302] as const
const C_TO = [302, 332] as const
const C_FINISH = [332, 378] as const
const C_TYPE = [378, 425] as const

const DATE_CELL = /^(\d{2})([A-Za-z]{3})(\d{2})$/
const FLIGHT_RE = /^ZE\d{2,4}$/i
const AIRPORT_RE = /^[A-Z]{3}$/
const TYPE_RE = /^[0-9A-Z]{3}$/

/** 이스타젯이 쓰는 기종 약어 → 앱 표기 (모르는 코드는 원본을 그대로 둔다) */
const TYPE_MAP: Record<string, string> = {
  '73H': 'B737-800',
  '738': 'B737-800',
  '73J': 'B737-900',
  '739': 'B737-900',
  '7M8': 'B737 MAX 8',
}

export function isEastarRoster(text: string): boolean {
  // "Crew Roster Report"만으로는 다른 회사도 쓸 수 있어 ZE 편명을 함께 본다
  return /Crew\s*Roster\s*Report/i.test(text) && /\bZE\d{2,4}\b/i.test(text)
}

/** "Period: 1. August 2026 - 31. August 2026" → 연·월. 없으면 첫 날짜 칸(01Aug26)에서 */
function period(text: string): { year: number; month: number } | null {
  const m = /Period:\s*\d{1,2}\.\s*([A-Za-z]+)\s+(\d{4})/i.exec(text)
  if (m) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]
    if (mo) return { year: Number(m[2]), month: mo }
  }
  const d = /\b\d{2}([A-Za-z]{3})(\d{2})\b/.exec(text)
  if (!d) return null
  const mo = MONTHS[d[1].toLowerCase()]
  return mo ? { year: 2000 + Number(d[2]), month: mo } : null
}

/** "1129" → 11:29 · "0350+2" → 03:50 (이틀 뒤). 시각이 아니면 null */
function timeCell(s: string): { hm: string; plus: number } | null {
  const m = /^(\d{2})(\d{2})(?:\+(\d))?$/.exec(s)
  if (!m) return null
  if (Number(m[1]) > 23 || Number(m[2]) > 59) return null
  return { hm: `${m[1]}:${m[2]}`, plus: m[3] ? Number(m[3]) : 0 }
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

export async function parseEastarRoster(pdf: PdfLike): Promise<{
  period: { year: number; month: number } | null
  flights: EastarRosterFlight[]
  deadheads: number
}> {
  // 쪽별로 좌표와 함께 조각을 모은다 — 날짜 물려받기가 쪽을 넘어가면 안 되므로 쪽 단위로 둔다
  const pages: Item[][] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const items: Item[] = []
    for (const raw of tc.items as { str?: string; transform?: number[] }[]) {
      const t = (raw.str ?? '').replace(/\u200B/g, '').trim()
      if (t && raw.transform) items.push({ t, x: raw.transform[4], y: raw.transform[5] })
    }
    pages.push(items)
  }

  const all: string[] = []
  for (const pg of pages) for (const it of pg) all.push(it.t)
  const p = period(all.join(' '))
  if (!p) return { period: null, flights: [], deadheads: 0 }

  const lastDay = new Date(p.year, p.month, 0).getDate()
  const out: EastarRosterFlight[] = []
  let deadheads = 0

  for (const items of pages) {
    // 같은 y = 한 줄. 소수점 흔들림을 흡수하려고 0.5 단위로 묶는다
    // (⚠️ Map 을 직접 for…of 로 돌리면 이 레포 빌드 타깃에서 깨진다 → Array.from)
    const byRow = new Map<number, Item[]>()
    for (const it of items) {
      const key = Math.round(it.y * 2) / 2
      const bucket = byRow.get(key)
      if (bucket) bucket.push(it)
      else byRow.set(key, [it])
    }
    const rows = Array.from(byRow.entries())
      .sort((a, b) => b[0] - a[0])                       // 위 → 아래
      .map((e) => e[1].sort((a, b) => a.x - b.x))

    let curDay: number | null = null
    for (const row of rows) {
      const pick = (c: readonly [number, number]) =>
        row.filter((i) => i.x >= c[0] && i.x < c[1]).map((i) => i.t)
      const firstTime = (cells: string[]) => {
        for (const s of cells) {
          const v = timeCell(s)
          if (v) return v
        }
        return null
      }

      // 날짜 칸이 있으면 갱신 — 없으면 직전 날짜의 이어지는 편이다
      for (const cell of pick(C_DATE)) {
        const m = DATE_CELL.exec(cell)
        if (!m) continue
        const mo = MONTHS[m[2].toLowerCase()]
        curDay = mo === p.month ? Number(m[1]) : null    // 다른 달 줄은 건너뛴다
        break
      }
      if (curDay == null || curDay > lastDay) continue

      // 'OFP-Z'처럼 한 칸이 조각나서 오는 경우가 있어 이어 붙인다
      const act = pick(C_ACT).join('').toUpperCase()
      if (act === 'DH') { deadheads++; continue }
      if (!FLIGHT_RE.test(act)) continue                 // DO·RDO·OFP-Z·NS 등은 비행이 아니다

      const from = pick(C_FROM).find((t) => AIRPORT_RE.test(t)) ?? null
      const to = pick(C_TO).find((t) => AIRPORT_RE.test(t)) ?? null
      const st = firstTime(pick(C_START))
      const fi = firstTime(pick(C_FINISH))
      const type = pick(C_TYPE).find((t) => TYPE_RE.test(t))

      out.push({
        flight_date: iso(p.year, p.month, curDay),
        flight_number: act,                              // ZE631 — 이미 항공사 코드가 붙어 있다
        origin: from,
        destination: to,
        std: st ? st.hm : null,
        sta: fi ? fi.hm : null,
        aircraft_type: type ? (TYPE_MAP[type] ?? type) : null,
        // `+N` 표기가 우선이고, 표기 없이 도착이 출발보다 이른 경우도 자정 넘김으로 본다
        overnight: (fi ? fi.plus : 0) > 0 || (!!st && !!fi && fi.hm < st.hm),
      })
    }
  }

  return { period: p, flights: out, deadheads }
}
