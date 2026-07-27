import type { Dict } from './core'

type LedgerStrings = {
  title: string
  printPdf: string
  list: string
  ledger: string
  loading: string
  empty: string
  // 합계 줄의 뜻풀이. 라벨(TOTAL THIS PAGE…)은 종이 로그북 관례라 어느 언어에서든
  // 영문 그대로 두고, 뜻이 필요한 언어에만 작게 덧붙인다 — 영어는 빈 문자열.
  subThisPage: string
  subForwarded: string
  subToDate: string
  hint: string
  prevPage: string
  nextPage: string
  first: string
  last: string
}

export const ledger = {
  en: {
    title: 'Logbook · Ledger',
    printPdf: 'Print / PDF',
    list: 'List',
    ledger: 'Ledger',
    loading: 'Loading…',
    empty: 'No entries yet.',
    subThisPage: '',
    subForwarded: '',
    subToDate: '',
    hint: 'Swipe the table sideways · The last three rows are totals · Tap a row to edit',
    prevPage: '← Previous',
    nextPage: 'Next →',
    first: 'First',
    last: 'Last',
  },
  ko: {
    title: '로그북 · 장부',
    printPdf: '인쇄/PDF',
    list: '목록',
    ledger: '장부',
    loading: '불러오는 중…',
    empty: '아직 기록이 없어요.',
    subThisPage: '이 장',
    subForwarded: '이전까지 누적',
    subToDate: '전체 누적',
    hint: '표를 옆으로 당겨서 보세요 · 맨 아래 세 줄이 합계 · 줄을 누르면 수정',
    prevPage: '← 이전 장',
    nextPage: '다음 장 →',
    first: '처음',
    last: '마지막',
  },
} satisfies Dict<LedgerStrings>
