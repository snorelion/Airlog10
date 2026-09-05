// Air Premia "Crew Roster Report" (PDC 시스템) 로스터 파서 — 2026-08-21 실파일 검증
//
// 형식 (한 달이 날짜별 행, 이어지는 활동은 날짜 칸이 빈 채 계속):
//   Date DC C/I(L) C/O(L) Activity From STD(L) STD(Z) To STA(L) STA(Z) BlkHrs
//   10Aug26 2050 0750+1 YP151 ICN 2235 1335 HNL 1220 2220 8:45
//           REST HNL 1250 2250 HNL 1310+2 2310+2          ← 레이오버 휴식, 비행 아님
//   19Aug26 2340 0517+2 YP132 EWR 0048+1 0448+1 ICN 0447+2 1947+1 …
//
//  · 시각은 현지(L)·UTC(Z) 두 벌 — **현지(L)를 쓴다** (UTC 변환은 앱 RosterTime 몫,
//    다른 파서들과 같은 정책). 자정 넘김은 `+N`으로 명시된다 (행 날짜 기준).
//  · ⚠️ 출발 자체가 행 날짜의 다음날인 경우가 있다 — YP132는 19Aug 행인데 STD(L)이
//    "0048+1" = 실제론 20일 00:48 출발. **flight_date = 행 날짜 + 출발(L)의 +N** 으로
//    옮겨야 알림·홈 카드가 맞는다. overnight은 (도착 +N > 출발 +N).
//  · 미주 노선은 도착이 +2일 (LAX 2330 → ICN 0430+2) — legEnd가 공항 시간대로 맞춘다.
//  · 비행은 **YP#### 활동뿐**. OFF·RDO(휴무), REC*(훈련), BTRIP·REST는 비행이 아니다.
//  · "비행 없는 날"(days, 2026-09-05 — 앱 스케줄 달력용): 비행이 없는 행의 활동 코드를 날짜별 한 행으로.
//    OFF·RDO·ANLV(연차)→off · RSV(리저브)→standby · SIM*→sim · 훈련(REC*·RT*·EEGS·CBT)·사무(OFC*)→ground.
//    REST(레이오버 휴식)·BTRIP은 날이 아니라 건너뛴다. 한 날에 여러 코드면 sim>standby>ground>off 우선,
//    label에 원문 코드를 '/'로 이어 남긴다 (route.ts ParsedRosterDay·다른 파서와 같은 규칙).
//  · 로스터에 기종 칸이 없다 — 에어프레미아는 787-9 단일 기단이라 'B787-9' 고정.
//  · C/I(L)이 행 맨 앞에 오면 그 행 첫 비행의 리포트 시각. C/O는 +N이 붙거나 이어지는
//    행 중간에 끼어 칸 구분이 안 되므로 듀티 종료는 넣지 않는다.

export type PremiaRosterFlight = {
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

export type PremiaRosterDay = {
  date: string
  kind: 'off' | 'standby' | 'sim' | 'ground'
  label: string | null
}

export type PremiaRosterResult = {
  period: { start: string; end: string }
  flights: PremiaRosterFlight[]
  days?: PremiaRosterDay[]
  stats: { flights: number; offDays: number; standbyDays: number }
}

/** unpdf 문서에서 우리가 쓰는 부분만 (다른 로스터 파서들과 같은 형태) */
type PdfLike = {
  numPages: number
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const FLT = /^YP\d{2,4}$/
const AP = /^[A-Z]{3}$/
const T4 = /^(\d{4})([+-]\d)?$/ // 2235 · 0048+1 · 1500-1
const BLK = /^\d{1,2}:\d{2}$/ // 블록타임 8:45 — 구조 판독에서 건너뛴다
const RDATE = /^(\d{2})([A-Za-z]{3})(\d{2})$/ // 01Aug26
// 휴무·훈련 코드 — OFF·RDO는 세 글자라 공항 꼴과 겹치므로 목록으로 먼저 본다
const OFF_CODES = new Set(['OFF', 'RDO', 'DO', 'ALV', 'AL', 'VAC', 'ANLV'])
const SBY_CODES = new Set(['RSV', 'SBY', 'STBY', 'SB'])
// 날이 아닌 활동 — 레이오버 휴식·출장 이동은 달력 칸을 차지하지 않는다
const SKIP_CODES = new Set(['REST', 'BTRIP'])
const KIND_RANK = { sim: 0, standby: 1, ground: 2, off: 3 } as const

/** 활동 코드 → 달력 종류. 모르는 코드는 null (비행 없는 날에 낯선 코드만 있으면 그 날은 비워 둔다) */
function dayKind(code: string): PremiaRosterDay['kind'] | null {
  if (OFF_CODES.has(code)) return 'off'
  if (SBY_CODES.has(code)) return 'standby'
  if (code.startsWith('SIM')) return 'sim'
  // 훈련(REC*·RT2CBT·EEGS·*CBT)·사무(OFC*)·지상(GS*) — 달력엔 회색 ground
  if (/^(REC|RT|EEGS|OFC|GS|GND)/.test(code) || code.endsWith('CBT')) return 'ground'
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "0048+1" → { hm: "00:48", plus: 1 }. 시각이 아니면 null */
function hmPlus(s: string): { hm: string; plus: number } | null {
  const m = T4.exec(s)
  if (!m) return null
  const hh = Number(m[1].slice(0, 2))
  const mm = Number(m[1].slice(2))
  if (hh > 23 || mm > 59) return null
  return { hm: `${pad(hh)}:${m[1].slice(2)}`, plus: m[2] ? Number(m[2]) : 0 }
}

/** "01Aug26" → "2026-08-01". 아니면 null */
function isoFromDDMonYY(s: string): string | null {
  const m = RDATE.exec(s)
  if (!m) return null
  const mo = MONTHS[m[2].toLowerCase()]
  return mo ? `${2000 + Number(m[3])}-${pad(mo)}-${m[1]}` : null
}

/** ISO 날짜 + n일 (출발 +N 반영용) */
function addDays(day: string, n: number): string {
  if (!n) return day
  const d = new Date(Date.UTC(
    Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + n))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function isPremiaRoster(text: string): boolean {
  // 이스타도 "Crew Roster Report"를 쓰지만 ZE 편명을 요구해 서로 충돌하지 않는다.
  // 여기는 YP 편명 + PDC 특유의 현지·UTC 두 벌 헤더(STD(L)/STD(Z))로 판별한다
  const c = text.replace(/\s+/g, '')
  return c.includes('CrewRosterReport') && c.includes('STD(L)') && c.includes('STD(Z)') &&
    /YP\d{2,4}/.test(c)
}

export async function parsePremiaRoster(pdf: PdfLike): Promise<PremiaRosterResult | null> {
  // 문서 전체를 단어 스트림으로 (조각·병합 무관 — KAL 파서와 같은 방식)
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
  const compact = words.join(' ').replace(/\s+/g, '')

  // 기간 "Period: 01Aug26 - 31Aug26"
  let period: { start: string; end: string } | null = null
  const pm = /Period:?(\d{2})([A-Za-z]{3})(\d{2})-(\d{2})([A-Za-z]{3})(\d{2})/.exec(compact)
  if (pm) {
    const s = isoFromDDMonYY(pm[1] + pm[2] + pm[3])
    const e = isoFromDDMonYY(pm[4] + pm[5] + pm[6])
    if (s && e) period = { start: s, end: e }
  }

  // "01Aug26" 단어를 앵커로 행을 나눈다 (이어지는 활동 줄은 앞 행에 붙는다)
  const rows: { date: string; body: string[] }[] = []
  let cur: { date: string; body: string[] } | null = null
  for (const x of words) {
    const d = isoFromDDMonYY(x)
    if (d) {
      if (cur) rows.push(cur)
      cur = { date: d, body: [] }
    } else if (cur) {
      cur.body.push(x)
    }
  }
  if (cur) rows.push(cur)

  const flights: PremiaRosterFlight[] = []
  const days: PremiaRosterDay[] = []
  for (const r of rows) {
    // 활동 코드 전부: OFF·RDO는 공항 꼴(3대문자)이라 목록을 먼저 보고,
    // 나머지는 "시각도 공항도 블록타임도 아닌 단어" (YP151·RECSM·BTRIP·RT2CBT…). T*(훈련 표시)는 뺀다.
    const acts = r.body.filter((x) =>
      OFF_CODES.has(x) || SBY_CODES.has(x) ||
      (!T4.test(x) && !AP.test(x) && !BLK.test(x) && x !== 'T*'))
    // 비행 없는 행만 "비행 없는 날" 후보 — 비행 행은 아래 루프가 flights로 가져간다
    if (!acts.some((a) => FLT.test(a))) {
      const kinds = acts.filter((a) => !SKIP_CODES.has(a)).map((a) => ({ code: a, kind: dayKind(a) }))
      const known = kinds.filter((k) => k.kind)
      if (known.length) {
        const best = known.reduce((a, b) => (KIND_RANK[b.kind!] < KIND_RANK[a.kind!] ? b : a))
        days.push({ date: r.date, kind: best.kind!,
                    label: Array.from(new Set(kinds.map((k) => k.code))).join('/') })
      }
    }

    // 행 맨 앞 시각(C/I) = 그 행 첫 비행의 리포트 시각 (+N 붙은 건 C/O이므로 제외)
    const lead = r.body.length ? hmPlus(r.body[0]) : null
    const report = lead && lead.plus === 0 ? lead.hm : null

    let first = true
    let i = 0
    while (i < r.body.length) {
      if (!FLT.test(r.body[i])) { i++; continue }
      // YP#### 뒤 [공항, 현지, UTC, 공항, 현지, UTC] 여섯 단어가 정확히 서야 비행
      const s = r.body.slice(i + 1, i + 7)
      const dl = s.length === 6 ? hmPlus(s[1]) : null
      const al = s.length === 6 ? hmPlus(s[4]) : null
      if (!(s.length === 6 && AP.test(s[0]) && dl && T4.test(s[2]) &&
            AP.test(s[3]) && al && T4.test(s[5]))) { i++; continue }
      flights.push({
        flight_date: addDays(r.date, dl.plus), // 행 날짜가 아니라 실제 출발 날짜
        flight_number: r.body[i],
        origin: s[0],
        destination: s[3],
        std: dl.hm,
        sta: al.hm,
        aircraft_type: 'B787-9', // 단일 기단 — 로스터에 기종 칸이 없다
        overnight: al.plus > dl.plus,
        report_time: first ? report : null,
      })
      first = false
      i += 7
    }
  }

  if (!flights.length) return null
  if (!period) {
    const dates = flights.map((f) => f.flight_date).sort()
    period = { start: dates[0], end: dates[dates.length - 1] }
  }
  // 비행이 있는 날(출발 +N으로 옮겨진 날짜 포함)은 비행이 주인 — 그 날의 day 행은 뺀다
  const flightDates = new Set(flights.map((f) => f.flight_date))
  const cleanDays = days.filter((d) => !flightDates.has(d.date))
  return {
    period,
    flights,
    days: cleanDays.length ? cleanDays : undefined,
    // stats는 route.ts dayStats와 같은 셈법 (off 외 전부 standbyDays)
    stats: {
      flights: flights.length,
      offDays: cleanDays.filter((d) => d.kind === 'off').length,
      standbyDays: cleanDays.filter((d) => d.kind !== 'off').length,
    },
  }
}
