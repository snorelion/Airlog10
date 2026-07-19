import { createClient } from '@supabase/supabase-js'

// 서버 전용 — RLS를 우회하는 service role 클라이언트 (공항 시딩 등 관리 작업에만 사용)
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
