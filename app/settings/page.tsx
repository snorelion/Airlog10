'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getSetting, setSetting } from '@/lib/store'
import Nav from '@/components/Nav'

export default function SettingsPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [cap, setCap] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      // 로컬 설정 우선, 없으면 온라인 프로필에서
      let n = (await getSetting('pilotName')) ?? ''
      let c = (await getSetting('defaultCapacity')) ?? ''
      if ((!n || !c) && navigator.onLine) {
        try {
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data } = await supabase
              .from('profiles')
              .select('name, default_capacity')
              .eq('id', user.id)
              .single()
            if (!n && data?.name) n = data.name
            if (!c && data?.default_capacity) c = data.default_capacity
          }
        } catch {}
      }
      setName(n)
      setCap(c)
    })()
  }, [])

  async function save() {
    setBusy(true)
    setSaved(false)
    await setSetting('pilotName', name.trim())
    await setSetting('defaultCapacity', cap)
    // 온라인이면 프로필에도 (다른 기기에서도 쓰게)
    if (navigator.onLine) {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase
            .from('profiles')
            .update({ name: name.trim() || null, default_capacity: cap || null })
            .eq('id', user.id)
        }
      } catch {}
    }
    setBusy(false)
    setSaved(true)
  }

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const inputCls = 'mt-1 w-full rounded-xl border border-ink-line bg-white px-3 py-2.5 outline-none focus:border-air-400'

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-4 text-xl font-bold">설정</h1>

      <div className="space-y-4">
        <div className="rounded-2xl border border-ink-line bg-white p-4">
          <h2 className="font-semibold">내 정보</h2>
          <p className="mt-1 text-xs text-ink-hint">
            비행 기록할 때 역할에 맞는 칸(기장/부기장)에 이름이 자동으로 들어가요.
          </p>
          <div className="mt-3">
            <label className="text-xs font-medium text-ink-sub">이름 (로그북 표기)</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Sangin Jung" className={inputCls} />
          </div>
          <div className="mt-3">
            <label className="text-xs font-medium text-ink-sub">기본 역할</label>
            <div className="mt-1 flex gap-1">
              {['PIC', 'SIC', 'PICUS'].map((cp) => (
                <button
                  key={cp} type="button" onClick={() => setCap(cap === cp ? '' : cp)}
                  className={
                    'rounded-lg px-4 py-2 text-sm font-semibold ' +
                    (cap === cp ? 'bg-air-600 text-white' : 'bg-ink-bg text-ink-sub')
                  }
                >
                  {cp}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={save} disabled={busy}
            className="mt-4 w-full rounded-xl bg-air-600 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? '저장 중…' : '저장'}
          </button>
          {saved && <p className="mt-2 text-center text-sm text-green-600">저장했어요 ✓</p>}
        </div>

        <button
          onClick={logout}
          className="w-full rounded-xl border border-ink-line bg-white py-3 text-sm font-medium text-ink-sub"
        >
          로그아웃
        </button>
      </div>

      <Nav />
    </main>
  )
}
