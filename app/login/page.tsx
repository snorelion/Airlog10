'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

// 인증 계열 에러(사용자가 어쩔 수 없는 것)는 초록 안내, 진짜 에러만 빨강 — 문서 4번 규칙
const SOFT = /otp.?expired|token has expired|invalid.*(code|token)|email link|pkce|verifier/i

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [soft, setSoft] = useState('')

  // OAuth 콜백이 에러로 되돌려보낸 경우 표시 (window로 읽어 Suspense 경계 불필요)
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('error')
    if (e) setError(decodeURIComponent(e))
  }, [])

  function show(msg: string) {
    if (SOFT.test(msg)) setSoft('코드가 만료됐거나 맞지 않아요. 새 코드를 받아 다시 입력해 주세요.')
    else setError(msg)
  }

  // 1) 이메일 → 6자리 코드 발송 (신규면 자동 가입)
  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSoft('')
    if (!agree) { setError('약관과 개인정보처리방침에 동의해 주세요.'); return }
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    if (error) { show(error.message); return }
    setStep('code')
  }

  // 2) 코드 확인 → 로그인
  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSoft('')
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    if (error) { show(error.message); return }
    router.push('/')
    router.refresh()
  }

  async function oauth(provider: 'google' | 'apple') {
    setError(''); setSoft('')
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    })
  }

  const inputCls = 'w-full rounded-xl border border-app-line bg-app-surface px-4 py-3 text-base outline-none focus:border-air-400'

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="text-3xl font-extrabold tracking-tight text-app-accent">
          Air<span className="text-air-400">Log</span>10
        </div>
        <p className="mt-2 text-sm text-app-sub">파일럿 로그북 — 비행 기록, 통계, 어디서나.</p>
      </div>

      {step === 'email' ? (
        <>
          <form onSubmit={sendCode} className="space-y-3">
            <input
              type="email" required placeholder="이메일"
              value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls}
            />
            <label className="flex items-start gap-2 text-xs text-app-sub">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-air-600" style={{ appearance: 'auto' }} />
              <span>
                <Link href="/terms" className="text-app-accent underline">이용약관</Link> 및{' '}
                <Link href="/privacy" className="text-app-accent underline">개인정보처리방침</Link>에 동의합니다.
              </span>
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {soft && <p className="rounded-xl bg-app-accent-soft p-3 text-sm text-app-accent">{soft}</p>}
            <button type="submit" disabled={busy}
              className="w-full rounded-xl bg-app-btn py-3 font-semibold text-white disabled:opacity-50">
              {busy ? '보내는 중…' : '이메일로 로그인 코드 받기'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-app-hint">
            <div className="h-px flex-1 bg-app-line" /> 또는 <div className="h-px flex-1 bg-app-line" />
          </div>

          <div className="space-y-2">
            <button onClick={() => oauth('google')}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-app-line bg-app-surface py-3 font-semibold">
              <span>🇬</span> 구글로 계속하기
            </button>
            <button onClick={() => oauth('apple')}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-app-line bg-app-surface py-3 font-semibold">
              <span></span> Apple로 계속하기
            </button>
          </div>
          <p className="mt-4 text-center text-xs text-app-hint">
            비밀번호가 없어요. 이메일로 오는 6자리 코드로 로그인해요.
          </p>
        </>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm text-app-sub">
            <b>{email}</b> 으로 6자리 코드를 보냈어요. 메일함(스팸함도)에서 확인해 입력해 주세요.
          </p>
          <input
            type="text" inputMode="numeric" required placeholder="6자리 코드"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className={inputCls + ' text-center font-mono text-2xl tracking-[0.4em]'}
            autoFocus
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {soft && <p className="rounded-xl bg-app-accent-soft p-3 text-sm text-app-accent">{soft}</p>}
          <button type="submit" disabled={busy || code.length < 6}
            className="w-full rounded-xl bg-app-btn py-3 font-semibold text-white disabled:opacity-50">
            {busy ? '확인 중…' : '로그인'}
          </button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); setSoft('') }}
              className="text-app-hint">← 이메일 다시 입력</button>
            <button type="button" onClick={(e) => sendCode(e as unknown as React.FormEvent)}
              className="text-app-accent">코드 다시 받기</button>
          </div>
        </form>
      )}
    </main>
  )
}
