import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createServerSupabase } from '@/lib/supabase-server'
import { parseCompanyLog } from '@/lib/company-log'

// Thai Lion Air 회사 로그북(PilotLogBookReport) 엑셀 파서
// 확장자가 .csv로 내려오지만 실제 내용은 xlsx다 (파일 시그니처 'PK').
// 엑셀 파싱은 서버에서 하고, IATA→ICAO 변환도 여기서 airports 테이블로 처리한다.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_BYTES = 10 * 1024 * 1024

// 엑셀 셀 값 → 문자열. exceljs는 셀 타입에 따라 string/number/Date/객체를 준다.
function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) {
    // 엑셀의 '시각 전용' 값은 1899-12-30 기준으로 들어온다 → HH:MM
    if (v.getUTCFullYear() < 1901) {
      return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`
    }
    return v.toISOString().slice(0, 10)
  }
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] }
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('').trim()
    if (o.text !== undefined) return String(o.text).trim()
    if (o.result !== undefined) return String(o.result).trim()
  }
  return String(v).trim()
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '엑셀 파일을 올려주세요.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: '파일이 너무 커요 (10MB까지).' }, { status: 400 })
  }

  // 1) 엑셀 → 문자열 행 배열
  let rows: string[][] = []
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const ws = wb.worksheets[0]
    if (!ws) throw new Error('시트가 없어요')
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = []
      // row.eachCell은 빈 칸을 건너뛰므로 열 번호로 직접 채운다
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = cellText(cell.value)
      })
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = ''
      rows.push(cells)
    })
  } catch (err) {
    return NextResponse.json(
      { error: '엑셀을 읽지 못했어요. 회사 시스템에서 받은 파일 그대로 올려주세요. (' + String(err) + ')' },
      { status: 422 }
    )
  }
  if (rows.length < 2) {
    return NextResponse.json({ error: '비행 기록이 없는 파일이에요.' }, { status: 422 })
  }

  // 2) 파일에 나온 IATA 코드만 모아 ICAO 조회
  const header = rows[0].map((s) => s.trim())
  const depIdx = header.indexOf('DepPlace')
  const arrIdx = header.indexOf('ArrPlace')
  const codes = new Set<string>()
  for (let r = 1; r < rows.length; r++) {
    for (const i of [depIdx, arrIdx]) {
      const v = (i >= 0 ? rows[r][i] : '')?.trim().toUpperCase()
      if (v && v.length === 3) codes.add(v)
    }
  }
  const iataToIcao: Record<string, string> = {}
  if (codes.size) {
    const { data } = await supabase
      .from('airports')
      .select('ident, iata, type')
      .in('iata', Array.from(codes))
    // 같은 IATA가 여러 공항에 붙어 있으면 큰 공항을 우선
    const rank = (t: string | null) =>
      t === 'large_airport' ? 3 : t === 'medium_airport' ? 2 : t === 'small_airport' ? 1 : 0
    const best: Record<string, { ident: string; r: number }> = {}
    for (const a of data ?? []) {
      const key = (a.iata ?? '').toUpperCase()
      if (!key) continue
      const r = rank(a.type)
      if (!best[key] || r > best[key].r) best[key] = { ident: a.ident, r }
    }
    for (const k of Object.keys(best)) iataToIcao[k] = best[k].ident
  }

  // 3) 파싱
  const result = parseCompanyLog(rows, { iataToIcao })
  if (!result.flights.length && result.errors.length) {
    return NextResponse.json({ error: result.errors[0] }, { status: 422 })
  }
  return NextResponse.json(result)
}
