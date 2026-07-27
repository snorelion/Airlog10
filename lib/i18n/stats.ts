import type { Dict } from './core'

type StatsStrings = {
  title: string
  shareCard: string
  loading: string
  empty: string
  recap: string
  last4w: string
  lastMonth: string
  noFlightsIn: string
  night: string
  day: string
  landings: string
  domestic: string
  intl: string
  topAirports: string
  flightsN: string
  landingsN: string
  viewInLogbook: string
  makeRecapCard: string
  byYear: string
  byType: string
  topAirportsTitle: string
  listBtn: string
  airportHint: string
  yearLabel: string
  viewLogbookAria: string
  otherTypeFallback: string
}

export const stats = {
  en: {
    title: 'Statistics',
    shareCard: 'Share card',
    loading: 'Loading…',
    empty: 'Statistics will appear here as you log flights.',
    recap: 'Recap',
    last4w: 'Last 4 weeks',
    lastMonth: 'Last month',
    noFlightsIn: 'No flights in {label}.',
    night: 'Night',
    day: 'Day',
    landings: 'Landings',
    domestic: 'Domestic',
    intl: 'Intl',
    topAirports: 'Most visited',
    flightsN: '{n} flights',
    landingsN: '{n}',
    viewInLogbook: 'View {label} in the logbook →',
    makeRecapCard: '📤 Create a recap card',
    byYear: 'Flight time by year',
    byType: 'By aircraft type',
    topAirportsTitle: 'Most visited airports',
    listBtn: 'List',
    airportHint: 'Tap an airport for details and runways · [List] shows your flights there',
    yearLabel: '{year}',
    viewLogbookAria: 'View {ident} in the logbook',
    // 기종이 비어 있는 묶음의 표시 이름 (저장값은 OTHER_TYPE 그대로)
    otherTypeFallback: 'Other',
  },
  ko: {
    title: '통계',
    shareCard: '공유 카드',
    loading: '불러오는 중…',
    empty: '기록이 쌓이면 통계가 여기 나타나요.',
    recap: '돌아보기',
    last4w: '최근 4주',
    lastMonth: '지난 달',
    noFlightsIn: '{label}엔 비행 기록이 없어요.',
    night: '야간',
    day: '주간',
    landings: '착륙',
    domestic: '국내',
    intl: '국제',
    topAirports: '많이 드나든 공항',
    flightsN: '{n}편',
    landingsN: '{n}회',
    viewInLogbook: '로그북에서 {label} 보기 →',
    makeRecapCard: '📤 결산 카드 만들기',
    byYear: '연도별 비행시간',
    byType: '기종별',
    topAirportsTitle: '많이 간 공항',
    listBtn: '목록',
    airportHint: '공항을 누르면 상세 정보·활주로, [목록]은 그 공항 비행 기록',
    yearLabel: '{year}년',
    viewLogbookAria: '{ident} 로그북 보기',
    otherTypeFallback: '기타',
  },
} satisfies Dict<StatsStrings>
