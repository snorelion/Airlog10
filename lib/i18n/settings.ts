import type { Dict } from './core'

type SettingsStrings = {
  language: string
  languageHint: string
  title: string
  myInfo: string
  myInfoHint: string
  pilotName: string
  defaultRole: string
  airline: string
  homeBase: string
  employeeNo: string
  licenceNo: string
  expiriesTitle: string
  expiriesHint: string
  medical: string
  englishProf: string
  recurrent: string
  companyRules: string
  companyRulesHint: string
  regPrefix: string
  flightPrefix: string
  fleetTypes: string
  fleetTypesHint: string
  limitsTitle: string
  limitsHint: string
  d28: string
  d90: string
  m12: string
  theme: string
  themeSystem: string
  themeLight: string
  themeDark: string
  themeHint: string
  backupTitle: string
  copyEmail: string
  downloadCsv: string
  sending: string
  sendCopy: string
  needAddress: string
  badAddress: string
  willSendTo: string
  saving: string
  save: string
  saved: string
  crewList: string
  importLink: string
  inviteCodes: string
  logout: string
  terms: string
  privacy: string
  deleteAccount: string
  deleteAccountHint: string
  // 알림·확인창
  needOnline: string
  needLogin: string
  saveAddressFailed: string
  sendFailed: string
  sentOk: string
  logoutPending: string
  logoutPlain: string
  deleteConfirm1: string
  deleteConfirm2: string
  deleteFailed: string
  deleteFailedAlert: string
  // 오프라인 준비 상태 (화면 이름은 lib/offline-routes.ts의 labelKey와 짝을 이룬다)
  offlineTitle: string
  offlineHint: string
  offlineAllReady: string
  scrHome: string
  scrLogbook: string
  scrLog: string
  scrStats: string
  scrMap: string
  scrLedger: string
  scrAircraft: string
  scrCrew: string
  scrSettings: string
}

export const settings = {
  en: {
    language: 'Language',
    languageHint: 'Auto follows your phone’s language.',
    title: 'Settings',
    myInfo: 'My details',
    myInfoHint: 'Your name goes into the right crew field automatically, and your home base pre-fills departure.',
    pilotName: 'Name (as in logbook)',
    defaultRole: 'Default role',
    airline: 'Airline',
    homeBase: 'Home base (ICAO)',
    employeeNo: 'Staff no.',
    licenceNo: 'Licence no.',
    expiriesTitle: 'Expiry dates',
    expiriesHint: 'Add these and the home screen shows a countdown.',
    medical: 'Medical',
    englishProf: 'English (ICAO English)',
    recurrent: 'Recurrent (simulator)',
    companyRules: 'Company formatting',
    companyRulesHint: 'Adds the prefix for you. e.g. registration {reg} → {regFull}, flight {no} → {noFull}',
    regPrefix: 'Registration prefix',
    flightPrefix: 'Flight no. prefix',
    fleetTypes: 'Our fleet types (comma separated)',
    fleetTypesHint: 'These appear as quick-pick buttons under the aircraft type field.',
    limitsTitle: 'Flight time limits (hours)',
    limitsHint: 'Used by the gauges on the home screen. Adjust to your company’s rules.',
    d28: '28 days',
    d90: '90 days',
    m12: '12 months',
    theme: 'Appearance',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeHint: 'Dark is easier on the eyes in a night briefing room 🌙',
    backupTitle: 'Backup · Export',
    copyEmail: 'Email for copies (we only send to this address)',
    downloadCsv: 'Download whole logbook as CSV',
    sending: 'Sending…',
    sendCopy: '📧 Email me a copy',
    needAddress: 'Enter an address to send to',
    badAddress: 'Please check the email address',
    willSendTo: '→ sending to {email}',
    saving: 'Saving…',
    save: 'Save',
    saved: 'Saved ✓',
    crewList: '👥 Crew',
    importLink: '📥 Import',
    inviteCodes: '🎫 Invite codes',
    logout: 'Sign out',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    deleteAccount: 'Delete account',
    deleteAccountHint: 'Everything is permanently deleted. Please download a CSV backup first.',
    needOnline: 'Sending email needs an internet connection.',
    needLogin: 'Please sign in.',
    saveAddressFailed: 'Could not save the address. Please try again shortly.',
    sendFailed: 'Could not send.',
    sentOk: '✅ Sent {n} flights to {to}!',
    logoutPending: '{n} items have not been uploaded yet. Signing out clears them from this device. Continue?',
    logoutPlain: 'Sign out? This device’s local copy is cleared (your records stay safe on the server).',
    deleteConfirm1: 'Really delete your account? All flights and your profile are permanently erased and cannot be recovered.',
    deleteConfirm2: 'Last check. Have you downloaded a CSV backup? Proceed with deletion?',
    deleteFailed: 'Deletion failed',
    deleteFailedAlert: 'Deletion failed: ',
    offlineTitle: 'Ready for offline',
    offlineHint: 'Screens saved on this device. They fill in on their own while you are online.',
    offlineAllReady: 'All screens are saved — everything opens in airplane mode.',
    scrHome: 'Home',
    scrLogbook: 'Logbook',
    scrLog: 'Log a flight',
    scrStats: 'Statistics',
    scrMap: 'Map',
    scrLedger: 'Ledger',
    scrAircraft: 'Aircraft',
    scrCrew: 'Crew',
    scrSettings: 'Settings',
  },
  ko: {
    language: '언어',
    languageHint: '자동은 폰 언어를 따라가요.',
    title: '설정',
    myInfo: '내 정보',
    myInfoHint: '기록할 때 역할에 맞는 칸에 이름이 자동으로 들어가고, 홈베이스는 출발지로 미리 채워져요.',
    pilotName: '이름 (로그북 표기)',
    defaultRole: '기본 역할',
    airline: '소속 항공사',
    homeBase: '홈베이스 (ICAO)',
    employeeNo: '사번',
    licenceNo: '면장 번호',
    expiriesTitle: '자격 만료일',
    expiriesHint: '넣어두면 홈 화면에 D-day로 보여드려요.',
    medical: '메디컬',
    englishProf: '영어 자격 (ICAO English)',
    recurrent: '리커런트 (시뮬레이터)',
    companyRules: '회사 표기 규칙',
    companyRulesHint: '기록할 때 앞부분을 자동으로 붙여줘요. 예: 등록번호 {reg} → {regFull}, 편명 {no} → {noFull}',
    regPrefix: '등록번호 앞부분',
    flightPrefix: '편명 앞부분',
    fleetTypes: '우리 기단 기종 (쉼표로 구분)',
    fleetTypesHint: '기록 화면 기종 칸 아래에 빠른 선택 버튼으로 나와요.',
    limitsTitle: '비행시간 한도 (시간)',
    limitsHint: '홈의 리밋 게이지 기준이에요. 회사 규정에 맞게 조정하세요.',
    d28: '28일',
    d90: '90일',
    m12: '12개월',
    theme: '화면 테마',
    themeSystem: '시스템',
    themeLight: '밝게',
    themeDark: '어둡게',
    themeHint: '야간 브리핑룸에선 "어둡게"가 눈이 편해요 🌙',
    backupTitle: '백업 · 내보내기',
    copyEmail: '사본 받을 이메일 (여기 적은 주소로만 보냅니다)',
    downloadCsv: '로그북 전체 CSV 다운로드',
    sending: '보내는 중…',
    sendCopy: '📧 이메일로 사본 보내기',
    needAddress: '받을 주소를 먼저 입력해 주세요',
    badAddress: '이메일 주소 형식을 확인해 주세요',
    willSendTo: '→ {email} 으로 보냅니다',
    saving: '저장 중…',
    save: '저장',
    saved: '저장했어요 ✓',
    crewList: '👥 크루 목록',
    importLink: '📥 가져오기',
    inviteCodes: '🎫 초대 코드',
    logout: '로그아웃',
    terms: '이용약관',
    privacy: '개인정보처리방침',
    deleteAccount: '계정 삭제',
    deleteAccountHint: '모든 데이터가 영구 삭제돼요. 먼저 CSV 백업을 권장해요.',
    needOnline: '메일 발송은 인터넷 연결이 필요해요.',
    needLogin: '로그인이 필요해요.',
    saveAddressFailed: '주소를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
    sendFailed: '발송에 실패했어요.',
    sentOk: '✅ {to} 로 {n}편 사본을 보냈어요!',
    logoutPending: '아직 서버로 안 올라간 항목이 {n}건 있어요. 로그아웃하면 이 기기에서 지워져요. 계속할까요?',
    logoutPlain: '로그아웃할까요? 이 기기의 저장본은 비워져요 (기록은 서버에 안전).',
    deleteConfirm1: '정말 계정을 삭제할까요? 모든 비행 기록·프로필이 영구히 지워지고 되돌릴 수 없어요.',
    deleteConfirm2: '마지막 확인이에요. 백업(CSV)을 받아두셨나요? 삭제를 진행할까요?',
    deleteFailed: '삭제 실패',
    deleteFailedAlert: '삭제에 실패했어요: ',
    offlineTitle: '오프라인 준비 상태',
    offlineHint: '이 기기에 저장된 화면이에요. 온라인일 때 알아서 채워집니다.',
    offlineAllReady: '모든 화면이 저장됐어요 — 비행기모드에서도 다 열립니다.',
    scrHome: '홈',
    scrLogbook: '로그북',
    scrLog: '기록하기',
    scrStats: '통계',
    scrMap: '지도',
    scrLedger: '장부',
    scrAircraft: '기체',
    scrCrew: '크루',
    scrSettings: '설정',
  },
} satisfies Dict<SettingsStrings>
