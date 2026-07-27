// 언어(i18n) 코어 — 서버·클라이언트 공용. 훅은 여기 두지 않는다(서버에서도 import 하므로).
//
// 테마와 같은 방식: 값을 쿠키에 두고 서버가 첫 HTML을 그때 이미 올바른 언어로 그린다.
// (로컬 저장소는 읽는 데 시간이 걸려 "영어로 번쩍였다가 한국어로 바뀌는" 화면이 된다.)

export type Lang = 'en' | 'ko' | 'th'
export type LangSetting = 'auto' | Lang

export const LANG_COOKIE = 'airlog_lang'
export const LANG_SETTINGS: LangSetting[] = ['auto', 'en', 'ko', 'th']

// 각 언어는 "그 언어로" 적는다 — 영어 화면에서 'Korean'이라고 쓰면 정작 한국인이 못 찾는다
export const LANG_LABEL: Record<LangSetting, string> = {
  auto: 'Auto',
  en: 'English',
  ko: '한국어',
  th: 'ไทย',
}

// 아직 번역이 준비되지 않은 언어는 목록에서 감춘다(사전이 채워지면 여기서 푼다)
export const LANG_READY: Lang[] = ['en', 'ko']

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'ko' || v === 'th'
export const isLangSetting = (v: unknown): v is LangSetting => v === 'auto' || isLang(v)

// Accept-Language 헤더나 navigator.language에서 쓸 언어를 고른다.
// 준비된 언어가 없으면 영어 — 전 세계 파일럿이 쓰는 앱이라 영어가 기본이다.
export function langFromLocales(raw: string | null | undefined): Lang {
  if (!raw) return 'en'
  // "ko-KR,ko;q=0.9,en;q=0.8" → ['ko-kr', 'ko', 'en']
  const tags = raw
    .split(',')
    .map((part) => part.split(';')[0].trim().toLowerCase())
    .filter(Boolean)
  for (const tag of tags) {
    const base = tag.split('-')[0]
    if (isLang(base) && LANG_READY.includes(base)) return base
  }
  return 'en'
}

// 쿠키 값(설정)과 브라우저 선호를 합쳐 실제로 쓸 언어를 정한다
export function resolveLang(setting: string | null | undefined, locales: string | null | undefined): Lang {
  if (isLang(setting) && LANG_READY.includes(setting)) return setting
  return langFromLocales(locales)
}

export function readLangSetting(cookieValue: string | null | undefined): LangSetting {
  return isLangSetting(cookieValue) ? cookieValue : 'auto'
}

// ── 사전 ────────────────────────────────────────────
// en은 반드시 전부 채운다(기준). ko/th는 채운 것만 — 빠진 문장은 영어로 나온다.
// 덕분에 태국어를 100% 번역하기 전에도 켤 수 있다.
export type Dict<T extends Record<string, string>> = { en: T } & Partial<Record<Lang, Partial<T>>>

export function pick<T extends Record<string, string>>(dict: Dict<T>, lang: Lang): T {
  if (lang === 'en') return dict.en
  // Partial을 펼친 결과라 타입만으로는 T임을 못 보인다 — en이 전부 채워져 있으므로 안전
  return { ...dict.en, ...(dict[lang] ?? {}) } as T
}
