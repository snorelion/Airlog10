// 지원 항공사 명단 — **새 항공사를 지원하면 이 파일만 고친다.**
//
// 여기서 파생되는 것:
//   · 웹 환영 페이지 문구 (welcome.content.ts 의 IMPORT_FORMATS — 세 언어)
//   · iOS 앱의 "Supported airlines" 화면 (/api/import-formats 를 읽는다 —
//     앱 업데이트 없이, 서버 배포만으로 앱 명단이 늘어난다)
//
// 순서는 환영 페이지 문구의 기존 표기 순서를 유지한다 (2026-08-08 확정본).
// logbook = 회사 로그북 파일 · roster = 스케줄 PDF · photo = 인쇄물 사진(온디바이스 OCR)

export type AirlineSupport = {
  name: string // 영어 표기 — API와 앱 UI가 그대로 쓴다
  ko: string
  th?: string // 태국어 현지 표기가 따로 있는 경우만 (없으면 영어 그대로)
  logbook?: boolean
  roster?: boolean
  photo?: boolean
}

export const AIRLINES: AirlineSupport[] = [
  { name: 'Air Canada', ko: '에어캐나다', logbook: true, roster: true }, // 같은 Block Report가 로스터 겸용
  { name: 'Eastar Jet', ko: '이스타항공', roster: true },
  { name: 'Jeju Air', ko: '제주항공', roster: true, photo: true },
  { name: 'Thai AirAsia', ko: '타이에어아시아', roster: true }, // Lion과 같은 AIMS 양식 — Lion 파서가 읽는다
  { name: 'Thai Airways', ko: '타이항공', th: 'การบินไทย', roster: true },
  { name: 'Thai Lion Air', ko: '타이라이언에어', logbook: true, roster: true },
  { name: 'Korean Air', ko: '대한항공', logbook: true, photo: true },
  { name: 'Peach Aviation', ko: '피치항공', roster: true },
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
