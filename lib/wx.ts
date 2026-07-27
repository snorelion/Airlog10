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
// 분 단위만 돌려준다 — "5분 전"·"5 minutes ago" 같은 표현은 언어마다 달라서
// 화면에서 Intl.RelativeTimeFormat으로 만든다(태국어도 자동으로 따라온다).
// 6시간이 넘으면 stale — 관측이 오래됐다고 눈에 띄게 표시하기 위한 기준.
export function wxAge(iso: string): { minutes: number; stale: boolean } {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return { minutes, stale: minutes >= 60 * 6 }
}
