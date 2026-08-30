-- FACILITY OPS v0.4.2 — SECURITY HARDENING
-- 선행: supabase_v0.4_upgrade.sql + supabase_v0.4.1_security_core.sql
-- 기존 role/작성자 권한 구조는 유지하고, 관리자 권한 사용 시 AAL2(TOTP)를 추가 요구합니다.
begin;

create or replace function public.facility_ops_has_admin_role()
returns boolean
language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved=true and p.role='admin');
$$;

-- 기존 관리자 RPC들이 이 함수를 사용하므로 관리자 중요 작업은 자동으로 AAL2가 필요합니다.
-- UI의 관리자/일반사용자 구분은 profiles.role을 그대로 사용하므로 역할 경계는 변하지 않습니다.
create or replace function public.facility_ops_is_admin()
returns boolean
language sql stable security definer set search_path=''
as $$
  select public.facility_ops_has_admin_role() and coalesce(auth.jwt()->>'aal','aal1')='aal2';
$$;

create or replace function public.facility_ops_can_edit()
returns boolean
language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.approved=true and
      (p.role='member' or (p.role='admin' and coalesce(auth.jwt()->>'aal','aal1')='aal2'))
  );
$$;

grant execute on function public.facility_ops_has_admin_role() to authenticated;
grant execute on function public.facility_ops_is_admin() to authenticated;
grant execute on function public.facility_ops_can_edit() to authenticated;

-- 승인 일반사용자는 기존처럼 조회 가능. 관리자 계정은 2FA 완료 후 운영 데이터를 조회합니다.
do $$
declare t text;
begin
  foreach t in array array['facilities','inspections','issues','schedules'] loop
    execute format('drop policy if exists %I on public.%I',t||'_read',t);
    execute format('create policy %I on public.%I for select to authenticated using (public.facility_ops_is_approved() and deleted_at is null and (not public.facility_ops_has_admin_role() or public.facility_ops_is_admin()))',t||'_read',t);
    execute format('drop policy if exists %I on public.%I',t||'_insert_v041',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.facility_ops_can_edit() and created_by=auth.uid() and deleted_at is null)',t||'_insert_v041',t);
    execute format('drop policy if exists %I on public.%I',t||'_update_v041',t);
    execute format('create policy %I on public.%I for update to authenticated using (public.facility_ops_can_edit() and deleted_at is null and (public.facility_ops_is_admin() or created_by=auth.uid())) with check (public.facility_ops_can_edit() and deleted_at is null and (public.facility_ops_is_admin() or created_by=auth.uid()))',t||'_update_v041',t);
  end loop;
end $$;

-- 본인 profile 조회 정책은 v0.4.1 그대로 유지됩니다. 전체 profile/audit 조회는 AAL2 관리자만.
drop policy if exists "profiles_read_admin" on public.profiles;
create policy "profiles_read_admin" on public.profiles for select to authenticated using (public.facility_ops_is_admin());
drop policy if exists "audit_logs_admin_read" on public.audit_logs;
create policy "audit_logs_admin_read" on public.audit_logs for select to authenticated using (public.facility_ops_is_admin());

create or replace function public.facility_ops_security_status()
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_role text;v_approved boolean;v_aal text:=coalesce(auth.jwt()->>'aal','aal1');
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
  select p.role,p.approved into v_role,v_approved from public.profiles p where p.id=auth.uid();
  return jsonb_build_object('user_id',auth.uid(),'role',coalesce(v_role,'unknown'),'approved',coalesce(v_approved,false),'aal',v_aal,'admin_role',coalesce(v_role='admin',false),'admin_mfa_ok',case when v_role='admin' then v_aal='aal2' else true end,'server_time',now());
end;
$$;
revoke all on function public.facility_ops_security_status() from public;
grant execute on function public.facility_ops_security_status() to authenticated;

commit;

-- Supabase Dashboard에서 별도 설정
-- 1) Authentication > MFA : TOTP 활성화
-- 2) Authentication > Bot and Abuse Protection : Turnstile CAPTCHA 활성화 + Secret Key 입력
-- 3) Authentication > Password Security : 최소 12자 및 강한 비밀번호 정책 적용
