'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

// Supabase 영어 에러를 사람이 읽는 한국어로
function friendly(msg: string, mode: 'login' | 'signup'): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return '이메일 또는 비밀번호가 맞지 않아요.'
  if (m.includes('already registered') || m.includes('already exists') || m.includes('user already'))
    return '이미 가입된 이메일이에요. 로그인하거나 비밀번호를 재설정해 주세요.'
  if (m.includes('email not confirmed')) return '이메일 확인이 아직이에요. 메일함의 확인 링크를 눌러주세요.'
  if (m.includes('password') && m.includes('6')) return '비밀번호는 6자 이상이어야 해요.'
  if (m.includes('rate limit') || m.includes('too many')) return '잠시 후 다시 시도해 주세요. (요청이 많아요)'
  if (m.includes('invalid email') || m.includes('unable to validate email')) return '이메일 형식을 확인해 주세요.'
  return (mode === 'login' ? '로그인에 실패했어요. ' : '가입에 실패했어요. ') + msg
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    if (mode === 'signup' && !agree) {
      setError('약관과 개인정보처리방침에 동의해 주세요.')
      return
    }
    setBusy(true)
    const supabase = createClient()

    const { data, error } = await (mode === 'login'
      ? supabase.auth.signInWithPassword({ email: email.trim(), password })
      : supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        }))
    setBusy(false)
    if (error) { setError(friendly(error.message, mode)); return }
    // 가입했지만 세션이 없으면 = "이메일 확인"이 켜져 있는 상태
    if (mode === 'signup' && !data.session) {
      setNotice('가입 확인 메일을 보냈어요! 메일함(스팸함도)에서 확인 링크를 눌러 가입을 완료해 주세요.')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="text-3xl font-extrabold tracking-tight text-app-accent">
          Air<span className="text-air-400">Log</span>10
        </div>
        <p className="mt-2 text-sm text-app-sub">파일럿 로그북 — 비행 기록, 통계, 어디서나.</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-app-line bg-app-surface px-4 py-3 text-base outline-none focus:border-air-400"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-app-line bg-app-surface px-4 py-3 text-base outline-none focus:border-air-400"
        />
        {mode === 'signup' && (
          <label className="flex items-start gap-2 text-xs text-app-sub">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-air-600" style={{ appearance: 'auto' }} />
            <span>
              <Link href="/terms" className="text-app-accent underline">이용약관</Link> 및{' '}
              <Link href="/privacy" className="text-app-accent underline">개인정보처리방침</Link>에 동의합니다.
            </span>
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="rounded-xl bg-app-accent-soft p-3 text-sm text-app-accent">{notice}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-app-btn py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? '잠시만요…' : mode === 'login' ? '로그인' : '가입하기'}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setNotice('') }}
          className="text-app-accent"
        >
          {mode === 'login' ? '처음이신가요? 가입하기' : '이미 계정이 있어요 → 로그인'}
        </button>
        {mode === 'login' && (
          <Link href="/forgot-password" className="text-app-hint">비밀번호 찾기</Link>
        )}
      </div>
    </main>
  )
}
