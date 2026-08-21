// 지원 항공사 명단 — **새 항공사를 지원하면 이 파일만 고친다.**
//
// 여기서 파생되는 것:
//   · 웹 환영 페이지 문구 (welcome.content.ts 의 IMPORT_FORMATS — 세 언어)
//   · iOS 앱의 "Supported airlines" 화면 (/api/import-formats 를 읽는다 —
//     앱 업데이트 없이, 서버 배포만으로 앱 명단이 늘어난다)
//
// 순서: 국가 알파벳 → 항공사 알파벳 (2026-08-14 정렬 도입 — 앱은 country로 섹션을 묶는다).
// logbook = 회사 로그북 파일 · roster = 스케줄 PDF · photo = 인쇄물 사진(온디바이스 OCR)

export type AirlineSupport = {
  name: string // 영어 표기 — API와 앱 UI가 그대로 쓴다
  ko: string
  th?: string // 태국어 현지 표기가 따로 있는 경우만 (없으면 영어 그대로)
  country: string // 영어 국가명 — 앱 명단의 섹션 헤더·정렬 키
  flag: string // 국기 이모지 — 섹션 헤더 표시용
  logbook?: boolean
  roster?: boolean
  photo?: boolean
}

export const AIRLINES: AirlineSupport[] = [
  { name: 'Air Canada', ko: '에어캐나다', country: 'Canada', flag: '🇨🇦', logbook: true, roster: true }, // 같은 Block Report가 로스터 겸용
  { name: 'Peach Aviation', ko: '피치항공', country: 'Japan', flag: '🇯🇵', roster: true },
  { name: 'Air Premia', ko: '에어프레미아', country: 'South Korea', flag: '🇰🇷', roster: true }, // PDC Crew Roster Report
  { name: 'Eastar Jet', ko: '이스타항공', country: 'South Korea', flag: '🇰🇷', roster: true },
  { name: 'Jeju Air', ko: '제주항공', country: 'South Korea', flag: '🇰🇷', roster: true, photo: true },
  { name: 'Jin Air', ko: '진에어', country: 'South Korea', flag: '🇰🇷', roster: true }, // Crew Daily Roster (.xls로 오는 HTML)
  // 로스터는 크루넷 양식 2종(Crew Roster Report·달력형)+달력형 엑셀 (2026-08-20)
  { name: 'Korean Air', ko: '대한항공', country: 'South Korea', flag: '🇰🇷', logbook: true, roster: true, photo: true },
  // 사진(승무원 앱 Monthly Schedule 스크린샷) 온디바이스 OCR — 공항 체인까지 읽는다.
  // 엑셀 내보내기는 공항이 없어 지원하지 않기로 (2026-08-13 라이언님 결정, 사진이 더 정확)
  { name: "T'way Air", ko: '티웨이항공', country: 'South Korea', flag: '🇰🇷', photo: true },
  { name: 'Thai AirAsia', ko: '타이에어아시아', country: 'Thailand', flag: '🇹🇭', roster: true }, // Lion과 같은 AIMS 양식 — Lion 파서가 읽는다
  { name: 'Thai Airways', ko: '타이항공', th: 'การบินไทย', country: 'Thailand', flag: '🇹🇭', roster: true },
  { name: 'Thai Lion Air', ko: '타이라이언에어', country: 'Thailand', flag: '🇹🇭', logbook: true, roster: true },
]

/// 항공사는 아니지만 가져오기가 되는 것 (웹 전용)
export const OTHER_FORMATS = [{ name: 'LogTen Pro', ko: 'LogTen Pro' }]

/// 환영 페이지 문구용 이름 나열 — 언어별 조인 규칙이 달라 여기서 만든다.
/// en: "A, B and C" · ko: "A · B · C" · th: "A, B และ C"
export function importFormatsSentence(lang: 'en' | 'ko' | 'th'): string {
  const names = [...AIRLINES, ...OTHER_FORMATS].map((a) =>
    lang === 'ko' ? a.ko : lang === 'th' ? (('th' in a && a.th) || a.name) : a.name
  )
  if (lang === 'ko') return names.join(' · ')
  const last = names[names.length - 1]
  const rest = names.slice(0, -1).join(', ')
  return lang === 'th' ? `${rest} และ ${last}` : `${rest} and ${last}`
}
