import { NextRequest, NextResponse } from 'next/server'

// METAR/TAF 프록시 — aviationweather.gov (무료, 키 불필요)
// 브라우저 CORS 제약 없이 서버에서 받아서 전달한다
export const dynamic = 'force-dynamic'

const BASE = 'https://aviationweather.gov/api/data'

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get('id') ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9]{3,4}$/.test(id)) {
    return NextResponse.json({ error: '공항 코드는 ICAO 4글자로 넣어주세요.' }, { status: 400 })
  }
  const get = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) return null
      const t = (await res.text()).trim()
      return t || null
    } catch {
      return null
    }
  }
  const [metar, taf] = await Promise.all([
    get(`${BASE}/metar?ids=${id}&format=raw`),
    get(`${BASE}/taf?ids=${id}&format=raw`),
  ])
  return NextResponse.json({ metar, taf })
}
