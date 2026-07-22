'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type Invite = {
  code: string
  note: string | null
  max_uses: number
  used_count: number
  disabled: boolean
  created_at: string
}

// 코드 생성 — 헷갈리는 글자(0/O, 1/I) 제외
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randomCode(): string {
  let s = ''
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return 'AIRLOG-' + s
}

export default function AdminInvitePage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [note, setNote] = useState('')
  const [uses, setUses] = useState('1')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')

  async function load() {
    const supabase = createClient()
    const { data: adminOk } = await supabase.rpc('is_admin')
    setIsAdmin(!!adminOk)
    if (adminOk) {
      const { data } = await supabase.from('invites').select('*').order('created_at', { ascending: false })
      setInvites((data ?? []) as Invite[])
    }
  }

  useEffect(() => { void load() }, [])

  async function create() {
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const code = randomCode()
    const { error } = await supabase.from('invites').insert({
      code,
      note: note.trim() || null,
      max_uses: Math.max(1, parseInt(uses, 10) || 1),
      created_by: user?.id ?? null,
    })
    setBusy(false)
    if (error) { alert('생성 실패: ' + error.message); return }
    setNote('')
    void load()
  }

  async function toggle(code: string, disabled: boolean) {
    const supabase = createClient()
    await supabase.from('invites').update({ disabled: !disabled }).eq('code', code)
    void load()
  }

  function copy(code: string) {
    void navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(''), 1500)
  }

  if (isAdmin === null) {
    return <main className="p-8 text-center text-app-hint">확인 중…</main>
  }
  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-sm px-6 py-20 text-center">
        <p className="text-app-sub">운영자만 접근할 수 있어요.</p>
        <Link href="/" className="mt-4 inline-block text-app-accent">홈으로</Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">초대 코드 관리</h1>
        <Link href="/" className="text-sm text-app-accent">홈으로</Link>
      </div>

      <div className="rounded-2xl border border-app-line bg-app-surface p-4">
        <h2 className="font-semibold">새 초대 코드</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="메모 (예: 김기장님)"
            className="flex-1 rounded-xl border border-app-line bg-app-surface px-3 py-2.5 text-sm outline-none focus:border-air-400"
          />
          <select value={uses} onChange={(e) => setUses(e.target.value)}
            className="rounded-xl border border-app-line bg-app-surface px-3 py-2.5 text-sm">
            {['1', '3', '5', '10', '50'].map((n) => <option key={n} value={n}>{n}명</option>)}
          </select>
          <button onClick={create} disabled={busy}
            className="rounded-xl bg-app-btn px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            만들기
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {invites.length === 0 ? (
          <p className="rounded-2xl border border-app-line bg-app-surface p-6 text-center text-sm text-app-sub">
            아직 만든 코드가 없어요. 위에서 하나 만들어 지인에게 전달하세요.
          </p>
        ) : invites.map((iv) => {
          const full = iv.used_count >= iv.max_uses
          return (
            <div key={iv.code} className={'rounded-xl border border-app-line bg-app-surface p-3 ' + (iv.disabled || full ? 'opacity-50' : '')}>
              <div className="flex items-center justify-between">
                <button onClick={() => copy(iv.code)} className="font-mono text-lg font-bold text-app-accent">
                  {iv.code} {copied === iv.code ? '✓ 복사됨' : '📋'}
                </button>
                <button onClick={() => toggle(iv.code, iv.disabled)} className="text-xs text-app-hint underline">
                  {iv.disabled ? '다시 켜기' : '끄기'}
                </button>
              </div>
              <p className="mt-0.5 text-xs text-app-hint">
                {iv.note ? iv.note + ' · ' : ''}{iv.used_count}/{iv.max_uses}명 사용{full ? ' (소진)' : ''}
              </p>
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-center text-xs text-app-hint">
        코드를 눌러 복사한 뒤 카톡·문자로 전달하세요. 받은 사람은 가입 화면에 코드를 넣어야 가입돼요.
      </p>
    </main>
  )
}
