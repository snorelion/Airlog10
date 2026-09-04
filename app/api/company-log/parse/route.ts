import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { authenticateParse } from '@/lib/app-auth'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseCompanyLog } from '@/lib/company-log'
import { isJejuCompanyLog, parseJejuCompanyLog } from '@/lib/company-log-jeju'
import { pdfToCompanyRows } from '@/lib/company-log-pdf'
import { kalExtract, kalBuildFlights } from '@/lib/company-log-kal'
import { acExtract, acBuildFlights } from '@/lib/company-log-ac'
import { decodeLogbookBuffer, parseLogbook } from '@/lib/logten'

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

// 파일에 나온 3글자 공항 코드(IATA)만 모은다 — 헤더 이름으로 출발·도착 컬럼을 찾는다
function collectIata(rows: string[][], depName: string, arrName: string): Set<string> {
  const header = rows[0].map((s) => s.trim())
  const depIdx = header.indexOf(depName)
  const arrIdx = header.indexOf(arrName)
  const codes = new Set<string>()
  for (let r = 1; r < rows.length; r++) {
    for (const i of [depIdx, arrIdx]) {
      const v = (i >= 0 ? rows[r][i] : '')?.trim().toUpperCase()
      if (v && v.length === 3) codes.add(v)
    }
  }
  return codes
}

// 파일에 나온 IATA 코드들 → ICAO. 같은 IATA가 여러 공항이면 큰 공항 우선.
async function lookupIcao(
  supabase: SupabaseClient,
  codes: Set<string>
): Promise<Record<string, string>> {
  const iataToIcao: Record<string, string> = {}
  if (!codes.size) return iataToIcao
  const { data } = await supabase
    .from('airports')
    .select('ident, iata, type')
    .in('iata', Array.from(codes))
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
  return iataToIcao
}

export async function POST(req: NextRequest) {
  // 쿠키 세션(웹)·Bearer 토큰(2.5.x 앱)·StoreKit 거래 서명(3.0 앱) — lib/app-auth.ts
  const auth = await authenticateParse(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const supabase = auth.supabase

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Please upload an Excel or PDF file.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 10MB).' }, { status: 400 })
  }

  // 1) 파일 → 문자열 행 배열 (엑셀 또는 같은 로그의 PDF 출력본 — 값이 1:1 동일)
  const buf = await file.arrayBuffer()
  const head = new Uint8Array(buf.slice(0, 4))
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 // %PDF
  const isZip = head[0] === 0x50 && head[1] === 0x4b // "PK" — xlsx(회사 엑셀 · .csv 확장자여도 실제는 xlsx)

  // 0) 텍스트 파일 = LogTen 내보내기(원시 필드명 · Dynamic Export) — 앱의 통합 업로드가 여기로
  //    보낸다 (2026-09-04). 예전엔 웹 import 페이지가 브라우저에서만 파싱해서 앱에선 .txt가
  //    "엑셀·PDF만"으로 거절됐다. PDF도 zip도 아니면 텍스트로 읽어 지문을 본다.
  if (!isPdf && !isZip) {
    const result = parseLogbook(decodeLogbookBuffer(buf))
    if (!result.flights.length) {
      return NextResponse.json({ error: result.errors[0] ?? 'No flight records found in this file.' }, { status: 422 })
    }
    return NextResponse.json(result)
  }
  // ⚠️ pdf.js는 받은 버퍼를 파싱하면서 소비(detach)할 수 있다 — 파서마다 복사본을 준다.
  //    (KAL 판별을 지나 AC 판별로 넘어갈 때 죽어 500이 나던 원인 — 2026-08-10 실기기 실측)
  const pdfCopy = () => new Uint8Array(buf.slice(0))
  let rows: string[][] = []
  if (isPdf) {
    // 대한항공 "Flight Log Report"인지 먼저 자동 감지 — 맞으면 전용 파서로 끝낸다
    const kal = await kalExtract(pdfCopy()).catch(() => null)
    if (kal) {
      try {
        const codes = new Set<string>()
        for (const r of kal.rows) {
          codes.add(r.dep.toUpperCase())
          codes.add(r.arr.toUpperCase())
        }
        const result = kalBuildFlights(kal, await lookupIcao(supabase, codes))
        if (!result.flights.length) {
          return NextResponse.json({ error: result.errors[0] }, { status: 422 })
        }
        return NextResponse.json(result)
      } catch (err) {
        // 500으로 죽는 대신 원인을 실어 보낸다 — 재현하면 메시지로 바로 진단된다
        return NextResponse.json(
          { error: 'Something went wrong while reading the Korean Air file: ' + String(err) }, { status: 422 })
      }
    }
    // Air Canada "Block Report" — 표 형식이라 좌표 없이 줄만 읽으면 된다.
    // 이 양식은 크루 배정 줄에 **UTC**가 적혀 있어 시간대 변환이 아예 필요 없다.
    const ac = await acExtract(pdfCopy()).catch(() => null)
    if (ac) {
      try {
        const codes = new Set<string>()
        for (const l of ac.legs) { codes.add(l.dep); codes.add(l.arr) }
        const result = acBuildFlights(ac, await lookupIcao(supabase, codes))
        if (!result.flights.length) {
          return NextResponse.json({ error: result.errors[0] }, { status: 422 })
        }
        return NextResponse.json(result)
      } catch (err) {
        return NextResponse.json(
          { error: 'Something went wrong while reading the Air Canada file: ' + String(err) }, { status: 422 })
      }
    }

    try {
      rows = await pdfToCompanyRows(pdfCopy())
    } catch (err) {
      return NextResponse.json(
        { error: "Couldn't read this PDF. Please upload the file from your company system as-is. (" + String(err) + ')' },
        { status: 422 }
      )
    }
    if (rows.length < 2) {
      return NextResponse.json(
        { error: "This doesn't look like a company logbook PDF. (No flight lines found — for a roster PDF, use the Roster section.)" },
        { status: 422 }
      )
    }
  } else try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.worksheets[0]
    if (!ws) throw new Error('no worksheet found')
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
      { error: "Couldn't read this Excel file. Please upload the file from your company system as-is. (" + String(err) + ')' },
      { status: 422 }
    )
  }
  if (rows.length < 2) {
    return NextResponse.json({ error: 'No flight records found in this file.' }, { status: 422 })
  }

  // 2) 제주항공 flightHistory 엑셀 — 첫 줄 헤더(camelCase)로 자동 감지, 전용 파서로 끝낸다
  if (isJejuCompanyLog(rows[0])) {
    const result = parseJejuCompanyLog(rows, {
      iataToIcao: await lookupIcao(supabase, collectIata(rows, 'stFr', 'stTo')),
    })
    if (!result.flights.length) {
      return NextResponse.json(
        { error: result.errors[0] ?? 'No flights found in this file.' }, { status: 422 })
    }
    return NextResponse.json(result)
  }

  // 3) 파일에 나온 IATA 코드만 모아 ICAO 조회 → Lion 파서
  const iataToIcao = await lookupIcao(supabase, collectIata(rows, 'DepPlace', 'ArrPlace'))

  const result = parseCompanyLog(rows, { iataToIcao })
  if (!result.flights.length && result.errors.length) {
    // 로스터 엑셀을 회사 로그북 칸에 올린 실수 (2026-08-20 실측, KE 달력형) —
    // "형식이 아니에요"보다 어느 칸에 올릴지 알려주는 게 훨씬 빠르다
    const isRosterXlsx = !isPdf &&
      rows.slice(0, 5).some((r) => r.some((c) => (c ?? '').trim() === 'Pairing/Activity'))
    if (isRosterXlsx) {
      return NextResponse.json(
        { error: 'This is a roster (schedule) file — please upload it in the Roster section below.' },
        { status: 422 }
      )
    }
    return NextResponse.json({ error: result.errors[0] }, { status: 422 })
  }
  if (isPdf) {
    result.notes = ['Read from the company logbook PDF printout — same values as the Excel file.', ...(result.notes ?? [])]
  }
  return NextResponse.json(result)
}
