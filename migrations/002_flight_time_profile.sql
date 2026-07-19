-- Flight Time(이륙~착륙) 기록 + 프로필 기본 역할
-- 실행: Supabase SQL Editor에 전문 붙여넣기 → Run

alter table flights add column if not exists takeoff_time text;   -- "HH:MM" UTC
alter table flights add column if not exists landing_time text;   -- "HH:MM" UTC
alter table flights add column if not exists flight_min int not null default 0;  -- airborne 분

alter table profiles add column if not exists default_capacity text;  -- PIC | SIC | PICUS

-- PostgREST 스키마 캐시 갱신 (새 컬럼 인식)
notify pgrst, 'reload schema';
