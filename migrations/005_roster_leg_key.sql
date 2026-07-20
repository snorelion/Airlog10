-- 로스터 고유키에 출발시각 포함 — 같은 날 같은 편명 2레그도 따로 보존
-- 실행: Supabase SQL Editor에 전문 붙여넣기 → Run

alter table roster_flights
  drop constraint if exists roster_flights_user_id_flight_date_flight_number_key;
alter table roster_flights
  add constraint roster_flights_leg_key unique (user_id, flight_date, flight_number, std);

notify pgrst, 'reload schema';
