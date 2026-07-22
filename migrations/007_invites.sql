-- 초대 코드 (메일 발송 없이 지인 초대로 가입)
-- 실행: Supabase SQL Editor에 전문 붙여넣기 → Run

create table if not exists invites (
  code text primary key,
  note text,                                  -- 누구에게 준 코드인지 메모
  max_uses int not null default 1,            -- 사용 가능 횟수
  used_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  disabled boolean not null default false
);
alter table invites enable row level security;

-- 운영자 이메일 목록 (여기 있는 계정만 초대 코드 생성·조회 가능)
create table if not exists app_admins (
  email text primary key
);
alter table app_admins enable row level security;
insert into app_admins (email) values ('snorelion@gmail.com') on conflict do nothing;

-- 현재 로그인 사용자가 운영자인지
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_admins a
    where a.email = (select email from auth.users where id = auth.uid())
  );
$$;

-- 운영자만 초대 코드 전체 관리
create policy "admin manage invites" on invites
  for all using (is_admin()) with check (is_admin());
create policy "admin read admins" on app_admins
  for select using (is_admin());

-- 가입 시 초대 코드 검증·소모 (SECURITY DEFINER — 미인증 상태에서도 호출).
-- 유효하면 used_count++ 하고 true, 아니면 false. 코드 내용은 노출하지 않는다.
create or replace function redeem_invite(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  update invites
    set used_count = used_count + 1
    where code = p_code and not disabled and used_count < max_uses;
  get diagnostics ok = row_count;
  return ok > 0;
end;
$$;
grant execute on function redeem_invite(text) to anon, authenticated;

notify pgrst, 'reload schema';
