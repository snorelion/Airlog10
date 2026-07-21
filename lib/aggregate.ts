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

// 시간순 정렬 (장부·목록 공용): 날짜 → 생성시각 → id
export function sortChrono(flights: Flight[]): Flight[] {
  return [...flights].sort((a, b) =>
    a.flight_date.localeCompare(b.flight_date) ||
    (a.created_at ?? '').localeCompare(b.created_at ?? '') ||
    a.id.localeCompare(b.id)
  )
}
