import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

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
      rows.push({
        ident,
        iata: col(c, 'iata_code').trim().toUpperCase() || null,
        name: col(c, 'name').trim() || null,
        type,
        lat: num(col(c, 'latitude_deg')),
        lon: num(col(c, 'longitude_deg')),
        elevation_ft: num(col(c, 'elevation_ft')) === null ? null : Math.round(num(col(c, 'elevation_ft'))!),
        country: col(c, 'iso_country').trim() || null,
        municipality: col(c, 'municipality').trim() || null,
      })
    }
    let saved = 0
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await supabase.from('airports').upsert(rows.slice(i, i + 1000), { onConflict: 'ident' })
      if (error) return NextResponse.json({ error: error.message, saved }, { status: 500 })
      saved += Math.min(1000, rows.length - i)
    }
    return NextResponse.json({ ok: true, what, saved })
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
