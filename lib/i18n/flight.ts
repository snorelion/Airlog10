import type { Dict } from './core'

type FlightStrings = {
  editTitle: string
  newTitle: string
  fillReturn: string
  draftRestored: string
  discard: string
  date: string
  flightNo: string
  flightNoHint: string
  from: string
  to: string
  reg: string
  regHint: string
  type: string
  blockTime: string
  report: string
  dutyEnd: string
  dutyTime: string
  night: string
  actualInst: string
  simulator: string
  dayTO: string
  dayLDG: string
  nightTO: string
  nightLDG: string
  autoland: string
  approaches: string
  add: string
  removeApproach: string
  crewPic: string
  crewSic: string
  remarks: string
  saving: string
  saveEdit: string
  save: string
  deleteThis: string
  deleteConfirm: string
  errDate: string
  errTime: string
}

export const flight = {
  en: {
    editTitle: 'Edit flight',
    newTitle: 'Log a flight',
    fillReturn: '↩️ Fill return leg',
    draftRestored: '✍️ Restored what you were writing (auto-saved)',
    discard: 'Discard',
    date: 'Date',
    flightNo: 'Flight no.',
    flightNoHint: '{prefix}628 · digits alone are fine',
    from: 'Departure (FROM)',
    to: 'Arrival (TO)',
    reg: 'Registration',
    regHint: '{prefix}LVL · last 3 characters are fine',
    type: 'Aircraft type',
    blockTime: 'Block time (total)',
    report: 'Report (local)',
    dutyEnd: 'Duty end',
    dutyTime: 'Duty time',
    night: 'Night',
    actualInst: 'Actual inst.',
    simulator: 'Simulator',
    // 다섯 칸이 한 줄이라 짧게 — 항공 약어 그대로가 파일럿에게 가장 잘 읽힌다
    dayTO: 'Day T/O',
    dayLDG: 'Day LDG',
    nightTO: 'Night T/O',
    nightLDG: 'Night LDG',
    autoland: 'Autoland',
    approaches: 'Approaches',
    add: 'Add',
    removeApproach: 'Remove approach',
    crewPic: 'Captain (PIC)',
    crewSic: 'First officer (SIC)',
    remarks: 'Remarks',
    saving: 'Saving…',
    saveEdit: 'Save changes',
    save: 'Save',
    deleteThis: 'Delete this entry',
    deleteConfirm: 'Delete this entry? This cannot be undone.',
    errDate: 'Please enter a date.',
    errTime: 'Enter block time (total) or simulator time. (e.g. 1:15)',
  },
  ko: {
    editTitle: '비행 수정',
    newTitle: '비행 기록',
    fillReturn: '↩️ 리턴편 채우기',
    draftRestored: '✍️ 쓰다 만 내용을 불러왔어요 (자동 임시저장)',
    discard: '비우기',
    date: '날짜',
    flightNo: '편명',
    flightNoHint: '{prefix}628 · 숫자만 쳐도 돼요',
    from: '출발 (FROM)',
    to: '도착 (TO)',
    reg: '기체 등록번호',
    regHint: '{prefix}LVL · 뒤 3글자만 쳐도 돼요',
    type: '기종',
    blockTime: '블록타임 (총시간)',
    report: '리포트 (로컬)',
    dutyEnd: '듀티 종료',
    dutyTime: '듀티 시간',
    night: '야간',
    actualInst: '실계기',
    simulator: '시뮬레이터',
    dayTO: '주간이륙',
    dayLDG: '주간착륙',
    nightTO: '야간이륙',
    nightLDG: '야간착륙',
    autoland: '오토랜드',
    approaches: '어프로치',
    add: '추가',
    removeApproach: '어프로치 삭제',
    crewPic: '기장 (PIC)',
    crewSic: '부기장 (SIC)',
    remarks: '메모',
    saving: '저장 중…',
    saveEdit: '수정 저장',
    save: '저장',
    deleteThis: '이 기록 삭제',
    deleteConfirm: '이 기록을 삭제할까요? 되돌릴 수 없어요.',
    errDate: '날짜를 입력해 주세요.',
    errTime: '블록타임(총시간) 또는 시뮬레이터 시간을 입력해 주세요. (예: 1:15)',
  },
} satisfies Dict<FlightStrings>
