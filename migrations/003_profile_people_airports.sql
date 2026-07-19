-- 프로필 확장(사번·만료일·사본 이메일) + 크루 메모 + 공항 메모
-- 실행: Supabase SQL Editor에 전문 붙여넣기 → Run

alter table profiles add column if not exists employee_no text;
alter table profiles add column if not exists medical_expiry date;
alter table profiles add column if not exists english_expiry date;
alter table profiles add column if not exists recurrent_expiry date;
alter table profiles add column if not exists copy_email text;

-- 같이 비행한 사람(크루) 메모
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  employee_no text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table people enable row level security;
create policy "own people" on people
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 공항별 개인 메모
create table if not exists airport_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  ident text not null,
  notes text,
  updated_at timestamptz not null default now(),
  primary key (user_id, ident)
);
alter table airport_notes enable row level security;
create policy "own airport notes" on airport_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists people_touch on people;
create trigger people_touch before update on people
  for each row execute function touch_updated_at();
drop trigger if exists airport_notes_touch on airport_notes;
create trigger airport_notes_touch before update on airport_notes
  for each row execute function touch_updated_at();

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
