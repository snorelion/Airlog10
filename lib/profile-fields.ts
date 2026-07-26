// 설정(로컬 meta의 setting:*) ↔ profiles 컬럼 매핑.
//
// 한 곳에만 정의한다. 설정 화면과 동기화(sync)가 각자 목록을 들고 있으면,
// 나중에 항목을 추가할 때 한쪽만 고쳐서 "설정엔 있는데 새 폰엔 안 따라오는"
// 조용한 버그가 생긴다.
export const PROFILE_FIELDS = [
  ['pilotName', 'name'],
  ['defaultCapacity', 'default_capacity'],
  ['airline', 'airline'],
  ['homeBase', 'home_base'],
  ['employeeNo', 'employee_no'],
  ['licenceNo', 'licence_no'],
  ['copyEmail', 'copy_email'],
  ['medicalExpiry', 'medical_expiry'],
  ['englishExpiry', 'english_expiry'],
  ['recurrentExpiry', 'recurrent_expiry'],
] as const
