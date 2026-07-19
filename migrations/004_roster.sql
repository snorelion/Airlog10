-- 로스터(예정 비행) — PDF에서 읽어온 한 달 스케줄 보관
-- 실행: Supabase SQL Editor에 전문 붙여넣기 → Run

create table if not exists roster_flights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  flight_date date not null,
  flight_number text,
  origin text,
  destination text,
  std text,              -- 예정 출발 "HH:MM" (로컬)
  sta text,              -- 예정 도착
  aircraft_type text,
  status text not null default 'planned',   -- planned | logged
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, flight_date, flight_number)
);
alter table roster_flights enable row level security;
drop policy if exists "own roster" on roster_flights;
create policy "own roster" on roster_flights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists roster_user_date on roster_flights (user_id, flight_date);

drop trigger if exists roster_touch on roster_flights;
create trigger roster_touch before update on roster_flights
  for each row execute function touch_updated_at();

notify pgrst, 'reload schema';
