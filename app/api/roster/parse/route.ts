import { NextRequest, NextResponse } from 'next/server'
import { getDocumentProxy } from 'unpdf'
import { createApiSupabase } from '@/lib/supabase-server'
import { isEastarRoster, parseEastarRoster } from '@/lib/roster-eastar'
import { isJejuRoster, parseJejuRoster } from '@/lib/roster-jeju'
import {
  isKalCwpRoster, parseKalCwpRoster,
  isKalCalendarRoster, parseKalCalendarRoster,
  parseKalRosterXlsx, xlsxLooksLikeCompanyLog, type KalRosterResult,
} from '@/lib/roster-kal'
import { isPremiaRoster, parsePremiaRoster } from '@/lib/roster-premia'
import { isJinairRoster, parseJinairRoster } from '@/lib/roster-jinair'
import { isPeachRoster, parsePeachRoster } from '@/lib/roster-peach'
import { isThaiRoster, parseThaiRoster } from '@/lib/roster-thai'
import { isLionLongRoster, parseLionLongRoster } from '@/lib/roster-lionair-long'
import { acExtract, acBuildRoster } from '@/lib/company-log-ac'
import { kalExtract } from '@/lib/company-log-kal'
import { pdfToCompanyRows } from '@/lib/company-log-pdf'

// Lion Air "Personal Crew Schedule Report" PDF 파서
// 방식: 1페이지 글자들의 좌표(x,y)를 읽어 날짜 컬럼(dd/mm 헤더의 x)별로 묶고,
//       컬럼 안에서 위→아래 순서로 토큰을 해석한다. (실파일로 검증된 알고리즘)
// 함정: 자정 넘김 비행은 출발 컬럼 끝 '→' + 다음 컬럼 '↓ 도착지 시간'으로 쪼개져 있음
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// w(폭)는 Thai Airways 파서용 — 날짜 헤더가 한 덩어리로 올 때 글자 위치를 비례 계산한다
type Item = { t: string; x: number; y: number; w?: number }
type ParsedRosterFlight = {
  flight_date: string
  flight_number: string
  origin: string | null
  destination: string | null
  std: string | null
  sta: string | null
  aircraft_type: string | null
  overnight: boolean
  report_time?: string | null   // 그날 첫 비행에만: 리포트 시각
  duty_end_time?: string | null // 그날 첫 비행에만: 듀티 종료 시각
}

// "비행 없는 날" — 오프·스탠바이·SIM·지상 (2026-09-02, 앱 스케줄 달력용).
// 옵셔널 응답 필드라 구버전 앱은 몰라도 안전하다 (앱 디코더가 명시 키만 읽음).
// 하루 = 최대 한 행: 비행이 있는 날은 비행이 주인이라 day 행을 만들지 않는다.
export type ParsedRosterDay = {
  date: string                                    // "2026-09-05"
  kind: 'off' | 'standby' | 'sim' | 'ground'
  label: string | null                            // 회사 코드 원문 (DO, SB1…)
}

const TYPE_MAP: Record<string, string> = {
  T738: 'B737-800',
  T739: 'B737-900',
  T79A: 'B737-900',
}
const TIME = /^\d{2}:\d{2}$/
const FLT = /^[A-Z]{2,3}\d{2,4}[A-Z]?$/
const AP = /^\*?[A-Z]{3,4}$/
const OFF = new Set(['RERP', 'RFD', 'PHDO', 'DO', 'AL', 'VAC'])
const SBY = new Set(['SB', 'SB1', 'SB2', 'SB3', 'SMS'])
const DOW = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])

export async function POST(req: NextRequest) {
  // 세션(쿠키 또는 Bearer 토큰) 또는 시크릿(관리 테스트용)으로 인증
  const secret = req.nextUrl.searchParams.get('secret')
  if (!process.env.SEED_SECRET || secret !== process.env.SEED_SECRET) {
    const user = await createApiSupabase(req).getUser()
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Please upload a roster file (PDF or Excel).' }, { status: 400 })
  }

  const buf = await file.arrayBuffer()

  // 엑셀(.xlsx)은 zip이라 'PK'로 시작 — 대한항공 달력형 로스터의 엑셀 내보내기.
  // 카톡을 거쳐 파일명이 바뀌어도 내용으로 판별한다. (지금 로스터 엑셀 양식은 이것뿐)
  const sig = new Uint8Array(buf.slice(0, 2))
  if (sig[0] === 0x50 && sig[1] === 0x4b) {
    let kx: KalRosterResult | null = null
    try {
      kx = await parseKalRosterXlsx(buf)
    } catch (err) {
      return NextResponse.json({ error: "Couldn't read this Excel file: " + String(err) }, { status: 422 })
    }
    if (!kx) {
      // 회사 로그북 엑셀을 로스터 칸에 올린 실수면 어느 칸인지 알려준다 (회사 로그북 쪽과 대칭)
      if (await xlsxLooksLikeCompanyLog(buf)) {
        return NextResponse.json(
          { error: 'This is a company logbook file — please upload it in the Company logbook section above.' },
          { status: 422 }
        )
      }
      return NextResponse.json(
        { error: "This Excel roster format isn't supported yet. Try exporting the roster as a PDF instead." }, { status: 422 })
    }
    if (!kx.flights.length) {
      return NextResponse.json({ error: 'No flights found in this Korean Air roster.' }, { status: 422 })
    }
    return NextResponse.json(kx)
  }

  // 이름만 .xls이고 실제는 HTML 표 — 진에어 "Crew Daily Roster" (2026-08-21).
  // 옛 웹 시스템들이 HTML을 .xls로 내보낸다. 첫 글자 '<'로 판별한다
  const textHead = new TextDecoder().decode(buf.slice(0, 64)).replace(/^\uFEFF/, '').trimStart()
  if (textHead.startsWith('<')) {
    const html = new TextDecoder().decode(buf)
    if (isJinairRoster(html)) {
      const result = parseJinairRoster(html)
      if (!result || !result.flights.length) {
        return NextResponse.json({ error: 'No flights found in this Jin Air roster.' }, { status: 422 })
      }
      return NextResponse.json(result)
    }
    return NextResponse.json({ error: "This roster format isn't supported yet." }, { status: 422 })
  }

  let items: Item[] = []
  let pdfDoc: Awaited<ReturnType<typeof getDocumentProxy>> | null = null
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buf.slice(0)))
    pdfDoc = pdf
    const page = await pdf.getPage(1)
    const tc = await page.getTextContent()
    for (const raw of tc.items as { str?: string; transform?: number[]; width?: number }[]) {
      const t = (raw.str ?? '').replace(/\u200B/g, '').trim()
      if (t && raw.transform) items.push({ t, x: raw.transform[4], y: raw.transform[5], w: raw.width })
    }
  } catch (err) {
    return NextResponse.json({ error: "Couldn't read this PDF: " + String(err) }, { status: 422 })
  }

  // 기간(연도)
  const full = items.map((i) => i.t).join(' ')

  // Peach Aviation 로스터는 형식이 전혀 달라 전용 파서로 (문구로 자동 감지)
  if (pdfDoc && isPeachRoster(full)) {
    const result = await parsePeachRoster(pdfDoc as unknown as Parameters<typeof parsePeachRoster>[0])
    if (!result.period || !result.flights.length) {
      return NextResponse.json({ error: 'No flights found in this Peach roster.' }, { status: 422 })
    }
    return NextResponse.json(result)
  }

  // Jeju Air(CrewConnex)도 여러 쪽이라 문서를 통째로 넘긴다.
  // 크루 명단이 편마다 딸려오고 로스터가 역순이라 전용 파서가 그걸 다 맡는다
  if (pdfDoc && isJejuRoster(full)) {
    const result = await parseJejuRoster(pdfDoc as unknown as Parameters<typeof parseJejuRoster>[0])
    if (!result.period || !result.flights.length) {
      return NextResponse.json({ error: 'No flights found in this Jeju Air roster.' }, { status: 422 })
    }
    const { year, month } = result.period
    const mm = String(month).padStart(2, '0')
    const last = new Date(year, month, 0).getDate()
    return NextResponse.json({
      period: { start: `${year}-${mm}-01`, end: `${year}-${mm}-${last}` },
      flights: result.flights,
      stats: { flights: result.flights.length, offDays: 0, standbyDays: 0 },
    })
  }

  // Eastar Jet은 "한 줄이 한 활동"인 표 형식이고 **여러 쪽**이다 —
  // 여기서 모으는 items는 1쪽뿐이라 문서를 통째로 넘겨 파서가 쪽을 순회하게 한다 (Peach와 같은 방식)
  if (pdfDoc && isEastarRoster(full)) {
    const result = await parseEastarRoster(pdfDoc as unknown as Parameters<typeof parseEastarRoster>[0])
    if (!result.period || !result.flights.length) {
      return NextResponse.json({ error: 'No flights found in this Eastar Jet roster.' }, { status: 422 })
    }
    const { year, month } = result.period
    const mm = String(month).padStart(2, '0')
    const last = new Date(year, month, 0).getDate()
    return NextResponse.json({
      period: { start: `${year}-${mm}-01`, end: `${year}-${mm}-${last}` },
      flights: result.flights,
      stats: { flights: result.flights.length, offDays: 0, standbyDays: 0 },
      // 데드헤드는 편명이 없어 넣지 않았다 — 몇 건인지는 알려 준다
      notes: result.deadheads
        ? [`${result.deadheads} deadhead (DH) legs have no flight number and weren't added — add them by hand if you need them.`]
        : undefined,
    })
  }

  // Korean Air 로스터 2종 (2026-08-20) — 크루넷 어디서 뽑느냐에 따라 양식이 다르다.
  //  ① "Crew Roster Report"(cwp…): 비행+승무원 명단, STD/STA에 날짜까지 온다
  //  ② "Roster Report" 달력형: DO·RESERVE 포함 (같은 표의 엑셀은 위 PK 분기가 받는다)
  if (pdfDoc && isKalCwpRoster(full)) {
    const result = await parseKalCwpRoster(pdfDoc as unknown as Parameters<typeof parseKalCwpRoster>[0])
    if (!result || !result.flights.length) {
      return NextResponse.json({ error: 'No flights found in this Korean Air roster.' }, { status: 422 })
    }
    return NextResponse.json(result)
  }
  if (pdfDoc && isKalCalendarRoster(full)) {
    const result = await parseKalCalendarRoster(pdfDoc as unknown as Parameters<typeof parseKalCalendarRoster>[0])
    if (!result || !result.flights.length) {
      return NextResponse.json({ error: 'No flights found in this Korean Air roster.' }, { status: 422 })
    }
    return NextResponse.json(result)
  }

  // Air Premia "Crew Roster Report" (PDC, 2026-08-21) — 이스타도 같은 제목을 쓰지만
  // 이스타 지문은 ZE 편명을 요구해 충돌 없다 (여기는 YP 편명 + STD(L)/(Z) 두 벌 헤더)
  if (pdfDoc && isPremiaRoster(full)) {
    const result = await parsePremiaRoster(pdfDoc as unknown as Parameters<typeof parsePremiaRoster>[0])
    if (!result || !result.flights.length) {
      return NextResponse.json({ error: 'No flights found in this Air Premia roster.' }, { status: 422 })
    }
    return NextResponse.json(result)
  }

  // Thai Lion Air "Personal Crew Schedule Report" **목록형(long)** — 아래 기본(격자형) 파서와
  // 제목이 같지만 여러 쪽 세로 목록이라 전용 파서로 (2026-08-25 실파일 검증).
  // 격자형 PDF에는 'Schedule Details'/'Debrief times' 헤더가 없어 지문이 겹치지 않는다.
  if (pdfDoc && isLionLongRoster(full)) {
    const result = await parseLionLongRoster(pdfDoc as unknown as Parameters<typeof parseLionLongRoster>[0])
    if (!result || !result.flights.length) {
      return NextResponse.json({ error: 'No flights found in this Lion Air roster.' }, { status: 422 })
    }
    return NextResponse.json(result)
  }

  // Thai Airways는 가로 31일 달력 격자라 Lion 파서(세로 컬럼)로는 못 읽는다 → 전용 파서
  if (isThaiRoster(full)) {
    const result = parseThaiRoster(items)
    if (!result.period || !result.flights.length) {
      return NextResponse.json({ error: 'No flights found in this Thai Airways roster.' }, { status: 422 })
    }
    const { year, month } = result.period
    const mm = String(month).padStart(2, '0')
    const last = new Date(year, month, 0).getDate()
    // 반환 모양은 Lion·Peach와 똑같이 — 앱이 period.start/end 와 stats 를 그대로 읽는다
    return NextResponse.json({
      period: { start: `${year}-${mm}-01`, end: `${year}-${mm}-${last}` },
      flights: result.flights,
      stats: { flights: result.flights.length, offDays: 0, standbyDays: 0 },
    })
  }

  const period = full.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/)
  if (!period) {
    // Lion 기간 표기가 없다 — Air Canada Block Report일 수 있다 (로그북과 같은 파일이
    // 로스터 겸용, 2026-08-10 라이언님 확인). 여기 1쪽짜리 무정렬 full로는 판별이 안 되는
    // 구조라(헤더가 뒤쪽에 있다 — 문구 판별 두 번 실패한 실측), 전 페이지를 줄 단위로
    // 읽는 AC 파서에 통째로 넘겨 판별과 파싱을 한 번에 한다. AC가 아니면 null이라 무해.
    const ex = await acExtract(new Uint8Array(await file.arrayBuffer())).catch(() => null)
    const r = ex ? acBuildRoster(ex) : null
    if (r && r.flights.length && r.period) {
      return NextResponse.json({
        period: r.period,
        flights: r.flights,
        stats: { flights: r.flights.length, offDays: 0, standbyDays: 0 },
        notes: r.notes,
      })
    }
    // 회사 로그북 PDF(KAL Flight Log·Lion 인쇄본)를 로스터 칸에 올린 실수면 어느 칸인지
    // 알려준다 — 엑셀 쪽(xlsxLooksLikeCompanyLog)과 대칭. 새 지문을 발명하지 않고
    // 회사 로그북 라우트의 실제 파서를 판별기로 재사용한다(수락 조건 드리프트 방지).
    // pdf.js가 버퍼를 소비(detach)할 수 있어 시도마다 새 복사본을 준다(로그북 라우트와 같은 이유).
    const kal = await kalExtract(new Uint8Array(await file.arrayBuffer())).catch(() => null)
    const logRows = kal ? null
      : await pdfToCompanyRows(new Uint8Array(await file.arrayBuffer())).catch(() => null)
    if (kal || (logRows && logRows.length >= 2)) {
      return NextResponse.json(
        { error: 'This is a company logbook file — please upload it in the Company logbook section above.' },
        { status: 422 }
      )
    }
    return NextResponse.json({ error: "This doesn't look like a roster. (No period line found.)" }, { status: 422 })
  }
  const year = period[3]

  // 날짜 헤더 → 컬럼
  const headerItems = items.filter((i) => /^\d{2}\/\d{2}$/.test(i.t))
  if (headerItems.length < 25) {
    return NextResponse.json({ error: "Couldn't find the date columns." }, { status: 422 })
  }
  const headerY = Math.max(...headerItems.map((i) => i.y))
  const cols = headerItems
    .filter((i) => Math.abs(i.y - headerY) < 5)
    .sort((a, b) => a.x - b.x)
  const totalItem = items.find((i) => i.t.includes('Total Hours'))
  const yFloor = totalItem ? totalItem.y : 0

  // 본문 토큰만: 헤더 아래 ~ 통계 위, 요일·직책코드(P, D,P) 제외
  const body = items.filter(
    (i) =>
      i.y > yFloor && i.y < headerY - 8 &&
      !DOW.has(i.t) &&
      !/^[A-Z](,[A-Z])?$/.test(i.t)
  )
  const colToks: string[][] = cols.map(() => [])
  for (const it of body) {
    let best = 0
    let bd = Infinity
    for (let c = 0; c < cols.length; c++) {
      const d = Math.abs(it.x - cols[c].x)
      if (d < bd) { bd = d; best = c }
    }
    colToks[best].push(`${(1e6 - it.y).toFixed(2)}|${it.x.toFixed(2)}|${it.t}`)
  }

  const flights: ParsedRosterFlight[] = []
  const days: ParsedRosterDay[] = []
  // 격자에서 OFF·SBY 외의 순수 알파벳 듀티 코드(SIM·훈련 등)는 아직 표본이 없어
  // days에 넣지 않는다 — 대신 notes로 원문을 보고해 다음 업로드에서 코드를 수집한다
  // (서버 배포만으로 세트에 추가 가능, 2026-09-02)
  const unknownCodes = new Set<string>()
  let offDays = 0
  let standbyDays = 0
  let bare = 0   // 편명만 읽히고 구간·시각이 하나도 없는 줄 — 넣지 않는다 (아래 참고)

  for (let ci = 0; ci < cols.length; ci++) {
    const [dd, mm] = cols[ci].t.split('/')
    // 해 넘김 로스터(12월→1월): 컬럼 월이 시작 월보다 작으면 종료 연도 사용
    const colYear = parseInt(mm, 10) < parseInt(period[2], 10) ? period[6] : year
    const date = `${colYear}-${mm}-${dd}`
    const toks = colToks[ci].sort().map((s) => s.split('|')[2])
    // 듀티: 컬럼 맨 위 시각 = 리포트, 맨 아래 시각 = 듀티 종료 (비행 블록 밖)
    const reportTime = toks.length && TIME.test(toks[0]) ? toks[0] : null
    const dutyEndTime = toks.length && TIME.test(toks[toks.length - 1]) ? toks[toks.length - 1] : null
    const firstFlightIdx = flights.length
    const dayCodes: { kind: 'off' | 'standby'; label: string }[] = []
    let i = 0
    while (i < toks.length) {
      const t = toks[i]
      if (OFF.has(t)) { offDays++; dayCodes.push({ kind: 'off', label: t }); i++ }
      else if (SBY.has(t)) { standbyDays++; dayCodes.push({ kind: 'standby', label: t }); i++ }
      else if (t === '↓') {
        // 전날 자정 넘김 비행의 도착 부분: ↓ [공항] [시간]
        let ap: string | null = null
        let tm: string | null = null
        let j = i + 1
        while (j < toks.length && (AP.test(toks[j]) || TIME.test(toks[j]))) {
          if (TIME.test(toks[j])) tm = toks[j]
          else if (AP.test(toks[j])) ap = toks[j].replace(/^\*/, '')
          j++
        }
        const prev = flights[flights.length - 1]
        if (prev && !prev.destination) {
          prev.destination = ap
          prev.sta = tm
          prev.overnight = true
        }
        i = j
      } else if (FLT.test(t) && !TIME.test(t)) {
        const f: ParsedRosterFlight = {
          flight_date: date, flight_number: t,
          origin: null, destination: null, std: null, sta: null,
          aircraft_type: null, overnight: false,
        }
        i++
        const aps: string[] = []
        while (i < toks.length) {
          const u = toks[i]
          if (u === '→' || u === '↓') { f.overnight = true; i++; continue }
          if (TIME.test(u)) {
            if (f.std === null) f.std = u
            else f.sta = u
            i++
          } else if (/^\[[A-Z0-9]+\]$/.test(u)) {
            const code = u.slice(1, -1)
            f.aircraft_type = TYPE_MAP[code] ?? code
            i++
            break
          } else if (AP.test(u) && aps.length < 2) {
            aps.push(u.replace(/^\*/, ''))
            i++
          } else break
        }
        f.origin = aps[0] ?? null
        f.destination = aps[1] ?? null
        // 편명 뒤에 시각·공항이 하나도 안 따라온 줄 — 표기가 달라 못 읽은 것이다. 이런 행을 넣으면
        // 앱 홈·스케줄에 "? → ?  --:-- – --:--"로 남고, STD가 NULL이라 서버 키가 안 겹쳐 정리도 안 된다
        // (2026-08-23 라이언님 실측: 8/1~9 12편). 넣지 않고 몇 줄인지 notes로 알린다.
        if (!f.origin && !f.destination && !f.std && !f.sta) bare++
        else flights.push(f)
      } else {
        // 미지의 순수 알파벳 코드(SIM·훈련 후보)는 수집만 — 위 unknownCodes 주석 참고
        if (/^[A-Z]{2,6}\d?$/.test(t) && !TIME.test(t) && !DOW.has(t)) unknownCodes.add(t)
        i++ // 듀티 시작/종료 시각 등은 건너뜀
      }
    }
    // 그날 첫 비행에 듀티 시각 붙이기
    if (flights.length > firstFlightIdx) {
      flights[firstFlightIdx].report_time = reportTime
      flights[firstFlightIdx].duty_end_time = dutyEndTime
    } else if (dayCodes.length) {
      // 비행 없는 날만 day 행 — 대표 kind는 standby 우선(코드가 겹치는 날은 대기가 실질)
      const kind = dayCodes.some((c) => c.kind === 'standby') ? 'standby' as const : 'off' as const
      days.push({ date, kind, label: dayCodes.map((c) => c.label).join('/') })
    }
  }

  const notes: string[] = []
  if (bare) notes.push(`${bare} rows had only a flight number (no route or time) and were skipped — check the file.`)
  if (unknownCodes.size)
    notes.push(`Duty codes not yet recognized: ${Array.from(unknownCodes).sort().join(', ')} — send this roster to support and we'll add them to the calendar.`)

  return NextResponse.json({
    period: { start: `${period[3]}-${period[2]}-${period[1]}`, end: `${period[6]}-${period[5]}-${period[4]}` },
    flights,
    days: days.length ? days : undefined,
    stats: { flights: flights.length, offDays, standbyDays },
    // notes는 웹 미리보기와 **앱 미리보기(영어 UI)** 양쪽에 그대로 보인다 — 영어로 쓴다 (AC와 동일)
    notes: notes.length ? notes : undefined,
  })
}
