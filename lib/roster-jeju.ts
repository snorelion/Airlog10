// Jeju Air (CrewConnex) "Roster" 파서
// 실파일(01Aug26 to 31Aug26, 2쪽)로 26편 검증 — 2026-08-10
//
// ⚠️ 이 PDF는 **콘텐츠가 0.5 배율 + y축 뒤집기(CTM)** 로 그려져 있다.
//    로컬 pypdf는 변환 전 텍스트 좌표(x 18~933)를, 서버 unpdf(pdfjs)는 변환 후
//    좌표(x 36~563)를 준다. pypdf 좌표로 컬럼 경계를 박은 1차 버전은 그래서 전부
//    빗나갔고, y가 뒤집힌 탓에 "로스터가 역순"이라는 오판까지 했다(실제로는 정상
//    순서다). 게다가 서버는 칸을 합치기도("GMP 2359") 쪼개기도("Sat","01","Aug") 한다.
//
// → **좌표를 아예 쓰지 않는다.** 줄(y 묶음)만 만들고 토큰을 공백으로 쪼갠 뒤
//    **종류로 판독**한다 — 공항 3글자 · 시각 4자리(+N) · 기종 3자리 · HL 등록번호.
//    (메모리의 교훈 그대로: "칸 순서 의존 금지, 토큰을 종류로 분류하는 방식이 안전")
//
// 줄 판독 규칙:
//  · 날짜: 줄 텍스트의 "Sat 01 Aug"(요일+일+월). 그날 첫 활동 줄에 함께 있고,
//    이어지는 편은 날짜가 없으므로 직전 날짜를 물려받는다
//  · 비행: **공항·시각·시각·공항·시각·시각 여섯 토큰이 연속**하고(출발지·STD(L)·STD(B)·
//    도착지·STA(L)·STA(B)) 그 **뒤에 기종(738)이나 HL 등록번호가 있는** 줄.
//    OFF·스탠바이도 "GMP 0000 0000 GMP 2359 2359"로 같은 여섯 토큰이 나오지만
//    기종·등록번호가 없어 갈리고, LAYOV(숙박)는 그 자리에 호텔 이름이 온다
//  · 시각은 (L)현지·(B)베이스 두 벌 — **(L)만 쓴다** (UTC 변환은 앱 RosterTime 몫)
//  · 편명 찾기(우선순위): ① 줄 안의 "7C####"(붙어 나오는 경우) → ② **아래·위 줄의
//    외딴 번호** — Activity 칸이 번호와 "7C"를 두 줄로 그려서, 번호만 있는 줄이
//    비행 줄 바로 곁에 온다 → ③ 여섯 토큰 바로 앞의 번호("7C"는 건너뜀) → ④ 페어링(F119)
//    로스터는 0을 채워 "0119"로 적지만 실제 편명은 7C119 — 앞의 0을 뗀다

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

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** "Sat 01 Aug" — 서버가 "Sat","01","Aug"로 쪼개도 이어붙인 줄 텍스트에서는 이 모양이다 */
const DATE_RE = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*(\d{1,2})\s*([A-Za-z]{3})/
const AIRPORT_RE = /^[A-Z]{3}$/
const NUM_RE = /^\d{3,4}$/
const TYPE_RE = /^\d{3}$/

const TYPE_MAP: Record<string, string> = {
  '738': 'B737-800',
  '739': 'B737-900',
}

/**
 * ⚠️ 이 판정을 **편명이나 "CrewConnex"로 하면 안 된다** (2026-08-09 실기에서 잡았다).
 *  · "CrewConnex"는 **파일 이름에만** 있고 본문에는 없다
 *  · 편명은 PDF가 "7C"와 번호를 따로 뱉어서 `\b7C\d{3,4}\b` 는 한 건도 안 걸린다
 * 베이스 시각 컬럼(STD(B)·STA(B))이 이 양식만의 표시다 — 현지·베이스를 나란히 적는
 * 로스터는 지금까지 이것뿐이다.
 */
export function isJejuRoster(text: string): boolean {
  return /STD\(B\)/i.test(text) && /STA\(B\)/i.test(text)
}

/** "Period: 01Aug26 to 31Aug26" → 연·월 */
function period(text: string): { year: number; month: number } | null {
  const m = /Period:\s*\d{1,2}([A-Za-z]{3})(\d{2})/i.exec(text)
  if (!m) return null
  const mo = MONTHS[m[1].toLowerCase()]
  return mo ? { year: 2000 + Number(m[2]), month: mo } : null
}

/** "1455" → 14:55 · "0145+1" → 01:45 (다음 날). 시각이 아니면 null */
function timeTok(s: string): { hm: string; plus: number } | null {
  const m = /^(\d{2})(\d{2})(?:\+(\d))?$/.exec(s)
  if (!m) return null
  if (Number(m[1]) > 23 || Number(m[2]) > 59) return null
  return { hm: `${m[1]}:${m[2]}`, plus: m[3] ? Number(m[3]) : 0 }
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

export async function parseJejuRoster(pdf: PdfLike): Promise<{
  period: { year: number; month: number } | null
  flights: JejuRosterFlight[]
  /** 못 읽었을 때 라우트가 에러에 실어 보내는 진단 — 서버가 실제로 본 것.
   *  로컬에 Node가 없어 unpdf를 못 돌리므로 이게 원인을 찾는 가장 빠른 길이다. */
  debug?: string
}> {
  // 쪽 → 줄(위에서 아래) → 토큰(왼쪽에서 오른쪽, 공백으로 쪼갬)
  const pages: string[][][] = []
  const fullParts: string[] = []
  let rawCount = 0
  let rawMinX = Infinity
  let rawMaxX = -Infinity
  const rawSample: string[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const items: { t: string; x: number; y: number }[] = []
    for (const raw of tc.items as { str?: string; transform?: number[] }[]) {
      const t = (raw.str ?? '').replace(/\u200B/g, '').trim()
      if (!t || !raw.transform) continue
      const x = raw.transform[4]
      if (p === 1) {
        rawCount++
        if (x < rawMinX) rawMinX = x
        if (x > rawMaxX) rawMaxX = x
        if (rawSample.length < 12) rawSample.push(`${t}@${Math.round(x)},${Math.round(raw.transform[5])}`)
      }
      items.push({ t, x, y: raw.transform[5] })
      fullParts.push(t)
    }
    // 같은 y = 한 줄 (0.5 단위로 흔들림 흡수)
    // ⚠️ Map 을 직접 for…of 로 돌리면 이 레포 빌드 타깃에서 깨진다 → Array.from
    const byRow = new Map<number, { t: string; x: number }[]>()
    for (const it of items) {
      const key = Math.round(it.y * 2) / 2
      const bucket = byRow.get(key)
      if (bucket) bucket.push(it)
      else byRow.set(key, [it])
    }
    pages.push(
      Array.from(byRow.entries())
        .sort((a, b) => b[0] - a[0])                     // 위 → 아래
        .map((e) =>
          e[1]
            .sort((a, b) => a.x - b.x)
            .flatMap((i) => i.t.split(/\s+/))
            .filter(Boolean)
        )
    )
  }

  const dbg =
    `쪽${pdf.numPages} 조각${rawCount} x${Math.round(rawMinX)}~${Math.round(rawMaxX)} | ` +
    rawSample.join(' ')

  const p = period(fullParts.join(' '))
  if (!p) return { period: null, flights: [], debug: `기간 못 읽음 · ${dbg}` }

  const lastDay = new Date(p.year, p.month, 0).getDate()
  const out: JejuRosterFlight[] = []

  /** "번호만 있는 줄"의 번호 — 3~4자리 숫자 토큰이 정확히 하나일 때만.
   *  비행 줄은 시각(4자리)이 여럿이라 절대 걸리지 않고, 크루 사번은 7자리라 안 걸린다. */
  const loneNum = (row?: string[]): string | null => {
    if (!row) return null
    const nums = row.filter((t) => NUM_RE.test(t))
    return nums.length === 1 ? nums[0] : null
  }

  for (const rows of pages) {
    let curDay: number | null = null

    for (let i = 0; i < rows.length; i++) {
      const toks = rows[i]
      const joined = toks.join(' ')

      // 날짜 — 그날 첫 활동 줄에 함께 있다 (다른 달이면 그 구간은 버린다)
      const dm = DATE_RE.exec(joined)
      if (dm) {
        const mo = MONTHS[dm[2].toLowerCase()]
        if (mo === p.month) {
          const d = Number(dm[1])
          curDay = d >= 1 && d <= lastDay ? d : null
        } else if (mo !== undefined) {
          curDay = null
        }
      }

      // 핵심 여섯 토큰: 공항 · 시각 · 시각 · 공항 · 시각 · 시각
      let core = -1
      for (let k = 0; k + 5 < toks.length; k++) {
        if (
          AIRPORT_RE.test(toks[k]) && timeTok(toks[k + 1]) && timeTok(toks[k + 2]) &&
          AIRPORT_RE.test(toks[k + 3]) && timeTok(toks[k + 4]) && timeTok(toks[k + 5])
        ) { core = k; break }
      }
      if (core < 0 || curDay == null) continue

      // 기종(738)이나 HL 등록번호가 핵심 뒤에 있어야 비행이다 — OFF·스탠바이·숙박을 거른다
      const tail = toks.slice(core + 6)
      const type = tail.find((t) => TYPE_RE.test(t))
      const hasReg = tail.some((t) => /^HL/.test(t))     // 게이트와 붙어 "HL808920-54"로 올 수 있다
      if (!type && !hasReg) continue

      // 편명 번호
      let num: string | null = null
      const m7c = /7C\s?(\d{3,4})/.exec(joined)          // "18117C1811"처럼 붙어 나오는 경우까지
      if (m7c) num = m7c[1]
      if (!num) num = loneNum(rows[i + 1]) ?? loneNum(rows[i - 1])
      if (!num) {
        // 핵심 바로 앞의 번호 — "7C"만 건너뛰고 한 칸만 본다
        // (더 거슬러 올라가면 체크인 시각을 편명으로 오인한다)
        for (let k = core - 1; k >= 0; k--) {
          if (toks[k] === '7C') continue
          if (NUM_RE.test(toks[k])) num = toks[k]
          break
        }
      }
      if (!num) {
        const pm = /\bF(\d{3,4})/.exec(joined)           // 페어링 F119 → 119 (최후의 수단)
        if (pm) num = pm[1]
      }
      if (!num) continue

      const st = timeTok(toks[core + 1])
      const fi = timeTok(toks[core + 4])
      if (!st || !fi) continue

      out.push({
        flight_date: iso(p.year, p.month, curDay),
        flight_number: `7C${Number(num)}`,               // "0119" → 7C119
        origin: toks[core],
        destination: toks[core + 3],
        std: st.hm,
        sta: fi.hm,
        aircraft_type: type ? (TYPE_MAP[type] ?? type) : null,
        overnight: fi.plus > 0 || fi.hm < st.hm,
      })
    }
  }

  out.sort((a, b) =>
    a.flight_date.localeCompare(b.flight_date) || (a.std ?? '').localeCompare(b.std ?? ''))
  return { period: p, flights: out, debug: out.length ? undefined : `비행 0편(v2) · ${dbg}` }
}
