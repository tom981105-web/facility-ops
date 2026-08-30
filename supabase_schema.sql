-- FACILITY OPS v0.3.0 / Supabase 초기 설정
-- Supabase Dashboard > SQL Editor에서 새 Query로 전체 실행하세요.
-- 이 SQL은 로그인한 사용자끼리 같은 시설 데이터를 공유하는 기본 정책입니다.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'member' check (role in ('admin','member','viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.facilities (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  location text not null default '',
  category text not null default '',
  status text not null default 'normal' check (status in ('normal','watch','alert','repair')),
  install_date date,
  last_inspection date,
  next_inspection date,
  vendor text not null default '',
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspections (
  id text primary key default gen_random_uuid()::text,
  facility_id text references public.facilities(id) on delete set null,
  date date not null,
  result text not null default 'normal' check (result in ('normal','watch','alert','repair')),
  inspector text not null default '',
  note text not null default '',
  next_date date,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.issues (
  id text primary key default gen_random_uuid()::text,
  facility_id text references public.facilities(id) on delete set null,
  date date not null,
  completed_date date,
  title text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  status text not null default 'open' check (status in ('open','progress','done')),
  cost numeric(14,0) not null default 0,
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedules (
  id text primary key default gen_random_uuid()::text,
  date date not null,
  type text not null default '기타',
  title text not null,
  facility_id text references public.facilities(id) on delete set null,
  status text not null default 'planned' check (status in ('planned','done')),
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.facility_ops_touch_row()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

do $$ begin
  if not exists(select 1 from pg_trigger where tgname='facilities_touch') then create trigger facilities_touch before update on public.facilities for each row execute function public.facility_ops_touch_row(); end if;
  if not exists(select 1 from pg_trigger where tgname='inspections_touch') then create trigger inspections_touch before update on public.inspections for each row execute function public.facility_ops_touch_row(); end if;
  if not exists(select 1 from pg_trigger where tgname='issues_touch') then create trigger issues_touch before update on public.issues for each row execute function public.facility_ops_touch_row(); end if;
  if not exists(select 1 from pg_trigger where tgname='schedules_touch') then create trigger schedules_touch before update on public.schedules for each row execute function public.facility_ops_touch_row(); end if;
end $$;

create or replace function public.facility_ops_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name,role)
  values(new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)), 'member')
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_facility_ops on auth.users;
create trigger on_auth_user_created_facility_ops after insert on auth.users
for each row execute function public.facility_ops_new_user();

-- 기존 Auth 사용자도 profiles에 생성
insert into public.profiles(id,display_name,role)
select id, coalesce(raw_user_meta_data->>'display_name',split_part(email,'@',1)), 'member'
from auth.users on conflict(id) do nothing;

alter table public.profiles enable row level security;
alter table public.facilities enable row level security;
alter table public.inspections enable row level security;
alter table public.issues enable row level security;
alter table public.schedules enable row level security;

-- 재실행해도 정책 중복 오류가 나지 않도록 기존 정책 정리
drop policy if exists "profiles_read_self" on public.profiles;
drop policy if exists "facilities_read" on public.facilities;
drop policy if exists "inspections_read" on public.inspections;
drop policy if exists "issues_read" on public.issues;
drop policy if exists "schedules_read" on public.schedules;
drop policy if exists "facilities_write" on public.facilities;
drop policy if exists "inspections_write" on public.inspections;
drop policy if exists "issues_write" on public.issues;
drop policy if exists "schedules_write" on public.schedules;

-- profiles: 로그인 사용자는 자기 프로필 조회, 관리자 역할은 SQL Editor에서 필요시 변경
create policy "profiles_read_self" on public.profiles for select to authenticated using (id=auth.uid());

-- 공용 시설 데이터: 로그인한 직원은 모두 조회 가능
create policy "facilities_read" on public.facilities for select to authenticated using (true);
create policy "inspections_read" on public.inspections for select to authenticated using (true);
create policy "issues_read" on public.issues for select to authenticated using (true);
create policy "schedules_read" on public.schedules for select to authenticated using (true);

-- viewer를 제외한 member/admin만 등록·수정·삭제 가능
create policy "facilities_write" on public.facilities for all to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','member')))
with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','member')));
create policy "inspections_write" on public.inspections for all to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','member')))
with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','member')));
create policy "issues_write" on public.issues for all to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','member')))
with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','member')));
create policy "schedules_write" on public.schedules for all to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','member')))
with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','member')));

-- Data API 권한
revoke all on public.profiles, public.facilities, public.inspections, public.issues, public.schedules from anon;
grant select on public.profiles to authenticated;
grant select,insert,update,delete on public.facilities, public.inspections, public.issues, public.schedules to authenticated;

-- 실시간 변경 반영 (이미 등록된 경우 오류가 날 수 있으므로 안전하게 처리)
do $$ begin
  begin alter publication supabase_realtime add table public.facilities; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.inspections; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.issues; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.schedules; exception when duplicate_object then null; end;
end $$;

-- 첫 관리자 지정 예시 (계정 만든 뒤 이메일을 바꿔서 실행)
-- update public.profiles set role='admin' where id=(select id from auth.users where email='admin@example.com');
