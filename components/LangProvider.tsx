'use client'

import { useEffect, useState } from 'react'
import { LangContext, LANG_EVENT, readLangCookie, resolveLang, type Lang } from '@/lib/i18n'

// 서버가 정한 언어로 시작해서(첫 화면이 올바른 언어로 그려진다),
// 마운트 뒤 쿠키·브라우저 설정으로 한 번 더 맞춘다.
// 두 번째 확인이 필요한 이유: 서비스워커가 캐시해 둔 HTML로 들어오면
// 서버가 준 값이 언어를 바꾸기 전의 것일 수 있다.
export default function LangProvider({
  initial,
  children,
}: {
  initial: Lang
  children: React.ReactNode
}) {
  const [lang, setLang] = useState<Lang>(initial)

  useEffect(() => {
    const sync = () => {
      const locales = navigator.languages?.join(',') || navigator.language || null
      setLang(resolveLang(readLangCookie(), locales))
    }
    sync()
    window.addEventListener(LANG_EVENT, sync)
    return () => window.removeEventListener(LANG_EVENT, sync)
  }, [])

  // 스크린리더·브라우저 번역 제안이 이 값을 본다
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}
