import type { Dict } from './core'

type LogbookStrings = {
  title: string
  flightCount: string
  list: string
  ledger: string
  searchPlaceholder: string
  all: string
  yearChip: string
  clearFilter: string
  filteredCount: string
  zeroTime: string
  loading: string
  emptyPrefix: string
  importLink: string
  emptySuffix: string
  dayHeader: string
  swipeHint: string
  newer: string
  older: string
  otherType: string
}

export const logbook = {
  en: {
    title: 'Logbook',
    flightCount: '{n} flights',
    list: 'List',
    ledger: 'Ledger',
    searchPlaceholder: 'Search: airport, flight no., aircraft, crew, remarks',
    all: 'All',
    yearChip: '{year}',
    clearFilter: 'Clear filter',
    filteredCount: 'Showing {n}',
    zeroTime: '⏱️ {n} entries have no time — tidy them up →',
    loading: 'Loading…',
    emptyPrefix: 'No entries yet.',
    importLink: 'Import',
    emptySuffix: ' to get started.',
    dayHeader: '{date} · {n} flights · {time}',
    swipeHint: 'Swipe sideways for crew & remarks · Tap a row to edit · [Ledger] for the full sheet',
    newer: '← Newer',
    older: 'Older →',
    // 기종이 비어 있는 기록의 묶음 이름. 화면 표시용이며 저장값은 아니다
    otherType: 'Other',
  },
  ko: {
    title: '로그북',
    flightCount: '{n}편',
    list: '목록',
    ledger: '장부',
    searchPlaceholder: '검색: 공항·편명·기체·크루·메모',
    all: '전체',
    yearChip: '{year}년',
    clearFilter: '필터 지우기',
    filteredCount: '{n}편만 보는 중',
    zeroTime: '⏱️ 시간이 비어 있는 기록 {n}건 — 정리하러 가기 →',
    loading: '불러오는 중…',
    emptyPrefix: '아직 기록이 없어요.',
    importLink: '가져오기',
    emptySuffix: '부터 시작해 보세요.',
    dayHeader: '{date} · {n}편 · {time}',
    swipeHint: '옆으로 당기면 크루·메모가 보여요 · 줄을 누르면 수정 · 자세히 보려면 [장부]',
    newer: '← 최근',
    older: '과거 →',
    otherType: '기타',
  },
} satisfies Dict<LogbookStrings>
