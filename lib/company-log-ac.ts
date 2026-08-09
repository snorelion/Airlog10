// Air Canada "Block Report" PDF 파서
// 실파일(Bid period 2026-04-02 – 2026-05-02, 5쪽) 검증: 페어링 5개 · 20구간 — 2026-08-08
//
// ## 이 양식이 특별한 점 — **UTC가 이미 적혀 있다**
//
// 뒤쪽 페어링 상세 표는 각 공항 **현지시간**인데,
//     1  574  YVR 08:35  DEN 12:35  3h00 … 220
// 크루 배정 줄은 같은 편을 **UTC**로 적는다.
//     V4015 (0574) 2026/04/17 15:35 CA McTeer Alexander R
// YVR 08:35(UTC−7, 서머타임) = 15:35Z 로 정확히 맞는다(4편 전부 대조).
// 그래서 시간대·서머타임 계산이 아예 필요 없다 — 다른 항공사 파서와 결정적으로 다른 점이고,
// 출발 시각과 **날짜**를 여기서 그대로 가져온다.
// 도착 UTC는 출발 UTC + FltTime(표에 이미 계산돼 있다)으로 만든다.
//
// ## 구조
//   V4015                                          ← 페어링 번호
//   DAY FLT# From DepTime To ArrTime FltTime TOG FDP Duty LO A/C
//   Report 07:20 …                                 ← 리포트(구간 아님)
//   1  574 YVR 08:35 DEN 12:35 3h00 0h50 4h15 220  ← DAY 1
//   1 1038 DEN 13:25 YYZ 18:35 3h10 0h15 7h25 220
//   ------- Layover at … -------                   ← 호텔 줄(무시)
//   2  171 YYZ 17:05 YEG 19:14 4h09 0h51 7h09 220  ← DAY 2
//   Release 21:03 …                                ← 종료
//   Length (days): 2 Credit: 12h02 Block: 12h02 …
//
// ⚠️ 공항이 IATA(YVR)다 — ICAO 변환은 호출자가 airports 테이블로 넘겨준다 (Lion과 같은 방식).
// ⚠️ 같은 편명이 다른 날 여러 번 온다(574편이 V4015·V4017 양쪽에). 그래서 UTC 줄과 표를
//    맞출 때 **편명만으로 찾지 말고 페어링 안에서 순서대로** 짝지어야 한다.
// ⚠️ 회사가 비행시간(FltTime)을 이미 계산해 두므로 그대로 쓴다 — 추정하지 않는다
//    (Lion·KAL 파서와 같은 정책: 회사 로그북이 공식 기록이다).

import { getDocumentProxy } from 'unpdf'
import type { ParsedFlight, ParseResult } from './logten'
import { blankFlight } from './company-log'

/** "3h00" → 180 */
function hm(s: string): number {
  const m = /^(\d+)h(\d{2})$/.exec(s.trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

/** Air Canada 기종 코드 → 앱 표준 표기 */
const TYPE_MAP: Record<string, string> = {
  '220': 'A220-300',
  '221': 'A220-100',
  '223': 'A220-300',
  '319': 'A319',
  '320': 'A320',
  '321': 'A321',
  '333': 'A330-300',
  '763': 'B767-300',
  '77W': 'B777-300ER',
  '77L': 'B777-200LR',
  '788': 'B787-8',
  '789': 'B787-9',
  '38M': 'B737 MAX 8',
  'E75': 'E175',
}

export type AcLeg = {
  pairing: string
  flightNo: string
  dep: string
  arr: string
  depLocal: string
  arrLocal: string
  blockMin: number
  acType: string | null
}

export type AcExtract = {
  legs: AcLeg[]
  /** 크루 배정 줄에서 얻은 UTC 출발 — 키는 "페어링|편명|나온순서" */
  utc: Map<string, { date: string; time: string }>
  pilotName: string | null
  /** 원문 — 회사가 적어 둔 블록 합계(BLK)와 대조하는 데 쓴다 */
  reportText: string
}

const PAIRING_RE = /^V\d{4}$/
// "1  574 YVR 08:35 DEN 12:35 3h00 …" — 뒤쪽 칸(TOG·FDP·Duty·LO)은 있을 때도 없을 때도 있다
const LEG_RE = /^(\d)\s+(\d{2,4})\s+([A-Z]{3})\s+(\d{2}:\d{2})\s+([A-Z]{3})\s+(\d{2}:\d{2})\s+(\d+h\d{2})\b(.*)$/
// "V4015 (0574) 2026/04/17 15:35 CA McTeer Alexander R"
const UTC_RE = /(V\d{4})\s*\((\d{3,4})\)\s*(\d{4})\/(\d{2})\/(\d{2})\s*(\d{2}:\d{2})/g

/** 이 PDF가 Air Canada Block Report 인가 */
export function isAirCanadaBlockReport(text: string): boolean {
  return /Bid period/i.test(text) && /DAY\s+FLT#\s+From/i.test(text)
}

/**
 * PDF → 줄 단위 텍스트.
 *
 * 이 양식은 표라서 좌표까지는 필요 없고 **줄만 제대로 나뉘면** 된다.
 * pdf.js 는 조각을 잘게 주므로 y가 같은(±2pt) 조각을 x순으로 이어 한 줄로 만든다.
 */
async function pdfLines(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(data)
  const out: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const rows = new Map<number, { x: number; t: string }[]>()
    for (const raw of tc.items as { str?: string; transform?: number[] }[]) {
      const t = (raw.str ?? '').trim()
      if (!t || !raw.transform) continue
      const y = Math.round(raw.transform[5] / 2) * 2       // ±2pt 를 같은 줄로
      const arr = rows.get(y) ?? []
      arr.push({ x: raw.transform[4], t })
      rows.set(y, arr)
    }
    for (const y of Array.from(rows.keys()).sort((a, b) => b - a)) {
      out.push(rows.get(y)!.sort((a, b) => a.x - b.x).map((i) => i.t).join(' '))
    }
  }
  return out.join('\n')
}

/** PDF → 구간·UTC 표. Air Canada Block Report 가 아니면 null */
export async function acExtract(data: Uint8Array): Promise<AcExtract | null> {
  const text = await pdfLines(data)
  return acExtractFromText(text)
}

/** 텍스트에서 뽑는 부분 — 테스트에서 직접 부르기 좋게 나눠 뒀다 */
export function acExtractFromText(text: string): AcExtract | null {
  if (!isAirCanadaBlockReport(text)) return null

  const legs: AcLeg[] = []
  let pairing = ''
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (PAIRING_RE.test(line)) { pairing = line; continue }
    const m = LEG_RE.exec(line)
    if (!m || !pairing) continue
    // 줄 끝에 남은 칸 중 마지막 토큰이 기종 (220 · 77W …). 시간(0h50)·숫자만 있는 칸은 거른다
    const tail = m[8].trim().split(/\s+/).filter(Boolean)
    const acRaw = tail.reverse().find((t) => /^[A-Z0-9]{3}$/.test(t) && !/^\d+h\d{2}$/.test(t)) ?? null
    legs.push({
      pairing,
      flightNo: String(Number(m[2])),          // 0574 → 574 (UTC 줄과 맞추려고 앞 0 제거)
      dep: m[3], arr: m[5],
      depLocal: m[4], arrLocal: m[6],
      blockMin: hm(m[7]),
      acType: acRaw ? (TYPE_MAP[acRaw] ?? acRaw) : null,
    })
  }
  if (!legs.length) return null

  // 크루 배정 줄 → UTC. 같은 (페어링,편명)이 여러 번 오면 나온 순서로 번호를 붙인다
  const utc = new Map<string, { date: string; time: string }>()
  const seq = new Map<string, number>()
  for (const m of Array.from(text.matchAll(UTC_RE))) {
    const key0 = `${m[1]}|${String(Number(m[2]))}`
    const n = (seq.get(key0) ?? 0) + 1
    seq.set(key0, n)
    utc.set(`${key0}|${n}`, { date: `${m[3]}-${m[4]}-${m[5]}`, time: m[6] })
  }

  const nameM = /^\d{5,}\s+([A-Za-z][A-Za-z .'-]+?)\s*\(/m.exec(text)
  return { legs, utc, pilotName: nameM ? nameM[1].trim() : null, reportText: text }
}

/** 추출 결과 → 앱이 먹는 ParseResult */
export function acBuildFlights(ex: AcExtract, iataToIcao: Record<string, string>): ParseResult {
  const flights: ParsedFlight[] = []
  const warnings: string[] = []
  const seq = new Map<string, number>()
  const skipped = new Map<string, number>()   // 건너뛴 페어링 → 구간 수
  let takenMin = 0

  for (const leg of ex.legs) {
    const key0 = `${leg.pairing}|${leg.flightNo}`
    const n = (seq.get(key0) ?? 0) + 1
    seq.set(key0, n)
    const u = ex.utc.get(`${key0}|${n}`)
    // UTC 줄이 없으면 **날짜를 알 방법이 없다** — 지어내지 않고 건너뛴다.
    // 실파일에서 V4026 페어링이 그랬다(상세표는 있는데 크루 배정 줄만 없음).
    if (!u) {
      skipped.set(leg.pairing, (skipped.get(leg.pairing) ?? 0) + 1)
      continue
    }
    takenMin += leg.blockMin

    const f = blankFlight()
    f.flight_date = u.date
    f.flight_number = `AC${leg.flightNo}`
    f.origin = iataToIcao[leg.dep] ?? leg.dep
    f.destination = iataToIcao[leg.arr] ?? leg.arr
    f.out_time = u.time.replace(':', '')                       // UTC 그대로 (변환 불필요)
    f.in_time = addMin(u.time, leg.blockMin)
    f.total_min = leg.blockMin
    f.flight_min = leg.blockMin                                // 회사 값 그대로, 추정 없음
    f.aircraft_type = leg.acType
    f.capacity = 'SIC'                                         // Block Report에 직책 칸이 없다
    f.sic_min = leg.blockMin
    f.crew_pic = null
    f.source = 'aircanada'
    flights.push(f)
  }

  if (skipped.size) {
    const list = Array.from(skipped.entries()).map(([p, n]) => `${p}(${n}편)`).join(', ')
    warnings.push(
      `${list}은 파일에 크루 배정 줄이 없어 날짜를 알 수 없었어요 — 건너뛰었습니다. 직접 넣어 주세요.`
    )
  }
  // 회사가 적어 둔 블록 합계와 대조해 준다 — 빠진 게 있으면 여기서 바로 보인다
  const blk = /BLK:\s*(\d+)h(\d+)/.exec(ex.reportText ?? '')
  if (blk) {
    const want = Number(blk[1]) * 60 + Number(blk[2])
    const fmt = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
    warnings.push(
      want === takenMin
        ? `블록 합계 ${fmt(takenMin)} — 회사 파일 표기와 일치해요.`
        : `블록 합계 ${fmt(takenMin)} (회사 파일 표기는 ${fmt(want)}) — 위에 건너뛴 구간만큼 차이가 나요.`
    )
  }
  warnings.push('직책이 파일에 없어 SIC로 넣었어요 — 기장이시면 가져온 뒤 한 번에 바꿀 수 있어요.')
  warnings.push('시각은 회사 파일의 UTC를 그대로 썼어요. 도착은 출발 + 회사가 적은 비행시간이에요.')

  return {
    flights,
    // Block Report엔 등록번호가 없다 — 항공기는 등록번호가 유일키라 넣지 않는다.
    // 기종은 각 비행의 aircraft_type에 이미 들어간다. (Lion 파서와 같은 정책)
    aircraft: [],
    notes: warnings,
    errors: flights.length ? [] : ['Air Canada Block Report에서 비행을 찾지 못했어요.'],
  }
}

/** "15:35" + 180분 → "1835" (24시 넘어가면 그대로 감싼다 — 날짜는 출발일 기준) */
function addMin(hhmm: string, add: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const t = (h * 60 + m + add) % (24 * 60)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}${String(t % 60).padStart(2, '0')}`
}
