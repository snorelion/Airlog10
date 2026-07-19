// 비행시간은 DB에 '분(정수)'으로 저장하고, 화면에는 "H:MM"으로 표시한다.

// "1:15" | "12:03" → 75 | 723. 빈값/이상값은 0.
export function hmToMin(s: string | null | undefined): number {
  if (!s) return 0
  const t = s.trim()
  if (!t || t === '0') return 0
  if (t.includes(':')) {
    const [h, m] = t.split(':')
    const hh = parseInt(h, 10)
    const mm = parseInt(m, 10)
    if (isNaN(hh) || isNaN(mm)) return 0
    return hh * 60 + mm
  }
  // "1.5" 같은 십진 시간도 허용
  const f = parseFloat(t)
  return isNaN(f) ? 0 : Math.round(f * 60)
}

// 75 → "1:15", 0 → "0:00"
export function minToHM(min: number | null | undefined): string {
  const m = min ?? 0
  const sign = m < 0 ? '-' : ''
  const abs = Math.abs(m)
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
}

// 총계 표시용: 1772시간 8분 → "1,772:08"
export function minToHMGrouped(min: number | null | undefined): string {
  const m = min ?? 0
  const h = Math.floor(m / 60)
  return `${h.toLocaleString('en-US')}:${String(m % 60).padStart(2, '0')}`
}
