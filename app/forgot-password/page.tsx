'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (error) { setError('메일을 보내지 못했어요: ' + error.message); return }
    setSent(true)
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="text-3xl font-extrabold tracking-tight text-app-accent">
          Air<span className="text-air-400">Log</span>10
        </div>
        <p className="mt-2 text-sm text-app-sub">비밀번호 재설정</p>
      </div>

      {sent ? (
        <div className="rounded-2xl border border-app-line bg-app-surface p-5 text-center">
          <p className="text-3xl">📧</p>
          <p className="mt-2 font-semibold">메일을 보냈어요</p>
          <p className="mt-1 text-sm text-app-sub">
            {email} 로 재설정 링크를 보냈어요. 메일함(스팸함도)에서 링크를 눌러주세요.
          </p>
          <Link href="/login" className="mt-4 inline-block text-sm text-app-accent">로그인으로</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-app-sub">가입한 이메일을 넣으면 재설정 링크를 보내드려요.</p>
          <input
            type="email" required placeholder="이메일"
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-app-line bg-app-surface px-4 py-3 text-base outline-none focus:border-air-400"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full rounded-xl bg-app-btn py-3 font-semibold text-white disabled:opacity-50">
            {busy ? '보내는 중…' : '재설정 링크 받기'}
          </button>
          <Link href="/login" className="block text-center text-sm text-app-accent">로그인으로 돌아가기</Link>
        </form>
      )}
    </main>
  )
}
