-- 009 · 파싱 API 남용 방지 카운터 (3.0 준비 0단계, 2026-09-04)
-- 로그인 없는 3.0 앱은 StoreKit 거래 서명으로 인증한다 (lib/app-auth.ts).
-- 구독(originalTransactionId)별 하루 요청 수를 세어 한도를 넘기면 429.
-- service role만 쓴다 (RLS 켜두고 정책 없음 = 일반 키로는 접근 불가).

create table if not exists parse_quota (
  key   text not null,
  day   date not null default current_date,
  count int  not null default 0,
  primary key (key, day)
);
alter table parse_quota enable row level security;

create or replace function bump_parse_quota(p_key text, p_limit int)
returns boolean
language plpgsql
security definer
as $$
declare c int;
begin
  insert into parse_quota (key, day, count) values (p_key, current_date, 1)
  on conflict (key, day) do update set count = parse_quota.count + 1
  returning count into c;
  return c <= p_limit;
end
$$;

-- 오래된 행은 가끔 지워도 된다 (선택):
-- delete from parse_quota where day < current_date - 30;
