import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import tzlookup from '@photostructure/tz-lookup'

// 전세계 공항·활주로 시딩 — OurAirports 오픈데이터(퍼블릭 도메인)
// 호출: GET /api/airports/seed?secret=SEED_SECRET&what=airports|runways
// 한 번만 실행하면 됨 (수만 행이라 airports/runways를 나눠 실행)
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const AIRPORTS_CSV = 'https://davidmegginson.github.io/ourairports-data/airports.csv'
const RUNWAYS_CSV = 'https://davidmegginson.github.io/ourairports-data/runways.csv'

// 따옴표 포함 CSV 한 줄 파서
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = false
      } else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
  }
  out.push(cur)
  return out
}

function num(s: string): number | null {
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

// 나라 전체가 한 시간대인 곳은 국가코드로 확정한다.
//
// 좌표 계산은 국경 근처에서 옆 나라로 넘어간다 (2026-08-05 실측):
//   · 태국 베통(BTZ)      → Asia/Kuala_Lumpur  ⚠️ 1시간 틀어짐
//   · 대만 마쭈(RCFG·RCMT) → Asia/Shanghai     (오프셋은 같아 무해했지만 부정확)
//   · 한국 울릉(KR-1113)   → Asia/Shanghai     ← 이건 OurAirports 좌표가 아예 틀렸다
//                                                (내몽골 좌표). 국가코드로 확정하면 이런
//                                                소스 오류까지 함께 막힌다.
//
// ⚠️ 나라 안에 시간대가 여럿인 곳은 절대 넣지 말 것 — 좌표 계산을 그대로 믿어야 한다.
//    미국·캐나다·러시아·호주·브라질·멕시코·인도네시아·카자흐스탄·몽골·칠레·에콰도르
//    ·포르투갈(아조레스)·스페인(카나리아)·프랑스(해외령)·뉴질랜드(채텀) 등.
//    말레이시아도 뺐다 — KL/쿠칭 두 존이 실제로 있고, 오프셋이 같아 무해하다.
const COUNTRY_TZ: Record<string, string> = {
  // 동아시아·동남아
  TH: 'Asia/Bangkok',      KR: 'Asia/Seoul',       JP: 'Asia/Tokyo',
  TW: 'Asia/Taipei',       CN: 'Asia/Shanghai',    HK: 'Asia/Hong_Kong',
  MO: 'Asia/Macau',        SG: 'Asia/Singapore',   VN: 'Asia/Ho_Chi_Minh',
  KH: 'Asia/Phnom_Penh',   LA: 'Asia/Vientiane',   MM: 'Asia/Yangon',
  PH: 'Asia/Manila',       BN: 'Asia/Brunei',
  // 남아시아
  IN: 'Asia/Kolkata',      BD: 'Asia/Dhaka',       LK: 'Asia/Colombo',
  NP: 'Asia/Kathmandu',    PK: 'Asia/Karachi',     BT: 'Asia/Thimphu',
  MV: 'Indian/Maldives',   AF: 'Asia/Kabul',
  // 중앙아시아
  UZ: 'Asia/Tashkent',     KG: 'Asia/Bishkek',     TJ: 'Asia/Dushanbe',
  TM: 'Asia/Ashgabat',
  // 중동
  AE: 'Asia/Dubai',        QA: 'Asia/Qatar',       KW: 'Asia/Kuwait',
  BH: 'Asia/Bahrain',      OM: 'Asia/Muscat',      SA: 'Asia/Riyadh',
  JO: 'Asia/Amman',        IL: 'Asia/Jerusalem',   LB: 'Asia/Beirut',
  IQ: 'Asia/Baghdad',      IR: 'Asia/Tehran',      TR: 'Europe/Istanbul',
  // 유럽 — 대륙은 대부분 오프셋이 같아 급하지 않다. 경계가 다른 곳만.
  GB: 'Europe/London',     IE: 'Europe/Dublin',
}

// 좌표 → IANA 시간대(Asia/Bangkok). 공항이 스스로 시간대를 알게 하려는 것 —
// 항공사마다 오프셋을 코드에 박던 방식은 미국(시간대 4개)·유럽(서머타임)에서 깨진다.
// 이름만 저장하면 서머타임 규칙은 기기의 tzdata가 최신으로 알아서 처리한다.
// ⚠️ tzlookup은 좌표가 범위 밖이거나 숫자가 아니면 throw 한다 — 전부 막고 null로.
function tzOf(lat: number | null, lon: number | null, country: string | null): string | null {
  // 나라가 확실하면 좌표를 보지 않는다 — 좌표가 틀려도 시간대는 맞는다
  if (country && COUNTRY_TZ[country]) return COUNTRY_TZ[country]
  if (lat === null || lon === null) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  try {
    return tzlookup(lat, lon) || null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!process.env.SEED_SECRET || secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const what = req.nextUrl.searchParams.get('what') ?? 'airports'
  const supabase = createAdminClient()

  if (what === 'airports') {
    const res = await fetch(AIRPORTS_CSV)
    if (!res.ok) return NextResponse.json({ error: 'CSV 다운로드 실패' }, { status: 502 })
    const text = await res.text()
    const lines = text.split('\n')
    const header = splitCsvLine(lines[0])
    const col = (cells: string[], name: string) => cells[header.indexOf(name)] ?? ''

    const rows = []
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue
      const c = splitCsvLine(line)
      const type = col(c, 'type')
      // 헬리포트·풍선기지·폐쇄 공항 제외 — 로그북에 쓸 공항만
      if (!['large_airport', 'medium_airport', 'small_airport', 'seaplane_base'].includes(type)) continue
      const ident = col(c, 'ident').trim().toUpperCase()
      if (!ident) continue
      const lat = num(col(c, 'latitude_deg'))
      const lon = num(col(c, 'longitude_deg'))
      const country = col(c, 'iso_country').trim() || null
      rows.push({
        ident,
        iata: col(c, 'iata_code').trim().toUpperCase() || null,
        name: col(c, 'name').trim() || null,
        type,
        lat,
        lon,
        elevation_ft: num(col(c, 'elevation_ft')) === null ? null : Math.round(num(col(c, 'elevation_ft'))!),
        country,
        municipality: col(c, 'municipality').trim() || null,
        tz: tzOf(lat, lon, country),
      })
    }
    let saved = 0
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await supabase.from('airports').upsert(rows.slice(i, i + 1000), { onConflict: 'ident' })
      if (error) return NextResponse.json({ error: error.message, saved }, { status: 500 })
      saved += Math.min(1000, rows.length - i)
    }
    // 시간대가 몇 개나 붙었는지 바로 보이게 — 호출 결과만으로 1차 검증이 된다
    const withTz = rows.filter((r) => r.tz).length
    return NextResponse.json({ ok: true, what, saved, withTz, withoutTz: rows.length - withTz })
  }

  if (what === 'runways') {
    const res = await fetch(RUNWAYS_CSV)
    if (!res.ok) return NextResponse.json({ error: 'CSV 다운로드 실패' }, { status: 502 })
    const text = await res.text()
    const lines = text.split('\n')
    const header = splitCsvLine(lines[0])
    const col = (cells: string[], name: string) => cells[header.indexOf(name)] ?? ''

    const rows = []
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue
      const c = splitCsvLine(line)
      const id = parseInt(col(c, 'id'), 10)
      const airport = col(c, 'airport_ident').trim().toUpperCase()
      if (isNaN(id) || !airport) continue
      rows.push({
        id,
        airport_ident: airport,
        length_ft: num(col(c, 'length_ft')) === null ? null : Math.round(num(col(c, 'length_ft'))!),
        width_ft: num(col(c, 'width_ft')) === null ? null : Math.round(num(col(c, 'width_ft'))!),
        surface: col(c, 'surface').trim() || null,
        lighted: col(c, 'lighted') === '1',
        closed: col(c, 'closed') === '1',
        le_ident: col(c, 'le_ident').trim() || null,
        le_heading: num(col(c, 'le_heading_degT')),
        he_ident: col(c, 'he_ident').trim() || null,
        he_heading: num(col(c, 'he_heading_degT')),
      })
    }
    let saved = 0
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await supabase.from('runways').upsert(rows.slice(i, i + 1000), { onConflict: 'id' })
      if (error) return NextResponse.json({ error: error.message, saved }, { status: 500 })
      saved += Math.min(1000, rows.length - i)
    }
    return NextResponse.json({ ok: true, what, saved })
  }

  return NextResponse.json({ error: 'what은 airports 또는 runways' }, { status: 400 })
}
