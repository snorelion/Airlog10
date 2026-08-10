import { NextResponse } from 'next/server'
import { AIRLINES } from '@/lib/import-formats'

// 지원 항공사 명단 — iOS 앱의 "Supported airlines" 화면이 읽는다.
// 파서를 추가하면 lib/import-formats.ts 한 곳만 고치면 되고,
// 서버 배포만으로 (앱 업데이트 없이) 모든 사용자의 앱 명단이 늘어난다.
// 공개 정보라 인증 없음. 빌드 시 고정(force-static) — 배포마다 갱신된다.
export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json({
    ok: true,
    airlines: AIRLINES.map((a) => ({
      name: a.name,
      logbook: !!a.logbook,
      roster: !!a.roster,
      photo: !!a.photo,
    })),
  })
}
