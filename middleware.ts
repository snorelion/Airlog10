import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// 로그인 없이 접근 가능한 경로
// /api/roster/parse·/api/company-log/parse는 라우트 안에서
// 세션(쿠키 또는 Bearer 토큰) 또는 시크릿으로 자체 인증
const PUBLIC_PATHS = [
  '/login', '/privacy', '/terms', '/welcome',
  '/api/auth/callback', '/api/airports/seed', '/api/roster/parse',
  '/api/company-log/parse',
]

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 세션 갱신 (만료 토큰 자동 리프레시)
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    // 주소만 치고 처음 들어온 사람에게 로그인 폼부터 들이밀지 않는다.
    // 앱스토어의 지원·마케팅 URL이 이 사이트라 여기가 첫인상이 된다.
    url.pathname = path === '/' ? '/welcome' : '/login'
    return NextResponse.redirect(url)
  }
  return response
}

export const config = {
  // 정적 파일·이미지 제외한 모든 경로
  //
  // ⚠️ public/ 아래 폴더를 새로 만들면 여기에도 넣어야 한다. 안 그러면 미들웨어가
  //    로그인 검사를 하고, 비로그인 방문자에겐 이미지 대신 로그인 페이지 HTML이 간다
  //    (2026-08-03: /shots를 빠뜨려 /welcome의 스크린샷이 전부 안 보였다).
  //    next/image도 원본을 같은 주소로 가져오므로 함께 깨진다.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|shots|manifest.json|sw.js).*)'],
}
