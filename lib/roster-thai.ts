// Thai Airways "CREW SCHEDULE SLIP" 로스터 파서
// 실파일(01Aug26-31Aug26, 1쪽) 검증: 11편 · 자정 넘김 3편 · 훈련코드 4개 — 2026-08-08
//
// 형식 (Lion·Peach와 또 다르다):
//  · **가로 31일 달력 격자.** 맨 윗줄에 "1SAT 2SUN … 31MON", 각 날짜가 세로 칸 하나
//  · 한 칸에 **최대 4레그**가 세로로 쌓인다. 레그 하나는 다섯 줄:
//      FLT(편명) / DEP 공항 / DEP 시각 / ARR 공항 / ARR 시각
//  · 레그 사이 간격은 일정하다(실측 54pt) — 그래서 y를 절대값으로 박지 않고
//    왼쪽 'FLT' 라벨의 y를 기준으로 그 레그의 다섯 줄을 묶는다
//  · ⚠️ **자정을 넘는 편은 도착이 다음 날 칸 맨 위에 편명 없이 따로 적힌다.**
//    (23일 318편 BOM 23:35 출발 → 24일 칸에 "BKK 05:35"만) 이걸 모르면 도착을
//    엉뚱한 날의 다른 편에서 가져온다 — 실제로 처음엔 +5일짜리 비행이 나왔다
//  · CHMSBA350 같은 훈련·시뮬 코드가 편명 자리에 온다 → 숫자 3~4자리만 비행으로 본다
//  · 시각은 **각 공항의 현지시간** (2026-08-08 라이언님 확인). Peach와 같아
//    UTC 변환은 앱의 RosterTime(공항 시간대)이 맡는다 — 여기서는 손대지 않는다

export type ThaiItem = { t: string; x: number; y: number; w?: number }

export type ThaiRosterFlight = {
  flight_date: string
  flight_number: string
  origin: string | null
  destination: string | null
  std: string | null
  sta: string | null
  aircraft_type: string | null
  overnight: boolean
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
}

const DAY_RE = /(\d{1,2})(MON|TUE|WED|THU|FRI|SAT|SUN)/g
const TIME_RE = /^\d{1,2}:\d{2}$/
const AIRPORT_RE = /^[A-Z]{3}$/
const FLIGHT_RE = /^\d{3,4}$/

export function isThaiRoster(text: string): boolean {
  return /CREW\s*SCHEDULE\s*SLIP/i.test(text)
}

/**
 * "01Aug26-31Aug26" → 그 달의 연·월.
 *
 * ⚠️ "EFFECTIVE:" 라벨 뒤를 읽으면 안 된다 — 추출된 순서가
 * `EFFECTIVE: SYSDATE: 01Aug26-31Aug26 08Aug26` 처럼 **라벨이 먼저 몰리고 값이 나중에** 온다
 * (좌표 순서 때문. 2026-08-08 실측). 그래서 기간 표기 자체를 패턴으로 찾는다 —
 * 단독으로 있는 SYSDATE(08Aug26)는 범위 형태가 아니라 걸리지 않는다.
 */
function period(text: string): { year: number; month: number } | null {
  const m = text.match(/(\d{1,2})([A-Za-z]{3})(\d{2})\s*-\s*(\d{1,2})([A-Za-z]{3})(\d{2})/)
  if (!m) return null
  const month = MONTHS[m[2].toUpperCase()]
  if (!month) return null
  return { year: 2000 + Number(m[3]), month }
}

/**
 * 날짜 헤더에서 각 날짜 칸의 시작 x를 구한다.
 *
 * PDF 추출기가 "1SAT"을 낱개로 줄 때도 있고 "REMARK1SAT2SUN…"처럼 한 덩어리로 줄 때도 있다.
 * 낱개면 그 x를 그대로 쓰고, 덩어리면 폭(w)을 글자 수로 나눠 위치를 비례 계산한다
 * (표라서 등폭 폰트다). 둘 다 안 되면 잡힌 것들로 간격을 재 1~31일을 균등 배치한다.
 */
function dayColumns(items: ThaiItem[]): { day: number; x: number }[] {
  const singles = items
    .map((i) => ({ i, m: /^(\d{1,2})(MON|TUE|WED|THU|FRI|SAT|SUN)$/.exec(i.t) }))
    .filter((e) => e.m)
  if (singles.length >= 20) {
    const headerY = Math.max(...singles.map((e) => e.i.y))
    return singles
      .filter((e) => Math.abs(e.i.y - headerY) < 5)
      .map((e) => ({ day: Number(e.m![1]), x: e.i.x }))
      .sort((a, b) => a.x - b.x)
  }

  // 덩어리로 온 경우 — 날짜가 가장 많이 들어 있는 조각을 헤더로 본다
  let best: ThaiItem | null = null
  let bestCount = 0
  for (const it of items) {
    const n = (it.t.match(DAY_RE) || []).length
    if (n > bestCount) { best = it; bestCount = n }
  }
  if (!best || bestCount < 20) return []

  const width = best.w ?? 0
  const per = width > 0 ? width / best.t.length : 0
  // ⚠️ matchAll 을 for…of 로 돌리거나 펼치면 이 레포의 빌드 타깃에서 깨진다 → Array.from
  const out = Array.from(best.t.matchAll(DAY_RE)).map((m) => ({
    day: Number(m[1]),
    x: best!.x + (per > 0 ? (m.index ?? 0) * per : 0),
  }))
  if (per > 0) return out.sort((a, b) => a.x - b.x)

  // 폭조차 없으면 잡힌 날짜들로 균등 배치 (최후의 수단)
  const first = out[0], last = out[out.length - 1]
  const step = (last.x - first.x) / Math.max(1, last.day - first.day)
  return out.map((d) => ({ day: d.day, x: first.x + (d.day - first.day) * step }))
}

/** x → 날짜. 각 칸은 [자기 시작x, 다음 칸 시작x) */
function dayAt(cols: { day: number; x: number }[], x: number): number | null {
  for (let i = 0; i < cols.length; i++) {
    const next = i + 1 < cols.length ? cols[i + 1].x : Infinity
    if (x >= cols[i].x - 5 && x < next - 5) return cols[i].day
  }
  return null
}

/** 같은 줄(y가 tol 안)인 아이템을 x순으로 */
const rowAt = (items: ThaiItem[], y: number, tol = 3) =>
  items.filter((i) => Math.abs(i.y - y) <= tol).sort((a, b) => a.x - b.x)

/** 값 목록을 간격이 벌어지는 지점에서 묶는다 (y 클러스터) */
function cluster(values: number[], gap = 4): number[] {
  // ⚠️ [...new Set(…)] 은 이 레포 빌드 타깃에서 깨진다 (tsconfig에 target·downlevelIteration 없음)
  const sorted = Array.from(new Set(values)).sort((a, b) => b - a)
  const out: number[] = []
  for (const v of sorted) {
    if (!out.length || out[out.length - 1] - v > gap) out.push(v)
  }
  return out
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

export function parseThaiRoster(items: ThaiItem[]): {
  period: { year: number; month: number } | null
  flights: ThaiRosterFlight[]
  days?: { date: string; kind: 'off' | 'standby' | 'sim' | 'ground'; label: string | null }[]
} {
  const full = items.map((i) => i.t).join(' ')
  const p = period(full)
  const cols = dayColumns(items)
  if (!p || cols.length < 20) return { period: p, flights: [] }

  // 레그 기준선 — 왼쪽 여백의 'FLT' 라벨들
  const flt = items.filter((i) => i.x < 70 && /^FLT$/i.test(i.t)).sort((a, b) => b.y - a.y)
  if (!flt.length) return { period: p, flights: [] }

  const body = items.filter((i) => i.x >= 70)
  type Cell = { day: number; t: string; x: number; w?: number }
  const cellsOf = (y: number): Cell[] =>
    rowAt(body, y).map((i) => ({ day: dayAt(cols, i.x) ?? 0, t: i.t, x: i.x, w: i.w })).filter((c) => c.day > 0)

  // 날짜별 도착 후보 — 자정 넘김 편이 다음 날 칸에 남긴 "공항+시각"을 여기서 찾는다
  const arrivals = new Map<number, { ap: string; time: string }>()
  type Leg = { day: number; num: string; dep?: string; std?: string; arr?: string; sta?: string }
  const legs: Leg[] = []
  // 편명 자리에 오는 훈련·지상 코드 (2026-09-02 실측: CHMSBA350·CHMSBB350 = 시뮬 훈련 추정) —
  // 뜻이 확실치 않아 전부 회색(ground)으로 넣고 label에 원문을 보존한다.
  // 이 양식엔 오프 표기가 아예 없다(빈 칸 = 쉬는 날) — 명시된 코드만 줍고 빈 날은 건드리지 않는다
  const groundByDay = new Map<number, string>()

  for (const label of flt) {
    // 이 레그의 다섯 줄을 라벨 y 주변에서 클러스터로 집는다
    // (절대 y를 박으면 PDF가 조금만 달라져도 통째로 어긋난다)
    const near = body.filter((i) => i.y <= label.y + 8 && i.y >= label.y - 45)
    const lines = cluster(near.map((i) => i.y))
    if (lines.length < 5) continue
    const [yFlt, yDepAp, yDepT, yArrAp, yArrT] = lines

    const num = new Map<number, string>(), depAp = new Map<number, string>(),
          depT = new Map<number, string>(), arrAp = new Map<number, string>(),
          arrT = new Map<number, string>()
    for (const c of cellsOf(yFlt)) {
      num.set(c.day, c.t)
      // 훈련·지상 코드는 글자가 넓어 시작 x가 **전날 칸을 침범**한다 (실측: CHMSBA350 w=32.7,
      // 시작 기준 10일 ↔ 실제 11일) → 중심점(x+w/2)으로 날짜를 다시 정한다.
      // 편명·공항 등 좁은 토큰은 시작=중심(실측 58/58)이라 비행 경로는 손대지 않는다
      if (!FLIGHT_RE.test(c.t) && /^[A-Z]{3,8}\d{0,4}$/.test(c.t)) {
        const mid = dayAt(cols, c.x + (c.w ?? 0) / 2)
        if (mid !== null && !groundByDay.has(mid)) groundByDay.set(mid, c.t)
      }
    }
    for (const c of cellsOf(yDepAp)) depAp.set(c.day, c.t)
    for (const c of cellsOf(yDepT)) depT.set(c.day, c.t)
    for (const c of cellsOf(yArrAp)) arrAp.set(c.day, c.t)
    for (const c of cellsOf(yArrT)) arrT.set(c.day, c.t)

    // 도착만 있는 칸(편명 없음) = 전날 출발편이 자정을 넘겨 도착한 것
    // (Map 을 직접 for…of 로 돌리면 빌드 타깃에서 깨진다 → Array.from)
    for (const [day, ap] of Array.from(arrAp.entries())) {
      const time = arrT.get(day)
      if (!num.has(day) && AIRPORT_RE.test(ap) && time && TIME_RE.test(time)) {
        if (!arrivals.has(day)) arrivals.set(day, { ap, time })
      }
    }

    for (const [day, n] of Array.from(num.entries())) {
      if (!FLIGHT_RE.test(n)) continue        // 훈련 코드는 비행이 아니다 (위에서 중심점으로 수집)
      const leg: Leg = { day, num: n }
      const da = depAp.get(day), dt = depT.get(day)
      if (da && AIRPORT_RE.test(da)) leg.dep = da
      if (dt && TIME_RE.test(dt)) leg.std = dt
      const aa = arrAp.get(day), at = arrT.get(day)
      if (aa && AIRPORT_RE.test(aa)) leg.arr = aa
      if (at && TIME_RE.test(at)) leg.sta = at
      legs.push(leg)
    }
  }

  const days = new Date(p.year, p.month, 0).getDate()
  const out: ThaiRosterFlight[] = []
  for (const leg of legs.sort((a, b) => a.day - b.day || a.num.localeCompare(b.num))) {
    let { arr, sta } = leg
    let overnight = false

    if (!arr || !sta) {
      // 같은 칸에 도착이 없다 → 다음 날 칸에 편명 없이 남은 도착을 가져온다
      const next = arrivals.get(leg.day + 1)
      if (next) { arr = next.ap; sta = next.time; overnight = true; arrivals.delete(leg.day + 1) }
    } else if (leg.std && sta < leg.std) {
      overnight = true                        // 같은 칸인데 도착이 출발보다 이르다 = 자정 넘김
    }

    if (leg.day > days) continue
    out.push({
      flight_date: iso(p.year, p.month, leg.day),
      // 이 양식은 편명을 숫자만 적는다(954) — Lion(SL736)·Peach(MM031)처럼
      // 항공사 코드를 붙여 둬야 중복 판정과 화면 표기가 다른 로스터와 같아진다
      flight_number: `TG${leg.num}`,
      origin: leg.dep ?? null,
      destination: arr ?? null,
      std: leg.std ?? null,
      sta: sta ?? null,
      aircraft_type: null,                    // 이 양식에는 기종 칸이 없다
      overnight,
    })
  }

  // 하루 = 최대 한 행, 비행이 있는 날은 비행이 주인 (route.ts ParsedRosterDay 규칙)
  // ⚠️ Map 을 직접 for…of 로 돌리면 이 레포 빌드 타깃에서 깨진다 → Array.from
  const flightDates = new Set(out.map((f) => f.flight_date))
  const dayRows = Array.from(groundByDay.entries())
    .filter((e) => e[0] >= 1 && e[0] <= days)
    .map((e) => ({ date: iso(p.year, p.month, e[0]), kind: 'ground' as const, label: e[1] as string | null }))
    .filter((d) => !flightDates.has(d.date))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { period: p, flights: out, days: dayRows.length ? dayRows : undefined }
}
