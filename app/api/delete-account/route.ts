import { NextResponse } from 'next/server'
import { createApiSupabase } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// 계정+모든 데이터 영구 삭제 (되돌릴 수 없음)
// flights/aircraft/people/... 은 on delete cascade로 auth.users 삭제 시 함께 지워짐
// 웹(쿠키)과 네이티브 앱(Bearer) 둘 다 지원 — 앱스토어 심사 필수 요건(계정 삭제)
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { getUser } = createApiSupabase(req)
  const user = await getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
