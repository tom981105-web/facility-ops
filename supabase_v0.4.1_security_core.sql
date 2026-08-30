-- FACILITY OPS v0.4.1 — SECURITY CORE
-- 승인 계정 전용 DB 접근 / 작성 메타데이터 보호 / 본인·관리자 수정삭제 / 관리자 백업 복원 RPC
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행하세요.

begin;

-- -----------------------------------------------------------------------------
-- 1. 승인 계정 게이트
--    기존 계정은 마이그레이션 시 승인 처리하고, 이후 새 계정은 기본 미승인입니다.
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists approved boolean;
update public.profiles set approved = true where approved is null;
alter table public.profiles alter column approved set default false;
alter table public.profiles alter column approved set not null;

-- 운영 관리자 계정은 항상 승인 상태 유지
update public.profiles p
set approved = true, role = 'admin', updated_at = now()
where p.id in (
  select u.id from auth.users u where lower(u.email) = 'admin@facility.local'
);

create or replace function public.facility_ops_is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.approved = true
  );
$$;

create or replace function public.facility_ops_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.approved = true and p.role = 'admin'
  );
$$;

create or replace function public.facility_ops_can_edit()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.approved = true
      and p.role in ('admin','member')
  );
$$;

grant execute on function public.facility_ops_is_approved() to authenticated;
grant execute on function public.facility_ops_is_admin() to authenticated;
grant execute on function public.facility_ops_can_edit() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. created_by / created_at 위조 차단
--    INSERT는 DB가 현재 로그인 사용자/서버 시간을 강제로 기록합니다.
--    UPDATE는 최초 작성자/작성시각을 원본 그대로 보존합니다.
-- -----------------------------------------------------------------------------
create or replace function public.facility_ops_secure_row_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_by := auth.uid();
    new.updated_at := now();
    new.deleted_at := null;
    new.deleted_by := null;
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;

  return new;
end;
$$;

-- 기존 단순 touch 트리거를 제거하고 보안 메타데이터 트리거로 교체
drop trigger if exists facilities_touch on public.facilities;
drop trigger if exists inspections_touch on public.inspections;
drop trigger if exists issues_touch on public.issues;
drop trigger if exists schedules_touch on public.schedules;

drop trigger if exists facilities_security_v041 on public.facilities;
create trigger facilities_security_v041
before insert or update on public.facilities
for each row execute function public.facility_ops_secure_row_metadata();

drop trigger if exists inspections_security_v041 on public.inspections;
create trigger inspections_security_v041
before insert or update on public.inspections
for each row execute function public.facility_ops_secure_row_metadata();

drop trigger if exists issues_security_v041 on public.issues;
create trigger issues_security_v041
before insert or update on public.issues
for each row execute function public.facility_ops_secure_row_metadata();

drop trigger if exists schedules_security_v041 on public.schedules;
create trigger schedules_security_v041
before insert or update on public.schedules
for each row execute function public.facility_ops_secure_row_metadata();

-- -----------------------------------------------------------------------------
-- 3. 관리자 삭제 시 '항목을 찾을 수 없습니다' 오류 수정
--    동적 EXECUTE + FOUND 의존을 제거하고 정적 SELECT/UPDATE로 처리합니다.
-- -----------------------------------------------------------------------------
create or replace function public.facility_ops_soft_delete(p_table text, p_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_deleted_at timestamptz;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if not public.facility_ops_is_approved() then
    raise exception '승인되지 않은 계정입니다.' using errcode = '42501';
  end if;

  case p_table
    when 'facilities' then
      select f.created_by, f.deleted_at into v_owner, v_deleted_at
      from public.facilities f where f.id = p_id;
    when 'inspections' then
      select i.created_by, i.deleted_at into v_owner, v_deleted_at
      from public.inspections i where i.id = p_id;
    when 'issues' then
      select q.created_by, q.deleted_at into v_owner, v_deleted_at
      from public.issues q where q.id = p_id;
    when 'schedules' then
      select s.created_by, s.deleted_at into v_owner, v_deleted_at
      from public.schedules s where s.id = p_id;
    else
      raise exception '허용되지 않은 데이터 종류입니다.';
  end case;

  if not found then
    raise exception '항목을 찾을 수 없습니다.';
  end if;

  if v_deleted_at is not null then
    return;
  end if;

  if not public.facility_ops_is_admin() and v_owner is distinct from v_uid then
    raise exception '본인이 등록한 항목만 삭제할 수 있습니다.' using errcode = '42501';
  end if;

  case p_table
    when 'facilities' then
      update public.facilities set deleted_at = now(), deleted_by = v_uid where id = p_id;
    when 'inspections' then
      update public.inspections set deleted_at = now(), deleted_by = v_uid where id = p_id;
    when 'issues' then
      update public.issues set deleted_at = now(), deleted_by = v_uid where id = p_id;
    when 'schedules' then
      update public.schedules set deleted_at = now(), deleted_by = v_uid where id = p_id;
  end case;
end;
$$;

grant execute on function public.facility_ops_soft_delete(text,text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. 사용자 승인 상태를 포함한 관리자 사용자 관리 RPC
-- -----------------------------------------------------------------------------
create or replace function public.facility_ops_admin_list_users_v041()
returns table (
  id uuid,
  login_id text,
  display_name text,
  role text,
  approved boolean,
  last_seen timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.facility_ops_is_admin() then
    raise exception '관리자만 사용자 목록을 볼 수 있습니다.' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    split_part(coalesce(u.email,''), '@', 1) as login_id,
    coalesce(p.display_name, split_part(coalesce(u.email,''), '@', 1)) as display_name,
    coalesce(p.role, 'member') as role,
    coalesce(p.approved, false) as approved,
    p.last_seen,
    u.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by coalesce(p.display_name, split_part(coalesce(u.email,''), '@', 1));
end;
$$;

grant execute on function public.facility_ops_admin_list_users_v041() to authenticated;

create or replace function public.facility_ops_admin_update_profile_v041(
  p_user_id uuid,
  p_display_name text,
  p_role text,
  p_approved boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
begin
  if not public.facility_ops_is_admin() then
    raise exception '관리자만 사용자 정보를 변경할 수 있습니다.' using errcode = '42501';
  end if;

  if p_role not in ('admin','member','viewer') then
    raise exception '올바르지 않은 권한입니다.';
  end if;

  if p_user_id = auth.uid() and (p_role <> 'admin' or coalesce(p_approved,false) = false) then
    raise exception '현재 관리자 자신의 관리자 권한/승인 상태는 해제할 수 없습니다.';
  end if;

  update public.profiles
  set display_name = nullif(trim(p_display_name), ''),
      role = p_role,
      approved = coalesce(p_approved,false),
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception '사용자 프로필을 찾을 수 없습니다.';
  end if;

  select coalesce(display_name, '관리자') into v_actor_name
  from public.profiles where id = auth.uid();

  insert into public.audit_logs(table_name, record_id, action, actor_id, actor_name, details)
  values(
    'profiles', p_user_id::text, 'profile_update', auth.uid(), coalesce(v_actor_name,'관리자'),
    jsonb_build_object('display_name', p_display_name, 'role', p_role, 'approved', p_approved)
  );
end;
$$;

grant execute on function public.facility_ops_admin_update_profile_v041(uuid,text,text,boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. 백업 가져오기 전용 관리자 RPC
--    브라우저에서 직접 테이블 upsert 하는 대신 이 RPC를 사용합니다.
--    메타데이터(created_by/created_at)는 위 보안 트리거가 서버에서 결정합니다.
-- -----------------------------------------------------------------------------
create or replace function public.facility_ops_admin_import_backup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_facilities integer := 0;
  v_inspections integer := 0;
  v_issues integer := 0;
  v_schedules integer := 0;
begin
  if not public.facility_ops_is_admin() then
    raise exception '관리자만 백업 데이터를 가져올 수 있습니다.' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_payload,'{}'::jsonb)) <> 'object' then
    raise exception '올바르지 않은 백업 데이터입니다.';
  end if;

  insert into public.facilities(id,name,location,category,status,install_date,last_inspection,next_inspection,vendor,note)
  select r.id, r.name, coalesce(r.location,''), coalesce(r.category,''), coalesce(r.status,'normal'),
         r.install_date, r.last_inspection, r.next_inspection, coalesce(r.vendor,''), coalesce(r.note,'')
  from jsonb_populate_recordset(null::public.facilities, coalesce(p_payload->'facilities','[]'::jsonb)) r
  where r.id is not null and r.name is not null
  on conflict (id) do update set
    name=excluded.name, location=excluded.location, category=excluded.category, status=excluded.status,
    install_date=excluded.install_date, last_inspection=excluded.last_inspection,
    next_inspection=excluded.next_inspection, vendor=excluded.vendor, note=excluded.note,
    deleted_at=null, deleted_by=null;
  get diagnostics v_facilities = row_count;

  insert into public.inspections(id,facility_id,date,result,inspector,note,next_date)
  select r.id, r.facility_id, r.date, coalesce(r.result,'normal'), coalesce(r.inspector,''), coalesce(r.note,''), r.next_date
  from jsonb_populate_recordset(null::public.inspections, coalesce(p_payload->'inspections','[]'::jsonb)) r
  where r.id is not null and r.date is not null
  on conflict (id) do update set
    facility_id=excluded.facility_id, date=excluded.date, result=excluded.result,
    inspector=excluded.inspector, note=excluded.note, next_date=excluded.next_date,
    deleted_at=null, deleted_by=null;
  get diagnostics v_inspections = row_count;

  insert into public.issues(id,facility_id,date,completed_date,title,severity,status,cost,note)
  select r.id, r.facility_id, r.date, r.completed_date, r.title,
         coalesce(r.severity,'medium'), coalesce(r.status,'open'), coalesce(r.cost,0), coalesce(r.note,'')
  from jsonb_populate_recordset(null::public.issues, coalesce(p_payload->'issues','[]'::jsonb)) r
  where r.id is not null and r.date is not null and r.title is not null
  on conflict (id) do update set
    facility_id=excluded.facility_id, date=excluded.date, completed_date=excluded.completed_date,
    title=excluded.title, severity=excluded.severity, status=excluded.status,
    cost=excluded.cost, note=excluded.note, deleted_at=null, deleted_by=null;
  get diagnostics v_issues = row_count;

  insert into public.schedules(id,date,type,title,facility_id,status,note)
  select r.id, r.date, coalesce(r.type,'기타'), r.title, r.facility_id,
         coalesce(r.status,'planned'), coalesce(r.note,'')
  from jsonb_populate_recordset(null::public.schedules, coalesce(p_payload->'schedules','[]'::jsonb)) r
  where r.id is not null and r.date is not null and r.title is not null
  on conflict (id) do update set
    date=excluded.date, type=excluded.type, title=excluded.title,
    facility_id=excluded.facility_id, status=excluded.status, note=excluded.note,
    deleted_at=null, deleted_by=null;
  get diagnostics v_schedules = row_count;

  return jsonb_build_object(
    'facilities', v_facilities,
    'inspections', v_inspections,
    'issues', v_issues,
    'schedules', v_schedules
  );
end;
$$;

revoke all on function public.facility_ops_admin_import_backup(jsonb) from public;
grant execute on function public.facility_ops_admin_import_backup(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. RLS SECURITY CORE
--    조회: 승인 계정만
--    등록: 승인된 member/admin만
--    수정: 관리자 또는 최초 작성자 본인만
--    실제 DELETE: 금지 (휴지통 RPC만)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['facilities','inspections','issues','schedules'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_v04', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_v04', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_v041', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_v041', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.facility_ops_is_approved() and deleted_at is null)',
      t || '_read', t
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.facility_ops_can_edit() and created_by = auth.uid() and deleted_at is null)',
      t || '_insert_v041', t
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (public.facility_ops_can_edit() and deleted_at is null and (public.facility_ops_is_admin() or created_by = auth.uid())) with check (public.facility_ops_can_edit() and deleted_at is null and (public.facility_ops_is_admin() or created_by = auth.uid()))',
      t || '_update_v041', t
    );
  end loop;
end $$;

-- profiles: 본인은 자신의 승인 상태까지 확인 가능, 관리자는 전체 조회
alter table public.profiles enable row level security;
drop policy if exists "profiles_read_self" on public.profiles;
drop policy if exists "profiles_read_admin" on public.profiles;
create policy "profiles_read_self" on public.profiles
for select to authenticated using (id = auth.uid());
create policy "profiles_read_admin" on public.profiles
for select to authenticated using (public.facility_ops_is_admin());

-- audit log는 승인된 관리자만 조회
drop policy if exists "audit_logs_admin_read" on public.audit_logs;
create policy "audit_logs_admin_read" on public.audit_logs
for select to authenticated using (public.facility_ops_is_admin());

-- anon은 운영 데이터 접근 금지
revoke all on public.facilities, public.inspections, public.issues, public.schedules, public.profiles, public.audit_logs from anon;

-- hard delete는 계속 금지
revoke delete on public.facilities, public.inspections, public.issues, public.schedules from authenticated;

-- 필요한 기본 권한
grant select, insert, update on public.facilities, public.inspections, public.issues, public.schedules to authenticated;
grant select on public.profiles to authenticated;
grant select on public.audit_logs to authenticated;

commit;

-- IMPORTANT
-- Supabase Authentication의 Email Provider 설정에서 "Allow new users to sign up"도 OFF로 설정하세요.
-- 이 SQL만으로도 미승인 계정은 DB를 전혀 읽거나 수정할 수 없지만,
-- Auth 사용자 생성 자체까지 차단하려면 위 Dashboard 설정을 함께 꺼야 합니다.
