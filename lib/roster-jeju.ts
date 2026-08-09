// Jeju Air (CrewConnex) "Roster" 파서
// 실파일(01Aug26 to 31Aug26, 2쪽)로 검증 — 2026-08-09
//
// 형식 (Lion·Peach·Thai·Eastar와 또 다르다):
//  · 컬럼이 일정한 x에 서는 표. 실측:
//      Date18 · Pairing79 · T/L176 · C/I194 · C/O222 · Roster260 · Activity304 ·
//      From351 · STD(L)377 · STD(B)410 · To455 · STA(L)476 · STA(B)514 ·
//      ACType563 · BLH651 · ACReg689 · **크루 명단 761 이상**
//  · ⚠️ **크루 명단(사번·이름·직책·자격)이 편마다 여러 줄 딸려온다.** x가 720을 넘으므로
//    좌표로 잘라낸다. 안 자르면 이름 조각이 값으로 섞여 들어온다
//  · ⚠️ **시각이 두 벌이다** — (L)은 공항 현지, (B)는 베이스(한국). **(L)을 쓴다.**
//    UTC 변환은 앱의 RosterTime이 맡는 정책이라 Thai·Peach·Eastar와 같은 자리에 맞춘다
//    (실파일 HAN 출발이 현지 0045 / 베이스 0245 — 베트남과 한국의 두 시간 차이가 그대로 보인다)
//  · ⚠️ **편명이 두 줄에 걸쳐 렌더된다.** Activity 칸(x304)의 아랫줄에 "7C", 그 윗줄에 번호가 온다.
//    Roster 칸(x260)에도 같은 번호가 있지만 **그날 첫 편은 비어 있어서**, 둘 다 본다
//  · ⚠️ **로스터가 역순이다.** 맨 위가 가장 나중 날짜이고, 같은 날의 편들은 **날짜 줄보다 위에**
//    쌓인다. 그래서 위에서 아래로 읽으며 편을 모아 두었다가, 날짜 줄을 만나면 그때 몰아서
//    그 날짜를 준다. 순서대로 읽으면 날짜가 통째로 하루씩 밀린다
//  · 비행이 아닌 활동: OFF · ROFF · SA1/SB2(스탠바이) · RSV_F(예비) · LAYOV(숙박)
//    → **Activity 칸에 "7C"가 있는 줄만** 비행으로 본다

export type JejuRosterFlight = {
  flight_date: string
  flight_number: string
  origin: string | null
  destination: string | null
  std: string | null
  sta: string | null
  aircraft_type: string | null
  overnight: boolean
}

/** unpdf 문서에서 우리가 쓰는 부분만 (Peach·Eastar 파서와 같은 형태) */
type PdfLike = {
  numPages: number
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>
}

type Item = { t: string; x: number; y: number }
type Row = { y: number; items: Item[] }

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** 컬럼 경계 [시작, 끝) — 실파일 실측. 값 형태로 한 번 더 거르므로 조금 어긋나도 버틴다 */
const C_DATE = [0, 70] as const
const C_PAIRING = [70, 170] as const
const C_ROSTER = [250, 300] as const
const C_ACT = [300, 345] as const
const C_FROM = [345, 372] as const
const C_STD_L = [372, 405] as const
const C_TO = [450, 472] as const
const C_STA_L = [472, 510] as const
const C_TYPE = [555, 610] as const
/** 크루 명단이 시작되는 x — 여기부터는 통째로 버린다 */
const CREW_X = 720

/** "Sun 23 Aug" — 요일이 붙어 있어 다른 숫자와 헷갈리지 않는다 */
const DATE_CELL = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+([A-Za-z]{3})$/
const NUM4 = /^\d{3,4}$/
const AIRPORT_RE = /^[A-Z]{3}$/
const TYPE_RE = /^\d{3}$/

const TYPE_MAP: Record<string, string> = {
  '738': 'B737-800',
  '739': 'B737-900',
  '73H': 'B737-800',
  '7M8': 'B737 MAX 8',
}

export function isJejuRoster(text: string): boolean {
  // CrewConnex는 다른 회사도 쓸 수 있어 7C 편명을 함께 본다
  return /CrewConnex/i.test(text) || (/\b7C\d{3,4}\b/.test(text) && /Pairing/i.test(text))
}

/** "Period: 01Aug26 to 31Aug26" → 연·월 */
function period(text: string): { year: number; month: number } | null {
  const m = /Period:\s*\d{1,2}([A-Za-z]{3})(\d{2})/i.exec(text)
  if (!m) return null
  const mo = MONTHS[m[1].toLowerCase()]
  return mo ? { year: 2000 + Number(m[2]), month: mo } : null
}

/** "1455" → 14:55 · "0145+1" → 01:45 (다음 날). 시각이 아니면 null */
function timeCell(s: string): { hm: string; plus: number } | null {
  const m = /^(\d{2})(\d{2})(?:\+(\d))?$/.exec(s)
  if (!m) return null
  if (Number(m[1]) > 23 || Number(m[2]) > 59) return null
  return { hm: `${m[1]}:${m[2]}`, plus: m[3] ? Number(m[3]) : 0 }
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

const inCol = (items: Item[], c: readonly [number, number]) =>
  items.filter((i) => i.x >= c[0] && i.x < c[1]).map((i) => i.t)

export async function parseJejuRoster(pdf: PdfLike): Promise<{
  period: { year: number; month: number } | null
  flights: JejuRosterFlight[]
}> {
  // 쪽별로 줄을 만든다 — 날짜를 몰아 주는 처리가 쪽을 넘어가면 안 되므로 쪽 단위로 둔다
  const pages: Row[][] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const items: Item[] = []
    for (const raw of tc.items as { str?: string; transform?: number[] }[]) {
      const t = (raw.str ?? '').replace(/\u200B/g, '').trim()
      if (!t || !raw.transform) continue
      const x = raw.transform[4]
      if (x >= CREW_X) continue                      // 크루 명단은 통째로 버린다
      items.push({ t, x, y: raw.transform[5] })
    }
    // 같은 y = 한 줄 (소수점 흔들림은 0.5 단위로 흡수)
    // ⚠️ Map 을 직접 for…of 로 돌리면 이 레포 빌드 타깃에서 깨진다 → Array.from
    const byRow = new Map<number, Item[]>()
    for (const it of items) {
      const key = Math.round(it.y * 2) / 2
      const bucket = byRow.get(key)
      if (bucket) bucket.push(it)
      else byRow.set(key, [it])
    }
    pages.push(
      Array.from(byRow.entries())
        .sort((a, b) => b[0] - a[0])                 // 위 → 아래
        .map((e) => ({ y: e[0], items: e[1].sort((a, b) => a.x - b.x) }))
    )
  }

  const all: string[] = []
  for (const rows of pages) for (const r of rows) for (const it of r.items) all.push(it.t)
  const p = period(all.join(' '))
  if (!p) return { period: null, flights: [] }

  const lastDay = new Date(p.year, p.month, 0).getDate()
  const out: JejuRosterFlight[] = []

  for (const rows of pages) {
    // 날짜 줄을 만나기 전까지 모아 두는 편들 — 이 로스터는 날짜 줄이 **그날 편들의 맨 아래**에 온다
    let pending: Omit<JejuRosterFlight, 'flight_date'>[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const act = inCol(row.items, C_ACT)

      // 비행 줄인가 — **기종 칸(738)이 있을 때만.**
      //
      // ⚠️ 편명의 "7C" 조각으로 판정하면 안 된다. 실파일에서 **어떤 편은 "7C"가 아예
      //    추출되지 않는다**(8·9일 편들). 그걸 기준으로 삼았더니 그 이틀이 통째로 빠졌다.
      //    기종은 비행에만 있다 — 휴무·스탠바이는 그 칸이 비고, 숙박(LAYOV)은 호텔 이름이 온다.
      const type = inCol(row.items, C_TYPE).find((t) => TYPE_RE.test(t))
      if (type) {
        // 편명 번호: Roster 칸 → 없으면 **바로 윗줄**의 Activity 칸(그날 첫 편은 Roster가 빈다)
        // → 그래도 없으면 Pairing 칸("F119")
        let num = inCol(row.items, C_ROSTER).find((t) => NUM4.test(t))
        if (!num && i > 0) num = inCol(rows[i - 1].items, C_ACT).find((t) => NUM4.test(t))
        if (!num) num = act.find((t) => NUM4.test(t))
        if (!num) {
          const pair = inCol(row.items, C_PAIRING).find((t) => /^F\d{3,4}/.test(t))
          if (pair) num = pair.replace(/^F/, '').replace(/[^\d].*$/, '')
        }
        if (!num) continue                            // 번호를 못 찾으면 넣지 않는다

        const st = timeCellOf(inCol(row.items, C_STD_L))
        const fi = timeCellOf(inCol(row.items, C_STA_L))

        pending.push({
          // 로스터는 자리를 채워 "0119"로 적지만 실제 편명은 7C119다 — 앞의 0을 떼어 맞춘다
          flight_number: `7C${Number(num)}`,
          origin: inCol(row.items, C_FROM).find((t) => AIRPORT_RE.test(t)) ?? null,
          destination: inCol(row.items, C_TO).find((t) => AIRPORT_RE.test(t)) ?? null,
          std: st ? st.hm : null,
          sta: fi ? fi.hm : null,
          aircraft_type: type ? (TYPE_MAP[type] ?? type) : null,
          overnight: (fi ? fi.plus : 0) > 0 || (!!st && !!fi && fi.hm < st.hm),
        })
      }

      // 날짜 줄이면 여기까지 모인 편들에게 이 날짜를 준다 (그 줄 자체가 비행일 수도 있어 위에서 먼저 담았다)
      const dateCell = inCol(row.items, C_DATE).find((t) => DATE_CELL.test(t))
      if (!dateCell) continue
      const m = DATE_CELL.exec(dateCell)!
      const day = Number(m[1])
      const mo = MONTHS[m[2].toLowerCase()]
      if (mo === p.month && day >= 1 && day <= lastDay) {
        for (const f of pending) out.push({ flight_date: iso(p.year, p.month, day), ...f })
      }
      pending = []                                    // 다른 달이면 그 편들은 버린다
    }
  }

  // 화면에는 역순으로 놓여 있어 파싱 결과도 역순이다 — 날짜·시각 순으로 바로 세운다
  out.sort((a, b) =>
    a.flight_date.localeCompare(b.flight_date) || (a.std ?? '').localeCompare(b.std ?? ''))
  return { period: p, flights: out }
}

function timeCellOf(cells: string[]): { hm: string; plus: number } | null {
  for (const s of cells) {
    const v = timeCell(s)
    if (v) return v
  }
  return null
}
