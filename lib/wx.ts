// METAR/TAF — 온라인이면 새로 받고, 받은 것은 공항별로 영구 보관.
// 오프라인·다음 날에도 "마지막 관측"을 계속 볼 수 있다 (몇 시간 전 것인지 표시).

import { idbGet, idbPut } from './idb'

export type WxRow = {
  ident: string
  metar: string | null
  taf: string | null
  fetched_at: string // ISO
}

export async function getCachedWx(ident: string): Promise<WxRow | undefined> {
  return idbGet<WxRow>('wx', ident.toUpperCase())
}

// 온라인이면 서버에서 새로 받아 저장, 실패하면 저장본 반환
export async function fetchWx(ident: string): Promise<WxRow | undefined> {
  const id = ident.toUpperCase()
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return getCachedWx(id)
  }
  try {
    const res = await fetch(`/api/wx?id=${encodeURIComponent(id)}`)
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as { metar: string | null; taf: string | null }
    // 응답이 완전히 비면(둘 다 없음) 기존 저장본을 지우지 않는다
    const cached = await getCachedWx(id)
    if (!data.metar && !data.taf && cached) return cached
    const row: WxRow = {
      ident: id,
      metar: data.metar ?? cached?.metar ?? null,
      taf: data.taf ?? cached?.taf ?? null,
      fetched_at: new Date().toISOString(),
    }
    await idbPut('wx', row)
    return row
  } catch {
    return getCachedWx(id)
  }
}

// "12분 전" / "3시간 전" / "2일 전"
export function wxAge(iso: string): { text: string; stale: boolean } {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  let text: string
  if (min < 1) text = '방금'
  else if (min < 60) text = `${min}분 전`
  else if (min < 60 * 24) text = `${Math.floor(min / 60)}시간 전`
  else text = `${Math.floor(min / 1440)}일 전`
  return { text, stale: min >= 60 * 6 }
}
