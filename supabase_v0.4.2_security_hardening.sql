-- FACILITY OPS v0.4.2 — SECURITY HARDENING
-- 관리자 2FA(AAL2) DB 강제 / 보안 상태 점검
-- 선행: supabase_v0.4_upgrade.sql + supabase_v0.4.1_security_core.sql
-- Supabase SQL Editor에서 전체를 한 번 실행하세요.

begin;

-- 관리자 역할 자체와, 실제 2FA 인증이 끝난 관리자 세션을 구분합니다.
create or replace function public.facility_ops_has_admin_role()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.approved = true
      and p.role = 'admin'
  );
$$;

-- v0.4.2부터 facility_ops_is_admin()은 단순 role=admin이 아니라
-- 현재 JWT가 AAL2(비밀번호 + TOTP 2차 인증)인지까지 확인합니다.
create or replace function public.facility_ops_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.facility_ops_has_admin_role()
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- 일반 사용자는 승인 + member면 편집 가능.
-- 관리자는 승인 + admin + AAL2를 모두 만족해야 편집 가능합니다.
create or replace function public.facility_ops_can_edit()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.approved = true
      and (
        p.role = 'member'
        or (p.role = 'admin' and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
      )
  );
$$;

grant execute on function public.facility_ops_has_admin_role() to authenticated;
grant execute on function public.facility_ops_is_admin() to authenticated;
grant execute on function public.facility_ops_can_edit() to authenticated;

-- 관리자 계정은 AAL1 상태에서 운영 데이터 자체를 읽지 못하게 제한합니다.
-- 일반 사용자(member/viewer)는 승인 상태면 기존 권한대로 조회 가능합니다.
do $$
declare
  t text;
begin
  foreach t in array array['facilities','inspections','issues','schedules'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (' ||
      'public.facility_ops_is_approved() and deleted_at is null and ' ||
      '(not public.facility_ops_has_admin_role() or public.facility_ops_is_admin())' ||
      ')',
      t || '_read', t
    );
  end loop;
end $$;

-- 관리자 전용 profile / audit 조회 역시 AAL2가 필수입니다.
drop policy if exists "profiles_read_admin" on public.profiles;
create policy "profiles_read_admin" on public.profiles
for select to authenticated using (public.facility_ops_is_admin());

drop policy if exists "audit_logs_admin_read" on public.audit_logs;
create policy "audit_logs_admin_read" on public.audit_logs
for select to authenticated using (public.facility_ops_is_admin());

-- 현재 로그인 세션의 보안 상태를 관리자/사용자 화면에서 자체 점검할 수 있는 RPC.
create or replace function public.facility_ops_security_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_approved boolean;
  v_aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  select p.role, p.approved
    into v_role, v_approved
  from public.profiles p
  where p.id = auth.uid();

  return jsonb_build_object(
    'user_id', auth.uid(),
    'role', coalesce(v_role, 'unknown'),
    'approved', coalesce(v_approved, false),
    'aal', v_aal,
    'admin_role', coalesce(v_role = 'admin', false),
    'admin_mfa_ok', case when v_role = 'admin' then v_aal = 'aal2' else true end,
    'server_time', now()
  );
end;
$$;

revoke all on function public.facility_ops_security_status() from public;
grant execute on function public.facility_ops_security_status() to authenticated;

-- 기존 관리자 전용 RPC는 모두 facility_ops_is_admin()을 사용하므로
-- 위 함수 교체만으로 AAL2 없는 관리자 세션은 자동 차단됩니다.
-- 대상: 사용자 목록/권한변경, 휴지통 목록/복원, 백업 가져오기, 전체 삭제 등.

commit;

-- DASHBOARD에서 별도로 해야 하는 보안 설정
-- 1) Authentication > MFA에서 TOTP Verification을 활성 상태로 유지
-- 2) Authentication > Bot and Abuse Protection에서 CAPTCHA를 켜고 Turnstile Secret 입력
-- 3) Authentication > Password Security에서 최소 12자 + 대/소문자 + 숫자 + 기호 요구
--    (Leaked password protection은 Supabase Pro 이상에서만 사용 가능)
