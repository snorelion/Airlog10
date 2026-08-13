// T'way Air "MonthlySchedule" 엑셀 로스터 파서
// 실파일(TalkFile_mm.xlsx, 2026-08) 파이썬 프로토타입 전수 검증 — 2026-08-13
//
// 형식 (승무원 앱의 월간 스케줄 내보내기 — 지금까지의 PDF 로스터들과 달리 **엑셀**):
//  · 시트명이 `MonthlySchedule_<타임스탬프>` — 이걸 지문으로 쓴다
//  · A1 = 그 달 1일(날짜 셀) — 연·월의 유일한 출처
//  · Sun~Sat 7열 달력. [날짜 숫자 행] 아래에 열마다 (코드/설명/시간) 3줄짜리 항목이 쌓인다
//  · 열마다 항목 수가 달라 **행이 서로 어긋난다** → 열별로 비빈 셀을 모아 3개씩 묶는다
//  · 시간은 leg별 STD/STA가 아니라 **듀티 시작~종료**다 (L/O가 앞뒤로 빈틈없이 이어지는 실측).
//    제주항공 사진과 같은 정책: 첫 편에 시작·마지막 편에 종료만 넣고 나머지는 Log it 때
//  · 편명은 `307`·`241/242`처럼 슬래시 묶음. 공항·등록번호는 없다 (aircraft를 만들지 말 것)
//  · ⚠️ 자정 넘김 듀티는 **시작일·종료일 양쪽에 표기**된다 (같은 시작시각 + 편명 겹침).
//    예: 13일 `041 20:00~00:10` = 14일 `041 20:00~00:10` (한 건) /
//        20일 `423 20:50~00:50` + 21일 `423/424 20:50~06:20` (423은 중복, 424만 신규)
//  · 비행 아닌 항목: OFF·RQOFF(휴무) / SBY-B·RESV(스탠바이) / L/O(레이오버) /
//    TRAIN(기차 데드헤드) / MED·JCRM·G/S(교육 등) — TRAIN은 몇 건인지 세어 알린다
import ExcelJS from 'exceljs'

export type TwayRosterFlight = {
  flight_date: string
  flight_number: string
  origin: string | null
  destination: string | null
  std: string | null
  sta: string | null
  aircraft_type: string | null
  overnight: boolean
}

export type TwayRosterResult = {
  period: { start: string; end: string }
  flights: TwayRosterFlight[]
  stats: { flights: number; offDays: number; standbyDays: number }
  notes?: string[]
}

const TIME_RANGE = /^(\d{2}:\d{2})~(\d{2}:\d{2})$/

// 엑셀 셀 값 → 문자열 (실측: 이 양식은 A1만 날짜고 나머지는 전부 문자열 셀)
function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] }
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('').trim()
    if (o.text !== undefined) return String(o.text).trim()
    if (o.result !== undefined) return String(o.result).trim()
  }
  return String(v).trim()
}

/** 티웨이 월간 스케줄 엑셀이면 파싱 결과, 아니면 null (지문 불일치) */
export async function parseTwayRoster(buf: ArrayBuffer): Promise<TwayRosterResult | null> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buf)
  } catch {
    return null // 엑셀이 아니거나 깨진 파일
  }
  const ws = wb.worksheets[0]
  if (!ws || !/^MonthlySchedule/i.test(ws.name)) return null

  // 연·월: A1의 날짜 셀 (그 달 1일)
  const a1 = ws.getCell(1, 1).value
  if (!(a1 instanceof Date)) return null
  const year = a1.getUTCFullYear()
  const month = a1.getUTCMonth() + 1
  const firstDowCol = new Date(Date.UTC(year, month - 1, 1)).getUTCDay() // 0=Sun = A열
  const colOf = (d: number) => (firstDowCol + d - 1) % 7

  // 전체를 문자열 격자로 (0-based, 7열)
  const grid: string[][] = []
  for (let r = 1; r <= ws.rowCount; r++) {
    const row: string[] = []
    for (let c = 1; c <= 7; c++) row.push(cellText(ws.getCell(r, c).value))
    grid.push(row)
  }

  // 날짜행: 비빈 셀 전부 정수, 왼→오 +1 연속, 기대값으로 시작, 요일 열 위치 정합
  const asDayRow = (cells: string[], expected: number): [number, number][] | null => {
    const days: [number, number][] = [] // [열, 날짜]
    for (let i = 0; i < cells.length; i++) {
      if (!cells[i]) continue
      if (!/^\d{1,2}$/.test(cells[i])) return null
      days.push([i, parseInt(cells[i], 10)])
    }
    if (!days.length) return null
    for (let k = 1; k < days.length; k++) {
      if (days[k][1] !== days[k - 1][1] + 1 || days[k][0] !== days[k - 1][0] + 1) return null
    }
    if (days[0][1] !== expected) return null
    for (const [coli, d] of days) {
      if (d < 1 || d > 31 || colOf(d) !== coli) return null
    }
    return days
  }

  const dayRows: { rowIdx: number; days: [number, number][] }[] = []
  let expected = 1
  for (let ri = 0; ri < grid.length; ri++) {
    const got = asDayRow(grid[ri], expected)
    if (got) {
      dayRows.push({ rowIdx: ri, days: got })
      expected = got[got.length - 1][1] + 1
    }
  }
  if (!dayRows.length) return null

  // 주 블록 → 열별로 비빈 셀을 모아 3개씩 (코드/설명/시간)
  type Entry = { code: string; desc: string; start: string; end: string }
  const entries = new Map<number, Entry[]>() // day → items
  for (let wi = 0; wi < dayRows.length; wi++) {
    const { rowIdx, days } = dayRows[wi]
    const endRow = wi + 1 < dayRows.length ? dayRows[wi + 1].rowIdx : grid.length
    for (const [coli, d] of days) {
      const toks: string[] = []
      for (let r = rowIdx + 1; r < endRow; r++) {
        if (grid[r][coli]) toks.push(grid[r][coli])
      }
      const items: Entry[] = []
      for (let k = 0; k + 2 < toks.length; k += 3) {
        const m = toks[k + 2].match(TIME_RANGE)
        if (!m) continue // 어긋난 트리플은 버린다 (실측 파일은 전부 정합)
        items.push({ code: toks[k], desc: toks[k + 1], start: m[1], end: m[2] })
      }
      entries.set(d, items)
    }
  }

  // 항목 분류 + 자정 넘김 중복 제거
  const flights: TwayRosterFlight[] = []
  const notes: string[] = []
  let offDays = 0
  let standbyDays = 0
  let trainCount = 0
  let prevFlight: { day: number; nums: Set<string>; start: string } | null = null
  const allDays = Array.from(entries.keys()).sort((a, b) => a - b)
  for (const d of allDays) {
    let hasOff = false
    let hasSby = false
    for (const it of entries.get(d) ?? []) {
      if (it.desc === 'Flight leg') {
        let nums = it.code.split('/').filter(Boolean)
        let start: string | null = it.start
        // 전날 표기와 이어지는 자정 넘김 재표기: 같은 시작시각 + 편명 겹침 → 겹친 편명 제거
        const prev = prevFlight
        if (prev && prev.day === d - 1 && prev.start === it.start) {
          const fresh = nums.filter((n) => !prev.nums.has(n))
          if (fresh.length < nums.length) {
            if (!fresh.length) {
              prevFlight = { day: d, nums: prev.nums, start: it.start } // 통째 중복
              continue
            }
            nums = fresh
            start = null // 남은 편명은 자정 이후 출발 — 개별 시작시각은 없다
          }
        }
        const overnight = !!start && start > it.end
        for (let i = 0; i < nums.length; i++) {
          flights.push({
            flight_date: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
            flight_number: `TW${nums[i]}`,
            origin: null,
            destination: null,
            std: i === 0 ? start : null,
            sta: i === nums.length - 1 ? it.end : null,
            aircraft_type: null,
            overnight: overnight && i === nums.length - 1,
          })
        }
        prevFlight = { day: d, nums: new Set(it.code.split('/').filter(Boolean)), start: it.start }
      } else if (it.code === 'OFF' || it.code === 'RQOFF') {
        hasOff = true
      } else if (it.code.startsWith('SBY') || it.code === 'RESV') {
        hasSby = true
      } else if (it.code === 'TRAIN') {
        trainCount++
      }
      // L/O·MED·JCRM·G/S 등은 건너뜀
    }
    if (hasOff) offDays++
    if (hasSby) standbyDays++
  }

  if (trainCount) {
    notes.push(`기차 데드헤드 ${trainCount}건은 편명이 없어 넣지 않았어요 — 필요하면 직접 넣어 주세요.`)
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, '0')
  return {
    period: { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` },
    flights,
    stats: { flights: flights.length, offDays, standbyDays },
    notes: notes.length ? notes : undefined,
  }
}
