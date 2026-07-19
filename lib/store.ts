// 오프라인 우선 데이터 계층 (비행모드에서 앱의 생명줄)
//  - 화면은 항상 IndexedDB 사본을 먼저 읽는다 (즉시, 오프라인 OK)
//  - 온라인이면 뒤에서 sync(): outbox 밀어올리기 → 변경분 당겨오기(updated_at 증분)
//  - 오프라인 저장은 outbox에 쌓였다가 온라인 복귀 시 자동 업로드

import { createClient } from './supabase'
import { idbGetAll, idbGet, idbPut, idbDelete, idbPutMany } from './idb'

export type Flight = {
  id: string
  flight_date: string
  flight_number: string | null
  origin: string | null
  destination: string | null
  out_time: string | null
  in_time: string | null
  takeoff_time: string | null
  landing_time: string | null
  flight_min: number
  aircraft_reg: string | null
  aircraft_type: string | null
  total_min: number
  pic_min: number
  sic_min: number
  picus_min: number
  night_min: number
  inst_actual_min: number
  inst_sim_min: number
  xc_min: number
  multi_pilot_min: number
  dual_received_min: number
  dual_given_min: number
  sim_min: number
  day_takeoffs: number
  day_landings: number
  night_takeoffs: number
  night_landings: number
  autolands: number
  go_arounds: number
  holds: number
  approaches: string[] | null
  capacity: string | null
  is_pf: boolean | null
  crew_pic: string | null
  crew_sic: string | null
  crew_other: string | null
  pax_count: number | null
  distance_nm: number | null
  remarks: string | null
  source: string
  created_at?: string
  updated_at?: string
  deleted: boolean
}

export type AircraftRow = {
  registration: string
  type_code: string | null
}

export type Person = {
  name: string
  employee_no: string | null
  notes: string | null
}

export type AirportNoteRow = {
  ident: string
  notes: string
}

type OutboxItem =
  | { id: string; kind: 'flight'; row: Flight }
  | { id: string; kind: 'aircraft'; row: AircraftRow }
  | { id: string; kind: 'person'; row: Person }
  | { id: string; kind: 'airportNote'; row: AirportNoteRow }

// ── 읽기 (항상 로컬 사본) ──────────────────────────
export async function getFlights(): Promise<Flight[]> {
  const rows = await idbGetAll<Flight>('flights')
  return rows.filter((f) => !f.deleted)
}

export async function getAircraftList(): Promise<AircraftRow[]> {
  return idbGetAll<AircraftRow>('aircraft')
}

export async function getPendingCount(): Promise<number> {
  const rows = await idbGetAll<OutboxItem>('outbox')
  return rows.filter((r) => r.kind === 'flight').length
}

export async function getLastSyncAt(): Promise<string | null> {
  const m = await idbGet<{ k: string; v: string }>('meta', 'lastSyncAt')
  return m?.v ?? null
}

// 간단 설정 저장 (이름·기본 역할 등) — 오프라인에서도 동작
export async function getSetting(key: string): Promise<string | null> {
  const m = await idbGet<{ k: string; v: string }>('meta', 'setting:' + key)
  return m?.v ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  await idbPut('meta', { k: 'setting:' + key, v: value })
}

// ── 쓰기 (오프라인 OK — outbox에 쌓임) ──────────────
export async function addFlight(row: Omit<Flight, 'id' | 'deleted'>): Promise<Flight> {
  const flight: Flight = { ...row, id: crypto.randomUUID(), deleted: false }
  await idbPut('flights', flight)
  await idbPut('outbox', { id: flight.id, kind: 'flight', row: flight } satisfies OutboxItem)
  void sync() // 온라인이면 바로 올라감, 오프라인이면 조용히 실패 → 다음 기회에
  return flight
}

export async function deleteFlight(id: string): Promise<void> {
  const f = await idbGet<Flight>('flights', id)
  if (!f) return
  const row: Flight = { ...f, deleted: true }
  await idbPut('flights', row)
  await idbPut('outbox', { id, kind: 'flight', row } satisfies OutboxItem)
  notify()
  void sync()
}

export async function rememberAircraft(row: AircraftRow): Promise<void> {
  if (!row.registration) return
  await idbPut('aircraft', row)
  await idbPut('outbox', { id: 'ac:' + row.registration, kind: 'aircraft', row } satisfies OutboxItem)
}

// ── 크루(사람) 메모 ────────────────────────────────
export async function getPeople(): Promise<Person[]> {
  return idbGetAll<Person>('people')
}

export async function savePerson(row: Person): Promise<void> {
  if (!row.name) return
  await idbPut('people', row)
  await idbPut('outbox', { id: 'p:' + row.name, kind: 'person', row } satisfies OutboxItem)
  notify()
  void sync()
}

// ── 공항 메모 ─────────────────────────────────────
export async function getAirportNote(ident: string): Promise<string> {
  const r = await idbGet<AirportNoteRow>('airport_notes', ident)
  return r?.notes ?? ''
}

export async function saveAirportNote(ident: string, notes: string): Promise<void> {
  const row: AirportNoteRow = { ident, notes }
  await idbPut('airport_notes', row)
  await idbPut('outbox', { id: 'an:' + ident, kind: 'airportNote', row } satisfies OutboxItem)
  notify()
  void sync()
}

// ── 동기화 ─────────────────────────────────────────
// since 이후(포함) 변경분을 전부 받아 로컬에 덮어쓰고, 본 것 중 최대 updated_at을 돌려준다
async function pullFlights(
  supabase: ReturnType<typeof createClient>,
  since: string
): Promise<string> {
  let maxSeen = since
  for (let fromRow = 0; ; fromRow += 1000) {
    const { data, error } = await supabase
      .from('flights')
      .select('*')
      .gte('updated_at', since)
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .range(fromRow, fromRow + 999)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    await idbPutMany('flights', data)
    const last = data[data.length - 1].updated_at
    if (last > maxSeen) maxSeen = last
    if (data.length < 1000) break
  }
  return maxSeen
}

let syncing = false
const listeners = new Set<() => void>()

export function onStoreChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function notify() {
  listeners.forEach((fn) => {
    try { fn() } catch {}
  })
}

export async function sync(): Promise<boolean> {
  if (syncing) return false
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false
  syncing = true
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    // 1) outbox 밀어올리기
    const outbox = await idbGetAll<OutboxItem>('outbox')
    for (const item of outbox) {
      if (item.kind === 'flight') {
        // deleted(tombstone)는 함께 올려야 삭제가 서버에 반영된다
        const { created_at, updated_at, ...rest } = item.row
        const { error } = await supabase.from('flights').upsert({ ...rest, user_id: user.id })
        if (error) throw new Error(error.message)
      } else if (item.kind === 'aircraft') {
        const { error } = await supabase
          .from('aircraft')
          .upsert({ ...item.row, user_id: user.id }, { onConflict: 'user_id,registration' })
        if (error) throw new Error(error.message)
      } else if (item.kind === 'person') {
        const { error } = await supabase
          .from('people')
          .upsert({ ...item.row, user_id: user.id }, { onConflict: 'user_id,name' })
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('airport_notes')
          .upsert({ ...item.row, user_id: user.id }, { onConflict: 'user_id,ident' })
        if (error) throw new Error(error.message)
      }
      await idbDelete('outbox', item.id)
    }

    // 2) 변경분 당겨오기 (updated_at 증분)
    // 주의: 대량 임포트는 수백 행이 '같은 updated_at'을 가진다 → gt(마지막 시각)으로
    // 커서를 옮기면 같은 시각의 나머지 행을 영영 건너뛴다. 그래서 gte + range 페이징:
    // 경계 시각 행을 중복으로 다시 받는 대신(덮어쓰기라 무해) 누락이 없다.
    const EPOCH = '1970-01-01T00:00:00Z'
    const m = await idbGet<{ k: string; v: string }>('meta', 'lastPulledAt')
    const since = m?.v ?? EPOCH
    let maxSeen = await pullFlights(supabase, since)

    // 자가 치유: 로컬 개수와 서버 개수가 다르면 커서가 어긋난 것 → 전체 재수신
    const { count } = await supabase
      .from('flights')
      .select('id', { count: 'exact', head: true })
    const localCount = (await idbGetAll<Flight>('flights')).length
    if (count !== null && count !== undefined && count !== localCount) {
      maxSeen = await pullFlights(supabase, EPOCH)
    }
    await idbPut('meta', { k: 'lastPulledAt', v: maxSeen })

    // 3) 항공기·크루·공항메모 (작아서 전체 새로고침)
    const { data: acData } = await supabase.from('aircraft').select('registration, type_code')
    if (acData) await idbPutMany('aircraft', acData)
    try {
      const { data: ppl } = await supabase.from('people').select('name, employee_no, notes')
      if (ppl) await idbPutMany('people', ppl)
      const { data: an } = await supabase.from('airport_notes').select('ident, notes')
      if (an) await idbPutMany('airport_notes', an)
    } catch {} // 003 마이그레이션 전이면 테이블이 없을 수 있음 — 조용히 넘어감

    await idbPut('meta', { k: 'lastSyncAt', v: new Date().toISOString() })
    notify()
    return true
  } catch {
    return false
  } finally {
    syncing = false
  }
}
