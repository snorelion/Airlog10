'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // 메일 링크로 도착하면 URL의 code를 세션으로 교환 (PKCE)
  useEffect(() => {
    const supabase = createClient()
    const code = new URLSearchParams(window.location.search).get('code')
    void (async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) { setError('링크가 만료됐어요. 다시 요청해 주세요.'); return }
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (session) setReady(true)
      else setError('유효한 재설정 링크로 접속해 주세요.')
    })()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) { setError('변경 실패: ' + error.message); return }
    setDone(true)
    setTimeout(() => { router.push('/'); router.refresh() }, 1500)
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="text-3xl font-extrabold tracking-tight text-app-accent">
          Air<span className="text-air-400">Log</span>10
        </div>
        <p className="mt-2 text-sm text-app-sub">새 비밀번호 설정</p>
      </div>

      {done ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-6 text-center">
          <p className="text-3xl">✅</p>
          <p className="mt-2 font-semibold">비밀번호를 바꿨어요</p>
        </div>
      ) : ready ? (
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password" required minLength={6} placeholder="새 비밀번호 (6자 이상)"
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-app-line bg-app-surface px-4 py-3 text-base outline-none focus:border-air-400"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full rounded-xl bg-app-btn py-3 font-semibold text-white disabled:opacity-50">
            {busy ? '변경 중…' : '비밀번호 변경'}
          </button>
        </form>
      ) : (
        <div className="text-center">
          {error ? (
            <>
              <p className="text-sm text-red-600">{error}</p>
              <Link href="/forgot-password" className="mt-3 inline-block text-sm text-app-accent">재설정 다시 요청</Link>
            </>
          ) : (
            <p className="text-sm text-app-hint">확인 중…</p>
          )}
        </div>
      )}
    </main>
  )
}
