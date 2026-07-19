-- AirLog10 초기 스키마
-- 실행: Supabase SQL Editor에 전문 붙여넣기 → Run
-- 설계 원칙:
--   * 시간은 전부 '분(정수)' — "1:15" 형식은 앱에서 변환 (lib/time.ts)
--   * flights는 사용자 소유 (RLS), airports/runways는 전세계 공유 읽기 전용
--   * updated_at + deleted(tombstone)로 오프라인 동기화 대비

-- ─────────────────────────────────────────────
-- 1. 프로필 (파일럿 정보 — PDF 내보내기·표지에 사용)
-- ─────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  licence_no text,          -- 면장 번호
  airline text,             -- 소속 (예: Thai Lion Air)
  home_base text,           -- 주 기지 ICAO (예: VTBD)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- 가입 시 프로필 자동 생성
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────
-- 2. 내 항공기 (등록번호 → 기종 자동입력의 원천)
-- ─────────────────────────────────────────────
create table if not exists aircraft (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  registration text not null,      -- HS-LVL, HL7779 …
  type_code text,                  -- ICAO 기종 코드: B738, B739 …
  make text,                       -- Boeing
  model text,                      -- 737-800
  notes text,                      -- 기체별 특이사항 메모
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, registration)
);
alter table aircraft enable row level security;
create policy "own aircraft" on aircraft
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists aircraft_user_reg on aircraft (user_id, registration);

-- ─────────────────────────────────────────────
-- 3. 비행 기록 (핵심 테이블)
-- ─────────────────────────────────────────────
create table if not exists flights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  flight_date date not null,
  flight_number text,              -- SL501, ZE123 …
  origin text,                     -- 출발 ICAO (VTBD)
  destination text,                -- 도착 ICAO (VTSP)
  out_time text,                   -- 실제 출발시각 "HH:MM" (UTC)
  in_time text,                    -- 실제 도착시각 "HH:MM" (UTC)

  aircraft_reg text,               -- HS-LVL
  aircraft_type text,              -- B738

  -- 시간 (전부 분 단위 정수)
  total_min int not null default 0,
  pic_min int not null default 0,
  sic_min int not null default 0,
  picus_min int not null default 0,      -- P1 U/S (PICUS)
  night_min int not null default 0,
  inst_actual_min int not null default 0, -- 실계기
  inst_sim_min int not null default 0,    -- 모의계기(후드)
  xc_min int not null default 0,          -- cross country
  multi_pilot_min int not null default 0,
  dual_received_min int not null default 0,
  dual_given_min int not null default 0,
  sim_min int not null default 0,         -- 시뮬레이터

  -- 이착륙·접근
  day_takeoffs int not null default 0,
  day_landings int not null default 0,
  night_takeoffs int not null default 0,
  night_landings int not null default 0,
  autolands int not null default 0,
  go_arounds int not null default 0,
  holds int not null default 0,
  approaches text[],               -- ["ILS 21L", "RNP 03R"] …

  -- 역할·크루
  capacity text,                   -- PIC | SIC | PICUS | STUDENT | INSTRUCTOR
  is_pf boolean,                   -- Pilot Flying 여부
  crew_pic text,
  crew_sic text,
  crew_other text,                 -- student/observer/relief 등 묶음

  pax_count int,
  distance_nm int,
  remarks text,

  source text not null default 'manual',  -- manual | logten | csv
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false   -- 오프라인 동기화용 tombstone
);
alter table flights enable row level security;
create policy "own flights" on flights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists flights_user_date on flights (user_id, flight_date desc);
create index if not exists flights_user_updated on flights (user_id, updated_at desc);

-- ─────────────────────────────────────────────
-- 4. 전세계 공항 · 활주로 (OurAirports 오픈데이터, 공유 읽기 전용)
-- ─────────────────────────────────────────────
create table if not exists airports (
  ident text primary key,          -- ICAO/로컬 식별자 (VTBD, RKSS …)
  iata text,                       -- DMK, GMP …
  name text,
  type text,                       -- large_airport | medium_airport | small_airport …
  lat double precision,
  lon double precision,
  elevation_ft int,
  country text,                    -- ISO 코드 (TH, KR …)
  municipality text                -- Bangkok, Seoul …
);
alter table airports enable row level security;
create policy "airports read" on airports for select using (auth.role() = 'authenticated');
-- 쓰기는 service role만 (시딩 라우트)
create index if not exists airports_iata on airports (iata);

create table if not exists runways (
  id bigint primary key,           -- OurAirports id 그대로
  airport_ident text not null,
  length_ft int,
  width_ft int,
  surface text,
  lighted boolean,
  closed boolean,
  le_ident text,                   -- 03L
  le_heading double precision,
  he_ident text,                   -- 21R
  he_heading double precision
);
alter table runways enable row level security;
create policy "runways read" on runways for select using (auth.role() = 'authenticated');
create index if not exists runways_airport on runways (airport_ident);

-- ─────────────────────────────────────────────
-- 5. 통계 RPC — 집계는 DB에서 (Supabase select 1,000행 한도 회피)
-- ─────────────────────────────────────────────
create or replace function my_totals()
returns json language sql stable as $$
  select json_build_object(
    'flights', count(*),
    'total_min', coalesce(sum(total_min), 0),
    'pic_min', coalesce(sum(pic_min), 0),
    'sic_min', coalesce(sum(sic_min), 0),
    'picus_min', coalesce(sum(picus_min), 0),
    'night_min', coalesce(sum(night_min), 0),
    'inst_min', coalesce(sum(inst_actual_min), 0),
    'landings', coalesce(sum(day_landings + night_landings), 0),
    'first_date', min(flight_date),
    'last_date', max(flight_date)
  ) from flights where user_id = auth.uid() and not deleted;
$$;

create or replace function my_stats()
returns json language sql stable as $$
  select json_build_object(
    'yearly', (
      select coalesce(json_agg(t order by t.yr), '[]'::json) from (
        select extract(year from flight_date)::int as yr,
               count(*) as flights, sum(total_min) as total_min, sum(night_min) as night_min
        from flights where user_id = auth.uid() and not deleted
        group by 1
      ) t
    ),
    'by_type', (
      select coalesce(json_agg(t order by t.total_min desc), '[]'::json) from (
        select coalesce(aircraft_type, '기타') as type,
               count(*) as flights, sum(total_min) as total_min
        from flights where user_id = auth.uid() and not deleted
        group by 1
      ) t
    ),
    'top_airports', (
      select coalesce(json_agg(t order by t.visits desc), '[]'::json) from (
        select u.ident, count(*) as visits from (
          select origin as ident from flights
            where user_id = auth.uid() and not deleted and origin is not null
          union all
          select destination from flights
            where user_id = auth.uid() and not deleted and destination is not null
        ) u group by 1 order by count(*) desc limit 15
      ) t
    )
  );
$$;

-- ─────────────────────────────────────────────
-- 6. updated_at 자동 갱신
-- ─────────────────────────────────────────────
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists flights_touch on flights;
create trigger flights_touch before update on flights
  for each row execute function touch_updated_at();
drop trigger if exists aircraft_touch on aircraft;
create trigger aircraft_touch before update on aircraft
  for each row execute function touch_updated_at();
drop trigger if exists profiles_touch on profiles;
create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();
