-- 로스터의 "비행 없는 날" — 오프·스탠바이·SIM·지상 (2026-09-02, 앱 스케줄 달력용).
-- roster_flights(004)와 같은 패턴: RLS own-rows, user_id는 클라이언트가 명시적으로 넣는다.
-- 하루 = 최대 한 행 (겹치는 듀티는 파서가 대표 kind 하나로 요약, label에 원문).

create table if not exists roster_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_date date not null,
  kind text not null default 'off',          -- off | standby | sim | ground
  label text,                                -- 회사 코드 원문 (DO, SB1, RERP…)
  start_time text,                           -- 스탠바이·SIM 시간대 "HH:MM" (옵션)
  end_time text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day_date)
);

alter table roster_days enable row level security;
drop policy if exists "own roster days" on roster_days;
create policy "own roster days" on roster_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists roster_days_user_date on roster_days (user_id, day_date);

drop trigger if exists roster_days_touch on roster_days;
create trigger roster_days_touch before update on roster_days
  for each row execute function touch_updated_at();

notify pgrst, 'reload schema';
