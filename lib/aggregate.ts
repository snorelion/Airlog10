// 로컬 사본(IndexedDB)에서 통계 계산 — 서버 RPC 없이 오프라인에서도 동작
import type { Flight } from './store'

export type Totals = {
  flights: number
  total_min: number
  pic_min: number
  sic_min: number
  picus_min: number
  night_min: number
  inst_min: number
  landings: number
  first_date: string | null
  last_date: string | null
}

export function computeTotals(flights: Flight[]): Totals {
  const t: Totals = {
    flights: flights.length, total_min: 0, pic_min: 0, sic_min: 0, picus_min: 0,
    night_min: 0, inst_min: 0, landings: 0, first_date: null, last_date: null,
  }
  for (const f of flights) {
    t.total_min += f.total_min
    t.pic_min += f.pic_min
    t.sic_min += f.sic_min
    t.picus_min += f.picus_min
    t.night_min += f.night_min
    t.inst_min += f.inst_actual_min
    t.landings += f.day_landings + f.night_landings
    if (!t.first_date || f.flight_date < t.first_date) t.first_date = f.flight_date
    if (!t.last_date || f.flight_date > t.last_date) t.last_date = f.flight_date
  }
  return t
}

export function computeYearly(flights: Flight[]): { yr: string; flights: number; total_min: number }[] {
  const map = new Map<string, { yr: string; flights: number; total_min: number }>()
  for (const f of flights) {
    const yr = f.flight_date.slice(0, 4)
    const e = map.get(yr) ?? { yr, flights: 0, total_min: 0 }
    e.flights += 1
    e.total_min += f.total_min
    map.set(yr, e)
  }
  return Array.from(map.values()).sort((a, b) => a.yr.localeCompare(b.yr))
}

export function computeByType(flights: Flight[]): { type: string; flights: number; total_min: number }[] {
  const map = new Map<string, { type: string; flights: number; total_min: number }>()
  for (const f of flights) {
    const type = f.aircraft_type || '기타'
    const e = map.get(type) ?? { type, flights: 0, total_min: 0 }
    e.flights += 1
    e.total_min += f.total_min
    map.set(type, e)
  }
  return Array.from(map.values()).sort((a, b) => b.total_min - a.total_min)
}

export function computeTopAirports(flights: Flight[], limit = 15): { ident: string; visits: number }[] {
  const map = new Map<string, number>()
  for (const f of flights) {
    if (f.origin) map.set(f.origin, (map.get(f.origin) ?? 0) + 1)
    if (f.destination) map.set(f.destination, (map.get(f.destination) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([ident, visits]) => ({ ident, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, limit)
}

// 최근 N일 굴러가는 창의 블록타임 합 (리밋 감시용)
export function windowTotalMin(flights: Flight[], days: number, todayStr: string): number {
  const from = new Date(todayStr + 'T00:00:00')
  from.setDate(from.getDate() - days + 1)
  const fromStr = from.toLocaleDateString('en-CA')
  let sum = 0
  for (const f of flights) {
    if (f.flight_date >= fromStr && f.flight_date <= todayStr) sum += f.total_min
  }
  return sum
}

// 이번 달 듀티 합계 (분)
export function monthDutyMin(flights: Flight[], todayStr: string): number {
  const ym = todayStr.slice(0, 7)
  let sum = 0
  for (const f of flights) if (f.flight_date.slice(0, 7) === ym) sum += f.duty_min ?? 0
  return sum
}

// 기량유지: 최근 90일 이착륙 횟수
export function currency90(flights: Flight[], todayStr: string): { takeoffs: number; landings: number } {
  const from = new Date(todayStr + 'T00:00:00')
  from.setDate(from.getDate() - 89)
  const fromStr = from.toLocaleDateString('en-CA')
  let takeoffs = 0
  let landings = 0
  for (const f of flights) {
    if (f.flight_date >= fromStr && f.flight_date <= todayStr) {
      takeoffs += f.day_takeoffs + f.night_takeoffs
      landings += f.day_landings + f.night_landings
    }
  }
  return { takeoffs, landings }
}

// ─────────────────────────────────────────────
// Recap — 특정 기간(최근 4주 / 지난 달)의 비행 성향 요약
// ─────────────────────────────────────────────

export type Recap = {
  flights: number
  total_min: number
  landings: number
  day_min: number       // 주간 = 블록 − 야간
  night_min: number
  domestic: number      // 국내 편수 (출·도착 ICAO 앞 2글자 동일)
  intl: number          // 국제 편수
}

// 베이스 국가권 = 가장 많이 드나든 공항의 ICAO 앞 2글자 (라이언님 = VT 태국).
// 커리어 전체(기간 필터 전) 기준으로 뽑아 홈베이스 국가를 대표한다.
export function baseCountry(flights: Flight[]): string {
  const c = new Map<string, number>()
  for (const f of flights) {
    for (const a of [f.origin, f.destination]) {
      if (!a) continue
      const cc = a.slice(0, 2).toUpperCase()
      c.set(cc, (c.get(cc) ?? 0) + 1)
    }
  }
  let best = '', n = -1
  for (const [k, v] of Array.from(c.entries())) if (v > n) { n = v; best = k }
  return best
}

// 국내/국제 판정: 베이스국(예 VT)을 벗어나면 국제.
// 출·도착 둘 다 베이스국이면 국내, 하나라도 벗어나면 국제.
function isDomestic(f: Flight, baseCC: string): boolean | null {
  if (!f.origin || !f.destination || !baseCC) return null
  return f.origin.slice(0, 2).toUpperCase() === baseCC && f.destination.slice(0, 2).toUpperCase() === baseCC
}

// 이미 기간·시뮬 필터된 flights를 받아 성향 집계 (baseCC = 홈베이스 국가권)
export function computeRecap(flights: Flight[], baseCC: string): Recap {
  const r: Recap = { flights: 0, total_min: 0, landings: 0, day_min: 0, night_min: 0, domestic: 0, intl: 0 }
  for (const f of flights) {
    r.flights += 1
    r.total_min += f.total_min
    r.night_min += f.night_min
    r.landings += f.day_landings + f.night_landings
    const dom = isDomestic(f, baseCC)
    if (dom === true) r.domestic += 1
    else if (dom === false) r.intl += 1
  }
  r.day_min = Math.max(0, r.total_min - r.night_min)
  return r
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}

export type RecapRange = { start: string; end: string; prevStart: string; prevEnd: string; label: string }

// 기간 계산 — 'weeks4'(최근 28일, 리밋과 연동) / 'lastMonth'(지난 달력월)
// 각 기간엔 '직전 동일 기간'(prev)도 함께 줘서 전월/전주기 대비 ▲▼를 만든다
export function recapRange(todayStr: string, mode: 'weeks4' | 'lastMonth'): RecapRange {
  if (mode === 'weeks4') {
    return {
      start: addDays(todayStr, -27), end: todayStr,
      prevStart: addDays(todayStr, -55), prevEnd: addDays(todayStr, -28),
      label: '최근 4주',
    }
  }
  const thisMonth1 = todayStr.slice(0, 7) + '-01'
  const end = addDays(thisMonth1, -1)              // 지난달 말일
  const start = end.slice(0, 7) + '-01'            // 지난달 1일
  const prevEnd = addDays(start, -1)               // 지지난달 말일
  const prevStart = prevEnd.slice(0, 7) + '-01'
  return { start, end, prevStart, prevEnd, label: start.slice(0, 7) }
}

// 기간 안의 실비행만 (시뮬 total_min=0 은 제외)
export function filterRange(flights: Flight[], start: string, end: string): Flight[] {
  return flights.filter((f) => f.total_min > 0 && f.flight_date >= start && f.flight_date <= end)
}

// 시간순 정렬 (장부·목록 공용): 날짜 → 생성시각 → id
export function sortChrono(flights: Flight[]): Flight[] {
  return [...flights].sort((a, b) =>
    a.flight_date.localeCompare(b.flight_date) ||
    (a.created_at ?? '').localeCompare(b.created_at ?? '') ||
    a.id.localeCompare(b.id)
  )
}
