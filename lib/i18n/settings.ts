import type { Dict } from './core'

// 설정 화면 — 지금은 언어 카드만. 나머지 문구는 이후 단계에서 이 파일에 채운다.
export const settings = {
  en: {
    language: 'Language',
    languageHint: 'Auto follows your phone’s language.',
  },
  ko: {
    language: '언어',
    languageHint: '자동은 폰 언어를 따라가요.',
  },
} satisfies Dict<{
  language: string
  languageHint: string
}>
