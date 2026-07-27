import type { Dict } from './core'

type HomeStrings = {
  pendingUpload: string
  aircraft: string
  crew: string
  settings: string
  loading: string
  welcomeTitle: string
  welcomeBody1: string
  welcomeBody2: string
  setupFirst: string
  importLogbook: string
  logManually: string
  totalTime: string
  flightsLandings: string
  thisMonth: string
  monthFlights: string
  recap: string
  todayFlights: string
  nextFlight: string
  logged: string
  logIt: string
  expiriesTitle: string
  overdue: string
  medical: string
  englishProf: string
  recurrent: string
  limitsTitle: string
  currencyCheck: string
  d28: string
  d90: string
  m12: string
  dutyThisMonth: string
  last90: string
  currencyOk: string
  currencyShort: string
  weather: string
  lookup: string
  wxEmpty: string
  lastSync: string
}

export const home = {
  en: {
    pendingUpload: 'Pending {n}',
    aircraft: 'Aircraft',
    crew: 'Crew',
    settings: 'Settings',
    loading: 'Loading…',
    welcomeTitle: 'Welcome — let’s start your logbook',
    welcomeBody1: 'Set your name, airline and home base in ⚙️ Settings first — it makes logging much quicker.',
    welcomeBody2: 'Then import your existing logbook, or log your first flight.',
    setupFirst: '⚙️ Set up my details',
    importLogbook: 'Import an existing logbook',
    logManually: 'Log a flight myself',
    totalTime: 'Total flight time',
    flightsLandings: '{f} flights · {l} landings',
    thisMonth: 'This month',
    monthFlights: '{n} flights',
    recap: 'Recap ›',
    todayFlights: 'Today’s flights',
    nextFlight: 'Next flight · {date}',
    logged: '✓ Logged',
    logIt: 'Log',
    expiriesTitle: 'Expiries',
    overdue: '{n} days overdue',
    medical: 'Medical',
    englishProf: 'English',
    recurrent: 'Recurrent',
    limitsTitle: 'Flight time limits · Currency',
    currencyCheck: '⚠️ Check currency',
    d28: '28 days',
    d90: '90 days',
    m12: '12 months',
    dutyThisMonth: 'Duty this month',
    last90: 'Last 90 days — takeoffs {t} · landings {l}',
    currencyOk: '✓ Current (3 or more)',
    currencyShort: '⚠️ Fewer than 3 in 90 days — please check',
    weather: 'Weather (METAR / TAF)',
    lookup: 'Get',
    wxEmpty: 'Enter an ICAO code above to add a weather card. (As many airports as you like — ✕ to close.)',
    lastSync: 'Last synced {when} · Everything stays readable offline',
  },
  ko: {
    pendingUpload: '업로드 대기 {n}',
    aircraft: '기체',
    crew: '크루',
    settings: '설정',
    loading: '불러오는 중…',
    welcomeTitle: '환영해요! 로그북을 시작해 볼까요?',
    welcomeBody1: '먼저 ⚙️ 설정에서 이름·소속·홈베이스를 넣으면 기록이 훨씬 편해져요.',
    welcomeBody2: '그다음 기존 로그북을 가져오거나 첫 비행을 기록하세요.',
    setupFirst: '⚙️ 내 정보 먼저 설정하기',
    importLogbook: '기존 로그북 가져오기',
    logManually: '비행 직접 기록하기',
    totalTime: '총 비행시간',
    flightsLandings: '{f}편 · 착륙 {l}회',
    thisMonth: '이번 달',
    monthFlights: '{n}편',
    recap: '돌아보기 ›',
    todayFlights: '오늘의 비행',
    nextFlight: '다음 비행 · {date}',
    logged: '✓ 기록됨',
    logIt: '기록',
    expiriesTitle: '자격 만료',
    overdue: '만료 {n}일 지남',
    medical: '메디컬',
    englishProf: '영어 자격',
    recurrent: '리커런트',
    limitsTitle: '비행시간 리밋 · 기량유지',
    currencyCheck: '⚠️ 기량유지 확인',
    d28: '28일',
    d90: '90일',
    m12: '12개월',
    dutyThisMonth: '이번 달 듀티',
    last90: '최근 90일 이륙 {t} · 착륙 {l}',
    currencyOk: '✓ 기량유지 충족 (3회 이상)',
    currencyShort: '⚠️ 90일 3회 미달 — 확인 필요',
    weather: '날씨 (METAR / TAF)',
    lookup: '조회',
    wxEmpty: '위 ICAO 칸에 공항 코드를 넣고 조회하면 날씨 카드가 쌓여요. (여러 공항 가능, ✕로 닫기)',
    lastSync: '마지막 동기화 {when} · 오프라인에서도 모든 기록을 볼 수 있어요',
  },
} satisfies Dict<HomeStrings>
