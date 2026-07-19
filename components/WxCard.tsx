'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { getCachedWx, fetchWx, wxAge, type WxRow } from '@/lib/wx'

// METAR/TAF 카드 — 저장본 먼저 보여주고, 온라인이면 새로 받아 갱신.
// 받은 것은 영구 보관되어 오프라인·다음 날에도 계속 보인다.
export default function WxCard({ ident }: { ident: string }) {
  const [row, setRow] = useState<WxRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)

  async function refresh() {
    setBusy(true)
    const fresh = await fetchWx(ident)
    if (fresh) setRow(fresh)
    setBusy(false)
    setTried(true)
  }

  useEffect(() => {
    let alive = true
    void (async () => {
      const cached = await getCachedWx(ident)
      if (alive && cached) setRow(cached)
      const fresh = await fetchWx(ident)
      if (alive) {
        if (fresh) setRow(fresh)
        setBusy(false)
        setTried(true)
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ident])

  const age = row ? wxAge(row.fetched_at) : null

  return (
    <div className="rounded-2xl border border-ink-line bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">
          {ident.toUpperCase()} 날씨 <span className="text-xs font-normal text-ink-hint">METAR / TAF</span>
        </h2>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          aria-label="새로고침"
          className="p-1 text-ink-hint disabled:opacity-40"
        >
          <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
        </button>
      </div>

      {!row ? (
        <p className="mt-3 text-sm text-ink-hint">
          {!tried || busy ? '관측 정보를 받아오는 중…' : '아직 받은 관측이 없어요. 온라인에서 한 번 열면 저장돼요.'}
        </p>
      ) : (
        <>
          {row.metar && (
            <p className="mt-3 whitespace-pre-wrap break-all rounded-xl bg-ink-bg p-3 font-mono text-[13px] leading-relaxed">
              {row.metar}
            </p>
          )}
          {row.taf && (
            <p className="mt-2 whitespace-pre-wrap break-all rounded-xl bg-ink-bg p-3 font-mono text-[12px] leading-relaxed text-ink-sub">
              {row.taf}
            </p>
          )}
          {age && (
            <p className="mt-2 flex items-center gap-2 text-xs text-ink-hint">
              <span className={age.stale ? 'rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-600' : ''}>
                {age.text} 수신
              </span>
              <span>· 저장됨 — 오프라인에서도 계속 보여요</span>
            </p>
          )}
        </>
      )}
    </div>
  )
}
