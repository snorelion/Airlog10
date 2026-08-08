// /welcome 의 문구 전부 — 화면(WelcomeClient)에서 분리해 둔다.
// 문구만 고칠 일이 훨씬 잦고, 세 언어를 나란히 두고 봐야 번역이 어긋나지 않는다.
//
// ⚠️ 앱 화면들(lib/i18n)의 Dict 방식과 다르다.
//    Dict는 "en만 채우고 나머지는 빠진 문장을 영어로 폴백"하는 평평한 문자열 표라,
//    배열·중첩이 있는 이 랜딩 문구에는 맞지 않는다. 여기서는 세 언어를 전부 채운다.
//
// ⚠️ 앱은 아직 태국어를 켜지 않았지만(core.ts의 LANG_READY = en·ko),
//    랜딩은 태국인 파일럿에게 보여줄 페이지라 태국어를 지원한다.
//    그래서 언어 판정도 core의 resolveLang이 아니라 아래 resolveWelcomeLang을 쓴다.

export type WelcomeLang = 'en' | 'ko' | 'th'

export const WELCOME_LANGS: { code: WelcomeLang; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ko', label: '한국어' },
  { code: 'th', label: 'ไทย' },
]

/// 자동으로 알아보는 회사 양식 — **새 항공사를 지원하면 여기만 고친다.**
/// 세 언어의 "지난 기록 가져오기" 문구가 이 값을 끼워 쓰므로, 문장을 세 번 찾아
/// 고칠 필요가 없다 (2026-08-08 — 앞으로 계속 늘어날 목록이라 한 곳에 모았다).
export const IMPORT_FORMATS = {
  en: 'Thai Lion Air, Korean Air, Peach Aviation and LogTen Pro',
  ko: '타이라이언에어 · 대한항공 · 피치항공 · LogTen Pro',
  th: 'Thai Lion Air, Korean Air, Peach Aviation และ LogTen Pro',
} as const

type Pair = { t: string; d: string }

export type WelcomeContent = {
  meta: { title: string; description: string }
  hero: {
    title: string
    sub: string
    byline: string
    cta: string
    ctaSoon: string
    note: string
  }
  strip: Pair[]
  offline: { kicker: string; body: string }
  allinone: { heading: string; body: string; items: string[] }
  offscreen: {
    heading: string
    sub: string
    shots: { home: string; lock: string }
    widget: { t: string; items: string[] }
    alerts: { t: string; items: string[] }
    note: string
  }
  how: { heading: string; sub: string; steps: Pair[] }
  shots: { hint: string; caps: string[] }
  features: { heading: string; items: Pair[] }
  pricing: {
    heading: string
    trial: string
    monthly: string
    monthlyPrice: string
    yearly: string
    yearlyPrice: string
    per: string
    perYear: string
    save: string
    freeTitle: string
    freeBody: string
    note: string
  }
  faq: { heading: string; items: { q: string; a: string }[] }
  footer: { privacy: string; terms: string; contact: string; signin: string; rights: string }
}

const en: WelcomeContent = {
  meta: {
    title: 'AirLog10 — Pilot logbook that works offline',
    description:
      'A pilot logbook that keeps every flight on your iPhone and iPad. Import your company logbook, check METAR/TAF, and print an FAA or EASA logbook — with or without a signal.',
  },
  hero: {
    title: 'Your logbook still works at FL350.',
    sub: 'Every flight lives on your iPhone and iPad. No spinner, no signal bars, no “connect to continue.”',
    byline: 'Built by a working airline pilot.',
    cta: 'Download on the App Store',
    ctaSoon: 'Coming soon to the App Store',
    note: 'iPhone · iPad · iOS 17 or later',
  },
  strip: [
    { t: 'Your company logbook, imported', d: `${IMPORT_FORMATS.en} are recognised automatically. Duplicates are skipped.` },
    { t: 'Works in airplane mode', d: 'Your flights, totals and logbook are already on the device.' },
    { t: 'A real logbook, not scattered files', d: 'FAA and EASA layouts with page totals carried forward.' },
  ],
  offline: {
    kicker: 'Why it exists',
    body: 'AirLog10 keeps your flights on the phone itself. Log the leg, close it. There is nothing to wait for. When you land, it syncs.',
  },
  allinone: {
    heading: 'One app, not four.',
    body: 'Your logbook and stats, your duty limits and currency, your medical and licence expiries, and the weather for today’s airports — all in one place. No spreadsheet on the side, no second app to open.',
    items: ['Logbook & stats', 'Duty & currency', 'Expiries', 'Weather'],
  },
  offscreen: {
    heading: 'Without opening the app',
    sub: 'The things you check before every flight, on the outside of your phone.',
    shots: { home: 'Home screen', lock: 'Lock screen' },
    widget: {
      t: 'Widgets',
      items: [
        'Home screen — your next flight: route, times, aircraft, and how many legs are left today',
        'The medium size adds the departure METAR',
        'Lock screen — next flight with departure and arrival METAR, one line each',
      ],
    },
    alerts: {
      t: 'Alerts',
      items: [
        'Departure alarm — hours before STD, with route, STD and report time. You choose how many hours',
        'Tomorrow’s briefing — the evening before, at a time you pick',
        'A warning when your 28-day block time passes 90% of the limit',
        'Medical, English proficiency and recurrent expiries',
      ],
    },
    note: 'Every alert is scheduled on the phone itself. No server, no connection — they fire even with the app closed.',
  },
  how: {
    heading: 'How it works',
    sub: 'Three steps, and you are done for good.',
    steps: [
      {
        t: 'Bring your history',
        d: `Import an Excel roster, your company’s printed PDF, or a photo of the roster on the crew room wall. ${IMPORT_FORMATS.en} formats are recognised automatically, and duplicate flights are skipped — so re-importing is always safe.`,
      },
      {
        t: 'Log a flight in seconds',
        d: 'Today’s roster is already on the home screen. Tap “Log it” and the route, times and aircraft are filled in. Type IATA and it becomes ICAO — UTH turns into VTUD by itself.',
      },
      {
        t: 'Print a real logbook',
        d: 'FAA or EASA layout, page totals carried forward, ready to hand to an inspector. Share it as a PDF straight from the app.',
      },
    ],
  },
  shots: {
    hint: 'Swipe to see the app.',
    caps: [
      'Home — your next flight',
      'Log a flight',
      'Every flight you’ve flown',
      'Logbook (PDF)',
      'METAR & TAF',
      'Flying map',
      'Stats',
    ],
  },
  features: {
    heading: 'What’s in it',
    items: [
      { t: 'Night time, automatic', d: 'Civil twilight (−6°) sampled along the great-circle route. Type your own figure and AirLog10 keeps it.' },
      { t: 'METAR & TAF', d: 'Your next flight’s airports, plus any you add yourself. Refreshed twice an hour from aviationweather.gov.' },
      { t: 'Flying map', d: 'Every route you have flown, drawn on one map — airports, countries, and how many times around the Earth.' },
      { t: 'Limits & currency', d: '28-day, 90-day and 12-month totals, with takeoffs and landings, in one line on the home screen.' },
      { t: 'Stats that answer questions', d: 'By month, year, aircraft type and airport. Day against night, domestic against international.' },
      { t: 'Yours, offline', d: 'Everything is on the device. Sync is a backup, not a requirement.' },
      { t: 'Built for iPad', d: 'The logbook opens side by side — pick a flight on the left, read it on the right, like a paper logbook lying open.' },
      { t: 'One purchase, both devices', d: 'Your subscription is tied to your Apple Account, so iPhone and iPad come together. Nothing to buy twice.' },
      { t: 'Notes on crews, airports and aircraft', d: 'Jot down that the runway is short, or how a captain likes the briefing. It comes back the next time you fly there — or with them.' },
    ],
  },
  pricing: {
    heading: 'Simple pricing',
    trial: '2 weeks free',
    monthly: 'Monthly',
    monthlyPrice: '$2.99',
    yearly: 'Yearly',
    yearlyPrice: '$24.99',
    per: 'per month',
    perYear: 'per year',
    save: 'Save 30%',
    freeTitle: 'Reading is always free.',
    freeBody:
      'If your subscription ends, your flights do not go anywhere. You can still open them, search them and edit them. A subscription is needed only to add a new flight, import, or export the logbook PDF.',
    note: 'Prices are lower in some countries — you always see your own store’s price.',
  },
  faq: {
    heading: 'Questions',
    items: [
      {
        q: 'Does it really work with no signal?',
        a: 'Yes. Your flights are stored on the iPhone, not fetched from a server. The only two things that need a connection are importing a company logbook and refreshing weather.',
      },
      {
        q: 'Can I bring my old logbook in?',
        a: 'Yes — an Excel file, a printed PDF from your company, or a photo of your roster. Duplicate flights are detected and skipped, so you can import the same file twice without making a mess.',
      },
      {
        q: 'What happens to my flights if I stop paying?',
        a: 'Nothing. You keep reading, searching and editing them for as long as you like. Only adding new flights, importing and PDF export are locked.',
      },
      {
        q: 'Where is my data kept?',
        a: 'On your iPhone. A copy is synced to your account so you can restore it on a new phone. No ads, no analytics, and nothing shared with anyone else.',
      },
      { q: 'FAA or EASA?', a: 'Both. Choose the layout when you open the logbook PDF.' },
      { q: 'Which times does it use?', a: 'UTC, the way your roster does.' },
      { q: 'Is there an Android version?', a: 'Not yet. AirLog10 is an iPhone app for now.' },
    ],
  },
  footer: { privacy: 'Privacy', terms: 'Terms', contact: 'Contact', signin: 'Sign in', rights: '© 2026 AirLog10' },
}

const ko: WelcomeContent = {
  meta: {
    title: 'AirLog10 — 오프라인에서도 열리는 파일럿 로그북',
    description:
      '모든 비행이 아이폰과 아이패드 안에 있는 파일럿 로그북. 회사 로그북 가져오기, METAR·TAF, FAA·EASA 로그북 인쇄까지 — 신호가 없어도 그대로 됩니다.',
  },
  hero: {
    title: 'FL350 위에서도 언제나 당신과 함께',
    sub: '모든 비행이 내 손 안에 있습니다. 로딩 화면도, “연결하세요”도 없습니다.',
    byline: '파일럿이 만든 로그북',
    cta: 'App Store에서 받기',
    ctaSoon: 'App Store 출시 예정',
    note: '아이폰 · 아이패드 · iOS 17 이상',
  },
  strip: [
    { t: '회사 로그북 그대로 가져오기', d: `${IMPORT_FORMATS.ko} 양식을 자동으로 알아봅니다. 중복은 건너뜁니다.` },
    { t: '비행기모드에서도 작동', d: '비행 기록도 합계도 로그북도 이미 기기 안에 있습니다.' },
    { t: '흩어진 파일이 아니라 진짜 로그북', d: 'FAA·EASA 양식, 페이지 이월 합계까지 그대로.' },
  ],
  offline: {
    kicker: '왜 만들었나',
    body: 'AirLog10은 비행 기록이 폰 안에 있습니다. 비행을 적고, 닫으면 끝입니다. 기다릴 것이 없습니다. 착륙하면 알아서 동기화합니다.',
  },
  allinone: {
    heading: '앱 하나로 끝납니다.',
    body: '비행 기록과 통계, 시간 리밋과 커런시, 자격 만료일, 그리고 오늘 갈 공항의 날씨까지 한곳에 있습니다. 따로 엑셀을 만들 필요도, 다른 앱을 열 필요도 없습니다.',
    items: ['기록 · 통계', '시간 관리', '자격 관리', '날씨'],
  },
  offscreen: {
    heading: '폰을 열지 않아도',
    sub: '비행 전에 늘 확인하는 것들을, 잠금 해제 전에.',
    shots: { home: '홈 화면', lock: '잠금화면' },
    widget: {
      t: '위젯',
      items: [
        '홈 화면 — 다음 비행의 노선·시각·기체, 오늘 남은 구간 수까지',
        '중간 크기에는 출발 공항 METAR가 함께 나옵니다',
        '잠금화면 — 다음 비행과 출발·도착 METAR를 한 줄씩',
      ],
    },
    alerts: {
      t: '알림',
      items: [
        '출발 알람 — STD 몇 시간 전에 노선·STD·리포트 시각. 몇 시간 전인지는 직접 정합니다',
        '내일 브리핑 — 전날 저녁, 정해둔 시각에 내일 첫 비행 요약',
        '28일 블록타임이 한도의 90%를 넘으면 경고',
        '신체검사·영어자격·리커런트 만료 알림',
      ],
    },
    note: '모든 알림은 폰 안에서 예약됩니다. 서버도 인터넷도 필요 없고, 앱이 꺼져 있어도 울립니다.',
  },
  how: {
    heading: '사용 방법',
    sub: '세 단계면 끝입니다.',
    steps: [
      {
        t: '지난 기록 가져오기',
        d: `회사 엑셀, 인쇄된 PDF, 크루룸 벽에 붙은 로스터 사진까지 넣을 수 있습니다. ${IMPORT_FORMATS.ko} 양식은 자동으로 알아봅니다. 중복된 비행은 건너뛰니 같은 파일을 두 번 넣어도 안전합니다.`,
      },
      {
        t: '몇 초 만에 기록',
        d: '홈 화면에 오늘 로스터가 이미 떠 있습니다. “Log it” 한 번이면 노선·시각·기체가 채워집니다. IATA로 쳐도 ICAO로 바뀝니다 — UTH는 알아서 VTUD가 됩니다.',
      },
      {
        t: '진짜 로그북으로 인쇄',
        d: 'FAA 또는 EASA 양식, 페이지 이월 합계까지. 심사관에게 그대로 낼 수 있고, 앱에서 바로 PDF로 보낼 수 있습니다.',
      },
    ],
  },
  shots: {
    hint: '옆으로 넘겨보세요.',
    caps: ['홈 — 다음 비행', '비행 기록하기', '지금까지의 모든 비행', '로그북 (PDF)', 'METAR · TAF', '비행 지도', '통계'],
  },
  features: {
    heading: '들어 있는 것',
    items: [
      { t: '야간시간 자동 계산', d: '대권항로를 따라 시민박명(−6°)으로 계산합니다. 직접 값을 넣으면 그 값을 그대로 지킵니다.' },
      { t: 'METAR · TAF', d: '다음 비행의 공항은 물론, 직접 추가한 공항까지. aviationweather.gov에서 30분마다 갱신합니다.' },
      { t: '비행 지도', d: '지금까지 날아온 모든 노선을 한 장에. 공항 수, 나라 수, 지구를 몇 바퀴 돌았는지까지.' },
      { t: '리밋 · 커런시', d: '28일·90일·12개월 누적과 이착륙 횟수를 홈 화면 한 줄에서 봅니다.' },
      { t: '궁금한 걸 답하는 통계', d: '월·연도·기종·공항별로. 주간과 야간, 국내선과 국제선을 나눠서.' },
      { t: '오프라인이 기본', d: '모든 것이 기기 안에 있습니다. 동기화는 백업일 뿐, 필수가 아닙니다.' },
      { t: '아이패드에 맞춰', d: '로그북이 좌우로 열립니다. 왼쪽에서 비행을 고르면 오른쪽에 펼쳐집니다 — 종이 로그북을 펼쳐 놓은 것처럼.' },
      { t: '한 번 결제로 두 기기', d: '구독은 Apple 계정에 묶여 있어 아이폰과 아이패드가 함께 됩니다. 두 번 사지 않아도 됩니다.' },
      { t: '크루 · 공항 · 기체 메모', d: '“이 활주로는 짧다”, “이 기장님은 브리핑을 이렇게 하신다” — 적어두면 그 공항에 다시 가거나 그 사람과 다시 날 때 알아서 올라옵니다.' },
    ],
  },
  pricing: {
    heading: '가격',
    trial: '2주 무료 체험',
    monthly: '월간',
    monthlyPrice: '$2.99',
    yearly: '연간',
    yearlyPrice: '$24.99',
    per: '매월',
    perYear: '매년',
    save: '30% 절약',
    freeTitle: '읽는 것은 언제나 무료입니다.',
    freeBody:
      '구독이 끝나도 기록은 사라지지 않습니다. 계속 열어보고, 검색하고, 고칠 수 있습니다. 구독이 필요한 건 새 비행 추가·가져오기·로그북 PDF 내보내기 세 가지뿐입니다.',
    note: '나라에 따라 더 저렴합니다 — 언제나 내 스토어의 가격이 보입니다.',
  },
  faq: {
    heading: '자주 묻는 것',
    items: [
      {
        q: '정말 신호가 없어도 되나요?',
        a: '됩니다. 비행 기록은 서버에서 받아오는 게 아니라 아이폰 안에 저장되어 있습니다. 연결이 필요한 건 회사 로그북 가져오기와 날씨 갱신, 이 두 가지뿐입니다.',
      },
      {
        q: '예전 로그북을 옮길 수 있나요?',
        a: '네 — 엑셀 파일, 회사에서 뽑아준 PDF, 로스터 사진까지 됩니다. 중복된 비행은 알아서 건너뛰기 때문에 같은 파일을 두 번 넣어도 엉키지 않습니다.',
      },
      {
        q: '구독을 끊으면 기록은 어떻게 되나요?',
        a: '그대로 있습니다. 원하는 만큼 계속 열어보고, 검색하고, 고칠 수 있습니다. 잠기는 건 새 비행 추가·가져오기·PDF 내보내기뿐입니다.',
      },
      {
        q: '데이터는 어디에 있나요?',
        a: '아이폰 안에 있습니다. 새 폰에서 복구할 수 있도록 계정에 사본을 동기화합니다. 광고도, 분석 도구도, 외부 공유도 없습니다.',
      },
      { q: 'FAA인가요 EASA인가요?', a: '둘 다 됩니다. 로그북 PDF를 열 때 양식을 고르면 됩니다.' },
      { q: '시각은 어떤 기준인가요?', a: '로스터와 같은 UTC입니다.' },
      { q: '안드로이드 버전도 있나요?', a: '아직 없습니다. 지금은 아이폰 앱입니다.' },
    ],
  },
  footer: { privacy: '개인정보', terms: '약관', contact: '문의', signin: '로그인', rights: '© 2026 AirLog10' },
}

// ⚠️ 태국어는 원어민 검수 전이다(2026-08-03). 검수 뒤 이 블록만 고치면 된다.
const th: WelcomeContent = {
  meta: {
    title: 'AirLog10 — สมุดบันทึกการบินที่ใช้ได้แบบออฟไลน์',
    description:
      'สมุดบันทึกการบินที่เก็บทุกเที่ยวบินไว้ใน iPhone และ iPad ของคุณ นำเข้าสมุดบันทึกของบริษัท ดู METAR/TAF และพิมพ์สมุดบันทึกแบบ FAA หรือ EASA ได้ แม้ไม่มีสัญญาณ',
  },
  hero: {
    title: 'อยู่กับคุณเสมอ แม้ที่ FL350',
    sub: 'ทุกเที่ยวบินอยู่ในมือคุณ ไม่ต้องรอโหลด ไม่มีคำว่า “เชื่อมต่ออินเทอร์เน็ตก่อน”',
    byline: 'สมุดบันทึกที่นักบินสร้างเอง',
    cta: 'ดาวน์โหลดบน App Store',
    ctaSoon: 'เร็ว ๆ นี้บน App Store',
    note: 'iPhone · iPad · iOS 17 ขึ้นไป',
  },
  strip: [
    { t: 'นำเข้าสมุดบันทึกของบริษัทได้เลย', d: `รู้จักรูปแบบของ ${IMPORT_FORMATS.th} โดยอัตโนมัติ และข้ามเที่ยวบินที่ซ้ำให้` },
    { t: 'ใช้ได้ในโหมดเครื่องบิน', d: 'เที่ยวบิน ยอดสะสม และสมุดบันทึก อยู่ในเครื่องอยู่แล้ว' },
    { t: 'สมุดบันทึกจริง ไม่ใช่ไฟล์กระจัดกระจาย', d: 'รูปแบบ FAA และ EASA พร้อมยอดยกมาของแต่ละหน้า' },
  ],
  offline: {
    kicker: 'ทำไมถึงมีแอปนี้',
    body: 'AirLog10 เก็บเที่ยวบินไว้ในเครื่อง บันทึกเที่ยวบินแล้วปิด ไม่มีอะไรให้รอ พอลงถึงพื้นก็ซิงก์ให้เอง',
  },
  allinone: {
    heading: 'แอปเดียว ไม่ต้องสี่แอป',
    body: 'สมุดบันทึกและสถิติ ลิมิตชั่วโมงบินและ currency วันหมดอายุใบอนุญาต และสภาพอากาศของสนามบินวันนี้ อยู่ในที่เดียวกันทั้งหมด ไม่ต้องทำสเปรดชีตแยก ไม่ต้องเปิดแอปอื่น',
    items: ['บันทึกและสถิติ', 'ลิมิตและ currency', 'วันหมดอายุ', 'สภาพอากาศ'],
  },
  offscreen: {
    heading: 'โดยไม่ต้องเปิดแอป',
    sub: 'สิ่งที่คุณเช็กก่อนบินทุกครั้ง อยู่บนหน้าจอตั้งแต่ยังไม่ปลดล็อก',
    shots: { home: 'หน้าจอโฮม', lock: 'หน้าจอล็อก' },
    widget: {
      t: 'วิดเจ็ต',
      items: [
        'หน้าจอโฮม — เที่ยวบินถัดไป ทั้งเส้นทาง เวลา เครื่องบิน และเหลืออีกกี่เลกในวันนี้',
        'ขนาดกลางจะมี METAR ของสนามบินต้นทางเพิ่มมาด้วย',
        'หน้าจอล็อก — เที่ยวบินถัดไปพร้อม METAR ต้นทางและปลายทาง อย่างละบรรทัด',
      ],
    },
    alerts: {
      t: 'การแจ้งเตือน',
      items: [
        'เตือนก่อนออกเดินทาง — ก่อน STD ตามจำนวนชั่วโมงที่คุณตั้งเอง พร้อมเส้นทาง STD และเวลารายงานตัว',
        'บรีฟพรุ่งนี้ — เย็นวันก่อน ตามเวลาที่คุณกำหนด',
        'เตือนเมื่อชั่วโมงบิน 28 วันเกิน 90% ของลิมิต',
        'เตือนวันหมดอายุใบตรวจร่างกาย ภาษาอังกฤษ และ recurrent',
      ],
    },
    note: 'การแจ้งเตือนทั้งหมดตั้งไว้ในเครื่อง ไม่ต้องใช้เซิร์ฟเวอร์หรืออินเทอร์เน็ต และเตือนแม้ปิดแอปอยู่',
  },
  how: {
    heading: 'ใช้งานอย่างไร',
    sub: 'สามขั้นตอน แล้วจบ',
    steps: [
      {
        t: 'นำประวัติเดิมเข้ามา',
        d: `นำเข้าไฟล์ Excel, ไฟล์ PDF ที่บริษัทพิมพ์ให้ หรือรูปถ่ายตารางบินที่ติดบนผนังห้องลูกเรือ ระบบรู้จักรูปแบบของ ${IMPORT_FORMATS.th} โดยอัตโนมัติ และข้ามเที่ยวบินที่ซ้ำให้ จึงนำเข้าซ้ำได้อย่างปลอดภัย`,
      },
      {
        t: 'บันทึกเที่ยวบินในไม่กี่วินาที',
        d: 'ตารางบินของวันนี้อยู่บนหน้าแรกอยู่แล้ว แตะ “Log it” แล้วเส้นทาง เวลา และเครื่องบินจะถูกเติมให้ พิมพ์รหัส IATA ก็เปลี่ยนเป็น ICAO ให้เอง — UTH กลายเป็น VTUD โดยอัตโนมัติ',
      },
      {
        t: 'พิมพ์เป็นสมุดบันทึกจริง',
        d: 'รูปแบบ FAA หรือ EASA พร้อมยอดยกมาของแต่ละหน้า ยื่นให้เจ้าหน้าที่ตรวจสอบได้ทันที และแชร์เป็น PDF จากในแอปได้เลย',
      },
    ],
  },
  shots: {
    hint: 'ปัดเพื่อดูเพิ่ม',
    caps: [
      'หน้าแรก — เที่ยวบินถัดไป',
      'บันทึกเที่ยวบิน',
      'ทุกเที่ยวบินที่ผ่านมา',
      'สมุดบันทึก (PDF)',
      'METAR และ TAF',
      'แผนที่การบิน',
      'สถิติ',
    ],
  },
  features: {
    heading: 'มีอะไรบ้าง',
    items: [
      { t: 'เวลากลางคืนอัตโนมัติ', d: 'คำนวณจาก civil twilight (−6°) ตามเส้นทางวงกลมใหญ่ ถ้าคุณกรอกเอง แอปจะเก็บค่าของคุณไว้' },
      { t: 'METAR และ TAF', d: 'สนามบินของเที่ยวบินถัดไป และสนามบินที่คุณเพิ่มเอง อัปเดตทุกครึ่งชั่วโมงจาก aviationweather.gov' },
      { t: 'แผนที่การบิน', d: 'ทุกเส้นทางที่คุณเคยบิน รวมอยู่ในแผนที่เดียว ทั้งจำนวนสนามบิน ประเทศ และรอบโลกที่บินไปแล้ว' },
      { t: 'ลิมิตและ currency', d: 'ยอดสะสม 28 วัน 90 วัน และ 12 เดือน พร้อมจำนวนขึ้นลง ในบรรทัดเดียวบนหน้าแรก' },
      { t: 'สถิติที่ตอบคำถามได้', d: 'แยกตามเดือน ปี แบบเครื่องบิน และสนามบิน ทั้งกลางวันกับกลางคืน ในประเทศกับต่างประเทศ' },
      { t: 'ออฟไลน์เป็นพื้นฐาน', d: 'ทุกอย่างอยู่ในเครื่อง การซิงก์เป็นแค่การสำรองข้อมูล ไม่ใช่สิ่งจำเป็น' },
      { t: 'ออกแบบมาเพื่อ iPad', d: 'สมุดบันทึกเปิดแบบสองฝั่ง เลือกเที่ยวบินทางซ้าย อ่านรายละเอียดทางขวา เหมือนเปิดสมุดบันทึกกระดาษวางไว้' },
      { t: 'ซื้อครั้งเดียว ใช้ได้ทั้งสองเครื่อง', d: 'การสมัครสมาชิกผูกกับ Apple Account ของคุณ iPhone และ iPad จึงใช้ร่วมกัน ไม่ต้องซื้อซ้ำ' },
      { t: 'บันทึกเรื่องลูกเรือ สนามบิน และเครื่องบิน', d: 'จดไว้ว่ารันเวย์สั้น หรือกัปตันท่านนี้ชอบบรีฟแบบไหน แล้วมันจะกลับมาให้เห็นอีกครั้งเมื่อคุณบินไปที่นั่น หรือบินกับคนคนนั้น' },
    ],
  },
  pricing: {
    heading: 'ราคา',
    trial: 'ทดลองฟรี 2 สัปดาห์',
    monthly: 'รายเดือน',
    monthlyPrice: '$2.99',
    yearly: 'รายปี',
    yearlyPrice: '$24.99',
    per: 'ต่อเดือน',
    perYear: 'ต่อปี',
    save: 'ประหยัด 30%',
    freeTitle: 'การอ่านฟรีเสมอ',
    freeBody:
      'ถ้าการสมัครสมาชิกสิ้นสุดลง เที่ยวบินของคุณยังอยู่ครบ เปิดดู ค้นหา และแก้ไขได้ตามปกติ การสมัครสมาชิกจำเป็นเฉพาะตอนเพิ่มเที่ยวบินใหม่ นำเข้าข้อมูล และส่งออกสมุดบันทึก PDF เท่านั้น',
    note: 'บางประเทศราคาถูกกว่า — คุณจะเห็นราคาของสโตร์ตัวเองเสมอ',
  },
  faq: {
    heading: 'คำถามที่พบบ่อย',
    items: [
      {
        q: 'ใช้งานได้จริงไหมเมื่อไม่มีสัญญาณ',
        a: 'ได้ เที่ยวบินถูกเก็บไว้ใน iPhone ไม่ได้ดึงจากเซิร์ฟเวอร์ สิ่งที่ต้องใช้อินเทอร์เน็ตมีเพียงสองอย่าง คือการนำเข้าสมุดบันทึกของบริษัท และการอัปเดตสภาพอากาศ',
      },
      {
        q: 'นำสมุดบันทึกเดิมเข้ามาได้ไหม',
        a: 'ได้ — ไฟล์ Excel ไฟล์ PDF ที่บริษัทพิมพ์ให้ หรือรูปถ่ายตารางบิน ระบบตรวจจับเที่ยวบินที่ซ้ำและข้ามให้ จึงนำเข้าไฟล์เดิมซ้ำได้โดยข้อมูลไม่รก',
      },
      {
        q: 'ถ้าหยุดจ่ายเงิน เที่ยวบินจะหายไหม',
        a: 'ไม่หาย คุณยังเปิดดู ค้นหา และแก้ไขได้นานเท่าที่ต้องการ สิ่งที่ถูกล็อกมีเพียงการเพิ่มเที่ยวบินใหม่ การนำเข้า และการส่งออก PDF',
      },
      {
        q: 'ข้อมูลเก็บไว้ที่ไหน',
        a: 'อยู่ใน iPhone ของคุณ และมีสำเนาซิงก์ไว้กับบัญชีเพื่อกู้คืนบนเครื่องใหม่ได้ ไม่มีโฆษณา ไม่มีการเก็บสถิติการใช้งาน และไม่แชร์ให้ใคร',
      },
      { q: 'FAA หรือ EASA', a: 'ได้ทั้งสองแบบ เลือกรูปแบบตอนเปิดสมุดบันทึก PDF' },
      { q: 'ใช้เวลามาตรฐานใด', a: 'UTC เหมือนกับตารางบินของคุณ' },
      { q: 'มีเวอร์ชัน Android ไหม', a: 'ยังไม่มี ตอนนี้ AirLog10 เป็นแอปสำหรับ iPhone' },
    ],
  },
  footer: {
    privacy: 'ความเป็นส่วนตัว',
    terms: 'ข้อกำหนด',
    contact: 'ติดต่อเรา',
    signin: 'เข้าสู่ระบบ',
    rights: '© 2026 AirLog10',
  },
}

export const WELCOME: Record<WelcomeLang, WelcomeContent> = { en, ko, th }

const isWelcomeLang = (v: unknown): v is WelcomeLang => v === 'en' || v === 'ko' || v === 'th'

// ?lang=th 처럼 주소로 대놓고 지정한 언어. 없으면 null.
// 상대에 맞춰 링크를 골라 보낼 수 있게 하려고 둔다 (태국 동료에겐 ?lang=th).
export function langFromQuery(v: string | string[] | undefined): WelcomeLang | null {
  const q = Array.isArray(v) ? v[0] : v
  return isWelcomeLang(q) ? q : null
}

// 랜딩 전용 언어 판정 — 앱과 달리 태국어도 인정한다.
// 쿠키(설정)가 먼저, 없으면 브라우저가 보낸 Accept-Language, 그것도 없으면 영어.
export function resolveWelcomeLang(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined,
): WelcomeLang {
  if (isWelcomeLang(cookieValue)) return cookieValue
  if (!acceptLanguage) return 'en'
  for (const tag of acceptLanguage.split(',')) {
    const base = tag.split(';')[0].trim().toLowerCase().split('-')[0]
    if (isWelcomeLang(base)) return base
  }
  return 'en'
}
