import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

// 쿠키가 없는 클라이언트(네이티브 iOS 앱)용 —
// Authorization: Bearer <Supabase 액세스 토큰> 헤더가 있으면 그걸로 인증하고,
// 없으면 기존 쿠키 세션 방식 그대로 동작한다 (웹 동작 불변).
// Bearer 쪽 클라이언트는 DB 요청에도 같은 토큰이 실려 RLS가 본인 기준으로 돈다.
export function createApiSupabase(req: { headers: { get(name: string): string | null } }) {
  const header = req.headers.get('authorization') ?? ''
  const token = /^bearer /i.test(header) ? header.slice(7).trim() : null
  if (!token) {
    const supabase = createServerSupabase()
    return {
      supabase,
      getUser: async () => (await supabase.auth.getUser()).data.user,
    }
  }
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  )
  return {
    supabase,
    getUser: async () => (await supabase.auth.getUser(token)).data.user,
  }
}

export function createServerSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
