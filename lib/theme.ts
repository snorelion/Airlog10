// 화면 테마(시스템/밝게/어둡게) — BJJ-log 검증 패턴 이식.
// 쿠키에 저장하고, 첫 페인트 전 인라인 스크립트가 <html>에 .dark를 붙인다(흰 화면 번쩍임 방지).

export type Theme = 'system' | 'light' | 'dark'

export const THEME_COOKIE = 'airlog_theme'
export const THEMES: Theme[] = ['system', 'light', 'dark']

export const isTheme = (v: unknown): v is Theme =>
  v === 'system' || v === 'light' || v === 'dark'

// 상단 상태바 색 — 나이트에선 화면 배경(--app-bg)과 같아야 이음새가 없다
export const THEME_COLOR = { light: '#0D3D6E', dark: '#0B1220' } as const

export const THEME_INIT_SCRIPT = `
(function(){try{
  var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]*)/);
  var t=m?decodeURIComponent(m[1]):'system';
  if(t!=='light'&&t!=='dark')t='system';
  var dark=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark',dark);
  document.documentElement.dataset.theme=t;
}catch(e){}})()
`.trim()

let originalThemeColor: string | null = null

export function applyTheme(t: Theme) {
  const dark = t === 'dark'
    || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.dataset.theme = t
  const meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) return
  if (originalThemeColor === null) originalThemeColor = meta.getAttribute('content')
  meta.setAttribute('content', dark ? THEME_COLOR.dark : (originalThemeColor ?? THEME_COLOR.light))
}

export function setThemeCookie(t: Theme) {
  document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=31536000; samesite=lax`
}

export function readTheme(): Theme {
  const t = document.documentElement.dataset.theme
  return isTheme(t) ? t : 'system'
}
