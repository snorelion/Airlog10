'use client'

// 언어 훅 — 화면에서 쓰는 입구. 코어(서버 공용)는 ./core 에 있다.
//
//   const t = useT(login)     // login = 화면별 사전
//   <h1>{t.title}</h1>

import { createContext, useContext, useMemo } from 'react'
import { type Dict, type Lang, type LangSetting, LANG_COOKIE, pick, readLangSetting } from './core'

export * from './core'

// 언어가 바뀌었음을 알리는 신호 — Provider가 듣고 화면을 다시 그린다
export const LANG_EVENT = 'airlog:lang'

// 초기값 en: 서버가 Provider에 실제 언어를 내려주므로 이 값이 쓰이는 일은 없다
export const LangContext = createContext<Lang>('en')

export function useLang(): Lang {
  return useContext(LangContext)
}

export function useT<T extends Record<string, string>>(dict: Dict<T>): T {
  const lang = useLang()
  return useMemo(() => pick(dict, lang), [dict, lang])
}

export function readLangCookie(): LangSetting {
  if (typeof document === 'undefined') return 'auto'
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + LANG_COOKIE + '=([^;]*)'))
  return readLangSetting(m ? decodeURIComponent(m[1]) : null)
}

export function setLangSetting(setting: LangSetting): void {
  document.cookie = `${LANG_COOKIE}=${setting}; path=/; max-age=31536000; samesite=lax`
  window.dispatchEvent(new Event(LANG_EVENT))
}
