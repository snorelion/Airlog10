import { NextRequest, NextResponse } from 'next/server'
import { getDocumentProxy } from 'unpdf'
import { createServerSupabase } from '@/lib/supabase-server'

// Lion Air "Personal Crew Schedule Report" PDF 파서
// 방식: 1페이지 글자들의 좌표(x,y)를 읽어 날짜 컬럼(dd/mm 헤더의 x)별로 묶고,
//       컬럼 안에서 위→아래 순서로 토큰을 해석한다. (실파일로 검증된 알고리즘)
// 함정: 자정 넘김 비행은 출발 컬럼 끝 '→' + 다음 컬럼 '↓ 도착지 시간'으로 쪼개져 있음
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Item = { t: string; x: number; y: number }
type ParsedRosterFlight = {
  flight_date: string
  flight_number: string
  origin: string | null
  destination: string | null
  std: string | null
  sta: string | null
  aircraft_type: string | null
  overnight: boolean
}

const TYPE_MAP: Record<string, string> = { T738: 'B738', T739: 'B739', T79A: 'B739' }
const TIME = /^\d{2}:\d{2}$/
const FLT = /^[A-Z]{2,3}\d{2,4}[A-Z]?$/
const AP = /^\*?[A-Z]{3,4}$/
const OFF = new Set(['RERP', 'RFD', 'PHDO', 'DO', 'AL', 'VAC'])
const SBY = new Set(['SB', 'SB1', 'SB2', 'SB3', 'SMS'])
const DOW = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])

export async function POST(req: NextRequest) {
  // 세션 또는 시크릿(관리 테스트용)으로 인증
  const secret = req.nextUrl.searchParams.get('secret')
  if (!process.env.SEED_SECRET || secret !== process.env.SEED_SECRET) {
    const supabase = createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'PDF 파일을 올려주세요.' }, { status: 400 })
  }

  let items: Item[] = []
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()))
    const page = await pdf.getPage(1)
    const tc = await page.getTextContent()
    for (const raw of tc.items as { str?: string; transform?: number[] }[]) {
      const t = (raw.str ?? '').replace(/\u200B/g, '').trim()
      if (t && raw.transform) items.push({ t, x: raw.transform[4], y: raw.transform[5] })
    }
  } catch (err) {
    return NextResponse.json({ error: 'PDF를 읽지 못했어요: ' + String(err) }, { status: 422 })
  }

  // 기간(연도)
  const full = items.map((i) => i.t).join(' ')
  const period = full.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/)
  if (!period) {
    return NextResponse.json({ error: '로스터 형식이 아니에요. (기간 표기를 찾지 못함)' }, { status: 422 })
  }
  const year = period[3]

  // 날짜 헤더 → 컬럼
  const headerItems = items.filter((i) => /^\d{2}\/\d{2}$/.test(i.t))
  if (headerItems.length < 25) {
    return NextResponse.json({ error: '날짜 컬럼을 찾지 못했어요.' }, { status: 422 })
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
  let offDays = 0
  let standbyDays = 0

  for (let ci = 0; ci < cols.length; ci++) {
    const [dd, mm] = cols[ci].t.split('/')
    const date = `${year}-${mm}-${dd}`
    const toks = colToks[ci].sort().map((s) => s.split('|')[2])
    let i = 0
    while (i < toks.length) {
      const t = toks[i]
      if (OFF.has(t)) { offDays++; i++ }
      else if (SBY.has(t)) { standbyDays++; i++ }
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
        flights.push(f)
      } else {
        i++ // 듀티 시작/종료 시각 등은 건너뜀
      }
    }
  }

  return NextResponse.json({
    period: { start: `${period[3]}-${period[2]}-${period[1]}`, end: `${period[6]}-${period[5]}-${period[4]}` },
    flights,
    stats: { flights: flights.length, offDays, standbyDays },
  })
}
