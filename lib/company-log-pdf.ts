// Thai Lion Air 회사 로그북의 "인쇄(PDF)" 출력본 파서
//
// 회사 시스템에서 같은 로그를 PDF로 뽑으면 CSV(실제 xlsx)와 값이 셀 단위로
// 1:1 동일하다 (2026-07-30, 같은 기간의 실파일 두 개를 대조해 확인).
// 그래서 이 파일은 PDF에서 글자를 읽어 엑셀 파서(parseCompanyLog)가 먹는
// rows[][] 형태로만 재구성하고, 해석 규칙은 전부 기존 파서를 재사용한다.
//
// 방식 (로스터 파서와 같은 좌표 기반):
//  1) 글자들의 좌표(x,y)를 읽어 y로 줄을 묶는다
//  2) 컬럼 헤더 줄(Date/Airport/Time/…/Flt time/Day/Night…)의 x위치를 기억
//  3) 날짜(dd/mm/yy)로 시작하는 데이터 줄의 각 토큰을 "x가 가장 가까운 컬럼"에 배정
//     — 빈 컬럼(야간 이착륙 없음, 시뮬 칸 등)이 자연스럽게 빈칸으로 남는다
//  4) 파일럿 줄("99186359 SANGIN JUNG (DMK-T738-CPT)")에서 Id·Name을 채운다

import { getDocumentProxy } from 'unpdf'
import { COMPANY_COLUMNS } from './company-log'

type Tok = { x: number; t: string }
type Line = { y: number; toks: Tok[] }

const DATE_RE = /^\d{2}\/\d{2}\/\d{2,4}$/
const PILOT_RE = /^(\d{5,})\s+(.+?)\s*\(/

// 헤더 줄 토큰 → 회사 컬럼명. 같은 라벨이 두 번 나오는 컬럼(Airport·Time·Type·Day·Night)은
// 나온 순서로 배정한다. 'Name PIC'는 한 토큰으로 붙어 나오기도 하고,
// Day 앞의 단독 'PIC'는 표시용 라벨이라 컬럼이 아니다.
function buildColmap(toks: Tok[]): { x: number; col: string }[] {
  const map: { x: number; col: string }[] = []
  const seen = new Set<string>()
  let daySeen = 0
  const add = (x: number, col: string) => {
    if (!seen.has(col)) { seen.add(col); map.push({ x, col }) }
  }
  for (const { x, t } of [...toks].sort((a, b) => a.x - b.x)) {
    if (t === 'Date') add(x, 'Date')
    else if (t === 'Airport') add(x, seen.has('DepPlace') ? 'ArrPlace' : 'DepPlace')
    else if (t === 'Time') add(x, !seen.has('DepTime') ? 'DepTime' : !seen.has('ArrTime') ? 'ArrTime' : 'SimTime')
    else if (t === 'Type') add(x, seen.has('ACType') ? 'SimType' : 'ACType')
    else if (t === 'Reg.' || t === 'Reg') add(x, 'Reg')
    else if (t === 'Flt time' || t === 'Flt') add(x, 'FltTime')
    else if (t === 'Name' || t === 'Name PIC') add(x, 'PicName')
    else if (t === 'Day') { add(x, daySeen === 0 ? 'TKoffsDay' : 'LandsDay'); daySeen++ }
    else if (t === 'Night') add(x, seen.has('TKoffsNight') ? 'LandsNight' : 'TKoffsNight')
    else if (t === 'PIC') { if (daySeen > 0) add(x, 'PIC') }
    else if (t === 'Co-Plt') add(x, 'CoPlt')
    else if (t === 'Instr') add(x, 'Instr')
  }
  return map
}

export async function pdfToCompanyRows(data: Uint8Array): Promise<string[][]> {
  const pdf = await getDocumentProxy(data)
  const rows: string[][] = [COMPANY_COLUMNS.slice()]
  let pilotId = ''
  let pilotName = ''
  let colmap: { x: number; col: string }[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const items: { x: number; y: number; t: string }[] = []
    for (const raw of tc.items as { str?: string; transform?: number[] }[]) {
      const t = (raw.str ?? '').replace(/\u200B/g, '').trim()
      if (t && raw.transform) items.push({ t, x: raw.transform[4], y: raw.transform[5] })
    }

    // y로 줄 묶기 (±2), 위 → 아래
    items.sort((a, b) => (Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x))
    const lines: Line[] = []
    for (const it of items) {
      const last = lines[lines.length - 1]
      if (last && Math.abs(last.y - it.y) <= 2) last.toks.push({ x: it.x, t: it.t })
      else lines.push({ y: it.y, toks: [{ x: it.x, t: it.t }] })
    }

    for (const line of lines) {
      const toks = [...line.toks].sort((a, b) => a.x - b.x)
      const joined = toks.map((t) => t.t).join(' ')

      // 파일럿 섹션 줄
      const pm = joined.match(PILOT_RE)
      if (pm && !DATE_RE.test(toks[0].t)) {
        pilotId = pm[1]
        pilotName = pm[2]
        continue
      }
      // 컬럼 헤더 줄 (페이지마다 반복될 수 있어 매번 갱신)
      if (toks.some((t) => t.t === 'Flt time' || t.t === 'Reg.' || t.t === 'Flt')) {
        colmap = buildColmap(toks)
        continue
      }
      // 데이터 줄: 날짜로 시작해야 함 (Totals·기간·꼬리말 등은 자연히 걸러짐)
      if (!colmap.length || !DATE_RE.test(toks[0].t)) continue

      const row: Record<string, string> = {}
      row['Id'] = pilotId
      row['Name'] = pilotName
      row['Date'] = toks[0].t
      for (const { x, t } of toks.slice(1)) {
        let best = colmap[0]
        for (const c of colmap) if (Math.abs(c.x - x) < Math.abs(best.x - x)) best = c
        if (best.col !== 'Date' && !row[best.col]) row[best.col] = t
      }
      rows.push(COMPANY_COLUMNS.map((c) => row[c] ?? ''))
    }
  }
  return rows
}
