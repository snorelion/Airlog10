import type { Dict } from './core'

// 하단 탭 — 다섯 칸에 나눠 들어가므로 한 단어로 짧게 유지한다.
// 영어가 길어지면 좁은 폰에서 줄바꿈되거나 잘린다.
export const nav = {
  en: {
    home: 'Home',
    logbook: 'Logbook',
    log: 'Log',
    stats: 'Stats',
    map: 'Map',
  },
  ko: {
    home: '홈',
    logbook: '로그북',
    log: '기록',
    stats: '통계',
    map: '지도',
  },
} satisfies Dict<{
  home: string
  logbook: string
  log: string
  stats: string
  map: string
}>
