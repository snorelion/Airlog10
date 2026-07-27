// 문자열이 적은 화면들 — 각각 파일을 두면 조각이 너무 잘게 나뉜다.
// (사전을 나눈 목적은 "한 파일이 계속 커지는 것"을 막는 데 있다.)
import type { Dict } from './core'

export const map = {
  en: {
    title: 'Pilot map',
    summary: '{airports} airports · {countries} countries · {routes} routes',
    all: 'All',
    weeks4: 'Last 4 weeks',
    lastMonth: 'Last month',
    custom: 'Custom',
    loading: 'Loading…',
    emptyAll: 'The map fills in as you log flights. (Coordinates are fetched once while online.)',
    emptyRange: 'No flights in this period.',
    visits: '{n}',
    missing: '{n} airports are missing from the map — we could not find their coordinates.',
  },
  ko: {
    title: '파일럿 맵',
    summary: '공항 {airports}곳 · {countries}개국 · 노선 {routes}개',
    all: '전체',
    weeks4: '최근 4주',
    lastMonth: '지난 달',
    custom: '직접',
    loading: '불러오는 중…',
    emptyAll: '기록이 쌓이면 지도가 채워져요. (좌표는 온라인에서 한 번 받아와요)',
    emptyRange: '이 기간엔 비행 기록이 없어요.',
    visits: '{n}회',
    missing: '좌표를 못 찾은 공항 {n}곳은 지도에서 빠져 있어요.',
  },
} satisfies Dict<{
  title: string; summary: string; all: string; weeks4: string; lastMonth: string
  custom: string; loading: string; emptyAll: string; emptyRange: string
  visits: string; missing: string
}>

export const aircraft = {
  en: {
    title: 'Aircraft',
    titleCount: 'Aircraft · {n}',
    toSettings: 'Settings',
    search: 'Search registration or type',
    loading: 'Loading…',
    empty: 'Aircraft you fly appear here automatically.',
    flightsTime: '{n} flights · {time}',
    lastFlown: 'Last {date}',
    block: 'Block',
    airborne: 'Airborne',
    night: 'Night',
    recentFlights: 'Recent flights',
  },
  ko: {
    title: '기체',
    titleCount: '기체 · {n}대',
    toSettings: '설정으로',
    search: '등록번호·기종 검색',
    loading: '불러오는 중…',
    empty: '기록에서 탄 기체가 자동으로 모여요.',
    flightsTime: '{n}편 · {time}',
    lastFlown: '최근 {date}',
    block: '블록',
    airborne: '공중',
    night: '야간',
    recentFlights: '최근 비행',
  },
} satisfies Dict<{
  title: string; titleCount: string; toSettings: string; search: string
  loading: string; empty: string; flightsTime: string; lastFlown: string
  block: string; airborne: string; night: string; recentFlights: string
}>

export const people = {
  en: {
    title: 'Crew',
    toSettings: 'Settings',
    search: 'Search by name',
    loading: 'Loading…',
    empty: 'Crew you fly with appear here automatically.',
    flightsN: '{n} flights',
    rolePic: 'Captain',
    roleSic: 'First officer',
    roleBoth: 'Captain · First officer',
    lastFlown: ' · last {date}',
    staffNo: 'Staff no.',
    notes: 'Notes (style, things to remember…)',
    cancel: 'Cancel',
    save: 'Save',
  },
  ko: {
    title: '크루',
    toSettings: '설정으로',
    search: '이름 검색',
    loading: '불러오는 중…',
    empty: '같이 비행한 크루가 기록에서 자동으로 모여요.',
    flightsN: '{n}편',
    rolePic: '기장',
    roleSic: '부기장',
    roleBoth: '기장·부기장',
    lastFlown: ' · 마지막 {date}',
    staffNo: '사번',
    notes: '메모 (성향, 기억할 것…)',
    cancel: '취소',
    save: '저장',
  },
} satisfies Dict<{
  title: string; toSettings: string; search: string; loading: string; empty: string
  flightsN: string; rolePic: string; roleSic: string; roleBoth: string
  lastFlown: string; staffNo: string; notes: string; cancel: string; save: string
}>

export const airport = {
  en: {
    toStats: 'Statistics',
    offlineInfo: '(Offline — airport details need a connection)',
    loading: 'Loading…',
    elevation: ' · elevation {ft} ft',
    myVisits: 'My visits',
    visitsN: '{n}',
    first: 'First',
    last: 'Last',
    runways: 'Runways',
    myNotes: 'My notes',
    notesPlaceholder: 'Approach tips, taxi routes, things to watch…',
    saveNote: 'Save note',
    noteSaved: 'Saved ✓ (safe even offline)',
  },
  ko: {
    toStats: '통계로',
    offlineInfo: '(오프라인 — 공항 정보는 온라인에서)',
    loading: '불러오는 중…',
    elevation: ' · 표고 {ft} ft',
    myVisits: '내 방문',
    visitsN: '{n}회',
    first: '처음',
    last: '마지막',
    runways: '활주로',
    myNotes: '내 메모',
    notesPlaceholder: '접근 팁, 택시 루트, 주의사항…',
    saveNote: '메모 저장',
    noteSaved: '저장했어요 ✓ (오프라인이어도 안전)',
  },
} satisfies Dict<{
  toStats: string; offlineInfo: string; loading: string; elevation: string
  myVisits: string; visitsN: string; first: string; last: string; runways: string
  myNotes: string; notesPlaceholder: string; saveNote: string; noteSaved: string
}>

export const fixTimes = {
  en: {
    title: 'Fix missing times',
    toLogbook: 'Logbook',
    intro: 'These entries had no time in the file you imported. Enter the flight time and they count towards your totals.',
    example: '(e.g. {a} or {b})',
    loading: 'Loading…',
    allDone: 'No entries are missing a time!',
    save: 'Save',
    savedN: 'Saved {n} ✓',
  },
  ko: {
    title: '빈 시간 정리',
    toLogbook: '로그북으로',
    intro: '원본 파일에 시간이 비어 있던 기록이에요. 비행시간을 넣고 저장하면 합계에 반영돼요.',
    example: '(예: {a} 또는 {b})',
    loading: '불러오는 중…',
    allDone: '빈 시간 기록이 없어요!',
    save: '저장',
    savedN: '{n}건 저장했어요 ✓',
  },
} satisfies Dict<{
  title: string; toLogbook: string; intro: string; example: string
  loading: string; allDone: string; save: string; savedN: string
}>

export const printView = {
  en: {
    back: '← Back to ledger',
    hint: 'Choose “Save as PDF” in the print dialog · Landscape orientation recommended',
    print: 'Print / Save as PDF',
    loading: 'Loading…',
  },
  ko: {
    back: '← 장부로',
    hint: '인쇄 창에서 "PDF로 저장" · 용지 방향 가로(landscape) 권장',
    print: '인쇄 / PDF 저장',
    loading: '불러오는 중…',
  },
} satisfies Dict<{ back: string; hint: string; print: string; loading: string }>

export const wx = {
  en: {
    heading: '{ident} weather',
    refresh: 'Refresh',
    close: 'Close card',
    fetching: 'Fetching the latest observation…',
    none: 'No observation yet. Open this once while online and it will be saved.',
    received: 'Observed {age}',
    savedOffline: '· Saved — stays readable offline',
  },
  ko: {
    heading: '{ident} 날씨',
    refresh: '새로고침',
    close: '카드 닫기',
    fetching: '관측 정보를 받아오는 중…',
    none: '아직 받은 관측이 없어요. 온라인에서 한 번 열면 저장돼요.',
    received: '{age} 수신',
    savedOffline: '· 저장됨 — 오프라인에서도 계속 보여요',
  },
} satisfies Dict<{
  heading: string; refresh: string; close: string; fetching: string
  none: string; received: string; savedOffline: string
}>
