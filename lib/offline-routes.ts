// 비행기모드에서 열려야 하는 화면들 — 한 곳에만 정의한다.
// 미리 받아두는 쪽(OfflineWarmup)과 상태를 보여주는 쪽(OfflineStatus)이 각자
// 목록을 들면, 하나를 고칠 때 다른 쪽을 빼먹어 "준비됐다고 나오는데 안 열리는"
// 상태가 된다.
//
// 자주 쓰는 순서 — 미리 받기가 중간에 끊겨도 중요한 것부터 남는다.
// labelKey는 설정 사전(lib/i18n/settings.ts)의 키다.
export const OFFLINE_ROUTES = [
  { path: '/', labelKey: 'scrHome' },
  { path: '/logbook', labelKey: 'scrLogbook' },
  { path: '/flights/new', labelKey: 'scrLog' },
  { path: '/stats', labelKey: 'scrStats' },
  { path: '/map', labelKey: 'scrMap' },
  { path: '/logbook/ledger', labelKey: 'scrLedger' },
  { path: '/aircraft', labelKey: 'scrAircraft' },
  { path: '/people', labelKey: 'scrCrew' },
  { path: '/settings', labelKey: 'scrSettings' },
] as const

export type OfflineRoute = (typeof OFFLINE_ROUTES)[number]
