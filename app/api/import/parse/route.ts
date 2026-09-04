// 통합 임포트 파서 (앱 1.5.5 "통합 업로드 버튼"용) — 파일 종류(kind)까지 판별해 응답한다.
//
// 설계: 새 디스패치를 만들지 않고 기존 두 파스 라우트 핸들러를 그대로 호출해 합성한다.
//  · 구버전 앱(1.5.4 이하)이 쓰는 두 엔드포인트는 무접촉 — 회귀 없음
//  · 새 항공사 파서를 어느 한쪽 라우트에 붙이면 여기는 자동으로 따라온다 (드리프트 없음)
//  · 두 파스 라우트는 읽기 전용(DB 쓰기 없음)이라 둘 다 호출해도 부작용이 없다
//
// 응답: { kind: 'logbook', logbook: {…} } | { kind: 'roster', roster: {…} }
//     | { kind: 'both', logbook: {…}, roster: {…} }  — AC Block Report처럼 겸용인 파일.
//       kind가 both면 앱이 "기록으로 / 스케줄로" 선택 시트를 띄운다.
// 실패: 422 { error } — 기존 칸 안내 문구는 통합 UI에 칸이 없어 쓰지 않고 일반 문구로 답한다.
import { NextRequest, NextResponse } from 'next/server'
import { POST as parseLogbook } from '../../company-log/parse/route'
import { POST as parseRoster } from '../../roster/parse/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Please upload a logbook or roster file.' }, { status: 400 })
  }
  const buf = await file.arrayBuffer()

  // 핸들러마다 같은 파일로 새 요청을 만들어 준다 — 원 요청의 body는 한 번만 읽을 수 있고,
  // content-type의 multipart boundary도 새 FormData의 것으로 다시 생겨야 하기 때문.
  // URL·헤더를 그대로 넘겨 인증(Bearer/쿠키)이 두 핸들러에 함께 통과한다.
  // (?secret= 관리 테스트 통로는 로스터 라우트에만 있다 — 그쪽 검증에만 쓰임)
  const call = (handler: (r: NextRequest) => Promise<Response>) => {
    const fd = new FormData()
    fd.append('file', new Blob([buf], { type: file.type }), file.name || 'upload')
    const headers = new Headers(req.headers)
    headers.delete('content-type')
    headers.delete('content-length')
    return handler(new NextRequest(req.nextUrl, { method: 'POST', headers, body: fd }))
  }

  const [logRes, rosterRes] = await Promise.all([call(parseLogbook), call(parseRoster)])
  // 3.0 앱(거래 서명 헤더)은 인증 결과를 그대로 돌려준다 — 401(서명 무효)·402(구독 만료)·429(하루 한도)의
  // 문구가 그대로 앱에 보여야 한다. 두 핸들러가 같은 lib/app-auth.ts를 쓰므로 어느 쪽이든 같다.
  if (req.headers.get('x-airlog10-transaction') && [401, 402, 429].includes(logRes.status)) {
    return NextResponse.json(await logRes.json().catch(() => ({ error: 'Please sign in.' })), { status: logRes.status })
  }
  if (logRes.status === 401 && rosterRes.status === 401) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  }
  const logbook = logRes.ok ? await logRes.json() : null
  const roster = rosterRes.ok ? await rosterRes.json() : null
  if (logbook && roster) return NextResponse.json({ kind: 'both', logbook, roster })
  if (logbook) return NextResponse.json({ kind: 'logbook', logbook })
  if (roster) return NextResponse.json({ kind: 'roster', roster })

  // 둘 다 실패 — 지문이 맞았던 파서의 구체적 메시지("No flights found in this X roster",
  // "File too large" 등)가 있으면 그걸 살린다. 로스터 쪽이 더 구체적인 경우가 많아 먼저.
  // 칸 안내("…section…")와 종류 추측 문구("This doesn't look like…")는 통합 UI에 칸이 없어 거른다.
  const errOf = async (r: Response) => {
    try { return String(((await r.json()) as { error?: string }).error ?? '') } catch { return '' }
  }
  const candidates = [await errOf(rosterRes), await errOf(logRes)].filter(
    (e) => e && !e.includes('section') && !e.startsWith("This doesn't look like")
  )
  return NextResponse.json(
    { error: candidates[0] || "This file doesn't match any supported logbook or roster format." },
    { status: 422 }
  )
}
