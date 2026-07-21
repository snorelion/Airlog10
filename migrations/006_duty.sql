-- 듀티 기록 (리포트~듀티종료) — 피로 관리·규정 확인용
-- 실행: Supabase SQL Editor에 전문 붙여넣기 → Run

alter table flights add column if not exists on_duty_time text;   -- 리포트 시각 "HH:MM" (로컬)
alter table flights add column if not exists off_duty_time text;  -- 듀티 종료 시각
alter table flights add column if not exists duty_min int not null default 0;

-- 로스터에도 그날 듀티 시각 (첫 비행에 프리필용)
alter table roster_flights add column if not exists report_time text;
alter table roster_flights add column if not exists duty_end_time text;

-- 남은 기종 표기 정리
update flights set aircraft_type = 'B737-900' where aircraft_type = 'B737-900ER';
update aircraft set type_code = 'B737-900' where type_code = 'B737-900ER';

notify pgrst, 'reload schema';
