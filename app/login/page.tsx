'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const supabase = createClient()
    const fn =
      mode === 'login'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password })
    const { error } = await fn
    setBusy(false)
    if (error) {
      setError(
        mode === 'login'
          ? '로그인에 실패했어요. 이메일/비밀번호를 확인해 주세요.'
          : '가입에 실패했어요: ' + error.message
      )
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="text-3xl font-extrabold tracking-tight text-air-800">
          Air<span className="text-air-400">Log</span>10
        </div>
        <p className="mt-2 text-sm text-ink-sub">파일럿 로그북 — 비행 기록, 통계, 어디서나.</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-ink-line bg-white px-4 py-3 text-base outline-none focus:border-air-400"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-ink-line bg-white px-4 py-3 text-base outline-none focus:border-air-400"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-air-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? '잠시만요…' : mode === 'login' ? '로그인' : '가입하기'}
        </button>
      </form>

      <button
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        className="mt-4 text-sm text-air-600"
      >
        {mode === 'login' ? '처음이신가요? 가입하기' : '이미 계정이 있어요 → 로그인'}
      </button>
    </main>
  )
}
