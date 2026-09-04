-- Solar Asset Care: three-role access model.
-- Business roles are intentionally limited to administrator (owner), expert,
-- and requester (client). All timestamps remain absolute timestamptz values.

alter table public.organizations
  add column is_primary_operator boolean not null default false;

create unique index organizations_one_primary_operator_idx
  on public.organizations (is_primary_operator)
  where is_primary_operator;

alter table public.organization_members
  drop constraint organization_members_role_check;

alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('owner', 'expert', 'client'));

create table public.plant_requesters (
  plant_id uuid not null references public.plants(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (plant_id, requester_user_id)
);

create index plant_requesters_user_plant_idx
  on public.plant_requesters (requester_user_id, plant_id);

alter table public.plant_requesters enable row level security;

create or replace function private.is_plant_requester(
  p_plant_id uuid,
  p_user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plant_requesters access
    where access.plant_id = p_plant_id
      and access.requester_user_id = coalesce(p_user_id, (select auth.uid()))
  );
$$;

create or replace function private.can_view_plant(p_plant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plants plant
    join public.organization_members membership
      on membership.organization_id = plant.organization_id
     and membership.user_id = (select auth.uid())
     and membership.status = 'active'
    where plant.id = p_plant_id
      and (
        membership.role = 'owner'
        or (
          membership.role = 'client'
          and exists (
            select 1
            from public.plant_requesters access
            where access.plant_id = plant.id
              and access.requester_user_id = membership.user_id
          )
        )
        or (
          membership.role = 'expert'
          and exists (
            select 1
            from public.inspections inspection
            where inspection.plant_id = plant.id
              and inspection.assigned_expert_user_id = membership.user_id
          )
        )
      )
  );
$$;

create or replace function private.can_work_inspection(p_inspection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.inspections inspection
    join public.organization_members membership
      on membership.organization_id = inspection.organization_id
     and membership.user_id = (select auth.uid())
     and membership.status = 'active'
    where inspection.id = p_inspection_id
      and (
        membership.role = 'owner'
        or (
          membership.role = 'expert'
          and inspection.assigned_expert_user_id = membership.user_id
        )
      )
  );
$$;

create or replace function private.can_view_inspection(p_inspection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.inspections inspection
    join public.organization_members membership
      on membership.organization_id = inspection.organization_id
     and membership.user_id = (select auth.uid())
     and membership.status = 'active'
    where inspection.id = p_inspection_id
      and (
        membership.role = 'owner'
        or (
          membership.role = 'expert'
          and inspection.assigned_expert_user_id = membership.user_id
        )
        or (
          membership.role = 'client'
          and exists (
            select 1
            from public.plant_requesters access
            where access.plant_id = inspection.plant_id
              and access.requester_user_id = membership.user_id
          )
        )
      )
  );
$$;

create or replace function private.can_view_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) = p_user_id
    or exists (
      select 1
      from public.organization_members administrator
      join public.organization_members target
        on target.organization_id = administrator.organization_id
       and target.user_id = p_user_id
      where administrator.user_id = (select auth.uid())
        and administrator.role = 'owner'
        and administrator.status = 'active'
    );
$$;

create or replace function private.can_view_finding(p_finding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.findings finding
    join public.inspections inspection on inspection.id = finding.inspection_id
    join public.organization_members membership
      on membership.organization_id = finding.organization_id
     and membership.user_id = (select auth.uid())
     and membership.status = 'active'
    where finding.id = p_finding_id
      and (
        membership.role = 'owner'
        or (
          membership.role = 'expert'
          and inspection.assigned_expert_user_id = membership.user_id
        )
        or (
          membership.role = 'client'
          and finding.disposition in ('accepted', 'modified')
          and exists (
            select 1
            from public.plant_requesters access
            where access.plant_id = inspection.plant_id
              and access.requester_user_id = membership.user_id
          )
          and exists (
            select 1
            from public.reports report
            where report.inspection_id = inspection.id
              and report.status = 'published'
          )
        )
      )
  );
$$;

create or replace function private.can_view_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.reports report
    join public.inspections inspection on inspection.id = report.inspection_id
    join public.organization_members membership
      on membership.organization_id = report.organization_id
     and membership.user_id = (select auth.uid())
     and membership.status = 'active'
    where report.id = p_report_id
      and (
        membership.role = 'owner'
        or (
          membership.role = 'expert'
          and inspection.assigned_expert_user_id = membership.user_id
        )
        or (
          membership.role = 'client'
          and report.status = 'published'
          and exists (
            select 1
            from public.plant_requesters access
            where access.plant_id = inspection.plant_id
              and access.requester_user_id = membership.user_id
          )
        )
      )
  );
$$;

create or replace function private.storage_inspection_access(
  p_object_name text,
  p_allow_requester boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parsed_organization_id uuid;
  parsed_inspection_id uuid;
  inspection_row public.inspections%rowtype;
begin
  if split_part(p_object_name, '/', 1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or split_part(p_object_name, '/', 2) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  parsed_organization_id := split_part(p_object_name, '/', 1)::uuid;
  parsed_inspection_id := split_part(p_object_name, '/', 2)::uuid;

  select * into inspection_row
  from public.inspections
  where id = parsed_inspection_id
    and organization_id = parsed_organization_id;

  if not found then
    return false;
  end if;

  if private.can_work_inspection(parsed_inspection_id) then
    return true;
  end if;

  return p_allow_requester
    and private.can_view_inspection(parsed_inspection_id)
    and exists (
      select 1
      from public.reports report
      where report.inspection_id = parsed_inspection_id
        and report.status = 'published'
    );
end;
$$;

revoke all on function private.is_plant_requester(uuid, uuid) from public, anon;
revoke all on function private.can_view_plant(uuid) from public, anon;
revoke all on function private.can_work_inspection(uuid) from public, anon;
revoke all on function private.can_view_inspection(uuid) from public, anon;
revoke all on function private.can_view_profile(uuid) from public, anon;
revoke all on function private.can_view_finding(uuid) from public, anon;
revoke all on function private.can_view_report(uuid) from public, anon;
revoke all on function private.storage_inspection_access(text, boolean) from public, anon;
grant execute on function private.is_plant_requester(uuid, uuid) to authenticated;
grant execute on function private.can_view_plant(uuid) to authenticated;
grant execute on function private.can_work_inspection(uuid) to authenticated;
grant execute on function private.can_view_inspection(uuid) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;
grant execute on function private.can_view_finding(uuid) to authenticated;
grant execute on function private.can_view_report(uuid) to authenticated;
grant execute on function private.storage_inspection_access(text, boolean) to authenticated;

-- Replace the broad organization-level policies with role- and assignment-aware policies.
drop policy if exists profiles_select_shared_org on public.profiles;
drop policy if exists organization_members_select_member on public.organization_members;
drop policy if exists organization_members_insert_owner on public.organization_members;
drop policy if exists organization_members_update_owner on public.organization_members;
drop policy if exists organization_members_delete_owner on public.organization_members;
drop policy if exists plants_select_member on public.plants;
drop policy if exists plants_insert_operator on public.plants;
drop policy if exists plants_update_operator on public.plants;
drop policy if exists plants_delete_operator on public.plants;
drop policy if exists inspections_select_member on public.inspections;
drop policy if exists inspections_insert_staff on public.inspections;
drop policy if exists inspections_update_staff on public.inspections;
drop policy if exists inspections_delete_staff on public.inspections;
drop policy if exists inspection_files_select_staff on public.inspection_files;
drop policy if exists inspection_files_insert_staff on public.inspection_files;
drop policy if exists inspection_files_update_staff on public.inspection_files;
drop policy if exists inspection_files_delete_staff on public.inspection_files;
drop policy if exists analysis_runs_select_staff on public.analysis_runs;
drop policy if exists analysis_runs_insert_staff on public.analysis_runs;
drop policy if exists analysis_runs_update_staff on public.analysis_runs;
drop policy if exists analysis_runs_delete_staff on public.analysis_runs;
drop policy if exists findings_select_member on public.findings;
drop policy if exists findings_insert_expert on public.findings;
drop policy if exists findings_update_expert on public.findings;
drop policy if exists findings_delete_expert on public.findings;
drop policy if exists reports_select_member on public.reports;
drop policy if exists reports_insert_staff on public.reports;
drop policy if exists reports_update_staff on public.reports;
drop policy if exists reports_delete_staff on public.reports;
drop policy if exists maintenance_select_member on public.maintenance_requests;
drop policy if exists maintenance_insert_staff on public.maintenance_requests;
drop policy if exists maintenance_update_staff on public.maintenance_requests;
drop policy if exists maintenance_delete_staff on public.maintenance_requests;
drop policy if exists audit_events_select_auditor on public.audit_events;

create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using ((select private.can_view_profile(user_id)));

create policy organization_members_select_self_or_admin on public.organization_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.has_org_role(organization_id, array['owner']))
  );

create policy plants_select_authorized on public.plants
  for select to authenticated
  using ((select private.can_view_plant(id)));
create policy plants_insert_admin on public.plants
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner'])));
create policy plants_update_admin on public.plants
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])))
  with check ((select private.has_org_role(organization_id, array['owner'])));
create policy plants_delete_admin on public.plants
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])));

create policy plant_requesters_select_self_or_admin on public.plant_requesters
  for select to authenticated
  using (
    requester_user_id = (select auth.uid())
    or exists (
      select 1
      from public.plants plant
      where plant.id = plant_id
        and (select private.has_org_role(plant.organization_id, array['owner']))
    )
  );
create policy plant_requesters_insert_admin on public.plant_requesters
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.plants plant
      where plant.id = plant_id
        and (select private.has_org_role(plant.organization_id, array['owner']))
    )
  );
create policy plant_requesters_delete_admin on public.plant_requesters
  for delete to authenticated
  using (
    exists (
      select 1
      from public.plants plant
      where plant.id = plant_id
        and (select private.has_org_role(plant.organization_id, array['owner']))
    )
  );

create policy inspections_select_authorized on public.inspections
  for select to authenticated
  using ((select private.can_view_inspection(id)));
create policy inspections_insert_admin on public.inspections
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner'])));
create policy inspections_update_admin_or_assigned_expert on public.inspections
  for update to authenticated
  using ((select private.can_work_inspection(id)))
  with check ((select private.can_work_inspection(id)));
create policy inspections_delete_admin on public.inspections
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])));

create policy inspection_files_select_workers on public.inspection_files
  for select to authenticated
  using ((select private.can_work_inspection(inspection_id)));
create policy inspection_files_insert_workers on public.inspection_files
  for insert to authenticated
  with check ((select private.can_work_inspection(inspection_id)));
create policy inspection_files_update_workers on public.inspection_files
  for update to authenticated
  using ((select private.can_work_inspection(inspection_id)))
  with check ((select private.can_work_inspection(inspection_id)));
create policy inspection_files_delete_admin on public.inspection_files
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])));

create policy analysis_runs_select_workers on public.analysis_runs
  for select to authenticated
  using ((select private.can_work_inspection(inspection_id)));
create policy analysis_runs_insert_workers on public.analysis_runs
  for insert to authenticated
  with check ((select private.can_work_inspection(inspection_id)));
create policy analysis_runs_update_workers on public.analysis_runs
  for update to authenticated
  using ((select private.can_work_inspection(inspection_id)))
  with check ((select private.can_work_inspection(inspection_id)));
create policy analysis_runs_delete_admin on public.analysis_runs
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])));

create policy findings_select_authorized on public.findings
  for select to authenticated
  using ((select private.can_view_finding(id)));
create policy findings_insert_workers on public.findings
  for insert to authenticated
  with check ((select private.can_work_inspection(inspection_id)));
create policy findings_update_workers on public.findings
  for update to authenticated
  using ((select private.can_work_inspection(inspection_id)))
  with check ((select private.can_work_inspection(inspection_id)));
create policy findings_delete_admin on public.findings
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])));

create policy reports_select_authorized on public.reports
  for select to authenticated
  using ((select private.can_view_report(id)));
create policy reports_insert_workers on public.reports
  for insert to authenticated
  with check ((select private.can_work_inspection(inspection_id)));
create policy reports_update_workers on public.reports
  for update to authenticated
  using ((select private.can_work_inspection(inspection_id)))
  with check ((select private.can_work_inspection(inspection_id)));
create policy reports_delete_admin on public.reports
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])));

create policy maintenance_select_authorized on public.maintenance_requests
  for select to authenticated
  using ((select private.can_view_inspection(inspection_id)));
create policy maintenance_insert_admin on public.maintenance_requests
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner'])));
create policy maintenance_update_admin on public.maintenance_requests
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])))
  with check ((select private.has_org_role(organization_id, array['owner'])));
create policy maintenance_delete_admin on public.maintenance_requests
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])));

create policy audit_events_select_admin on public.audit_events
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])));

grant select on table public.plant_requesters to authenticated;
grant insert, delete on table public.plant_requesters to authenticated;
revoke all on table public.plant_requesters from anon;

-- Member changes go through an audited RPC. The table is read-only to clients.
revoke insert, update, delete on table public.organization_members from authenticated;

create or replace function private.register_requester()
returns table (organization_id uuid, organization_name text, member_role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  operator_row public.organizations%rowtype;
  existing_member public.organization_members%rowtype;
begin
  if actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not exists (
    select 1 from auth.users
    where id = actor_id
      and email_confirmed_at is not null
      and deleted_at is null
  ) then
    raise exception '이메일 인증을 먼저 완료해 주세요.';
  end if;

  select * into operator_row
  from public.organizations
  where is_primary_operator
  limit 1;

  if not found then
    raise exception '서비스 관리자 작업공간이 아직 준비되지 않았습니다.';
  end if;

  select * into existing_member
  from public.organization_members
  where user_id = actor_id
  limit 1;

  if found and (
    existing_member.organization_id <> operator_row.id
    or existing_member.role <> 'client'
  ) then
    raise exception '이미 관리자 초대 또는 다른 역할이 연결된 계정입니다.';
  end if;

  insert into public.organization_members (
    organization_id, user_id, role, status, joined_at
  ) values (
    operator_row.id, actor_id, 'client', 'active', now()
  )
  on conflict (organization_id, user_id)
  do update set
    role = 'client',
    status = 'active',
    joined_at = coalesce(public.organization_members.joined_at, now());

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id
  ) values (
    operator_row.id, actor_id, 'requester.registered', 'organization_member', actor_id::text
  );

  return query select operator_row.id, operator_row.name, 'client'::text;
end;
$$;

create or replace function private.create_requester_plant(
  p_name text,
  p_address text,
  p_capacity_kw numeric,
  p_commissioned_on date
)
returns public.plants
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  member_row public.organization_members%rowtype;
  created_plant public.plants%rowtype;
  normalized_name text := trim(p_name);
begin
  select * into member_row
  from public.organization_members
  where user_id = actor_id
    and role = 'client'
    and status = 'active'
  limit 1;

  if not found then
    raise exception '의뢰인 권한이 필요합니다.';
  end if;
  if normalized_name = '' or length(normalized_name) > 160 then
    raise exception '발전소명은 1~160자로 입력해 주세요.';
  end if;
  if p_capacity_kw is not null and p_capacity_kw < 0 then
    raise exception '설비용량은 0 이상이어야 합니다.';
  end if;

  insert into public.plants (
    organization_id, name, address, capacity_kw, commissioned_on, timezone
  ) values (
    member_row.organization_id,
    normalized_name,
    nullif(trim(p_address), ''),
    p_capacity_kw,
    p_commissioned_on,
    'Asia/Seoul'
  ) returning * into created_plant;

  insert into public.plant_requesters (plant_id, requester_user_id, created_by)
  values (created_plant.id, actor_id, actor_id);

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id
  ) values (
    member_row.organization_id, actor_id, 'requester.plant_created', 'plant', created_plant.id::text
  );

  return created_plant;
end;
$$;

create or replace function private.request_inspection(
  p_plant_id uuid,
  p_purpose text,
  p_notes text
)
returns public.inspections
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  plant_row public.plants%rowtype;
  created_inspection public.inspections%rowtype;
  generated_code text;
begin
  select plant.* into plant_row
  from public.plants plant
  join public.plant_requesters access on access.plant_id = plant.id
  join public.organization_members membership
    on membership.organization_id = plant.organization_id
   and membership.user_id = access.requester_user_id
   and membership.role = 'client'
   and membership.status = 'active'
  where plant.id = p_plant_id
    and access.requester_user_id = actor_id;

  if not found then
    raise exception '본인 발전소에만 점검을 요청할 수 있습니다.';
  end if;

  generated_code := 'REQ-'
    || to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD')
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.inspections (
    organization_id,
    plant_id,
    inspection_code,
    purpose,
    status,
    requested_on,
    capture_timezone,
    created_by,
    notes
  ) values (
    plant_row.organization_id,
    plant_row.id,
    generated_code,
    coalesce(nullif(trim(p_purpose), ''), '열화상 점검 요청'),
    'requested',
    (now() at time zone 'Asia/Seoul')::date,
    'Asia/Seoul',
    actor_id,
    nullif(trim(p_notes), '')
  ) returning * into created_inspection;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id
  ) values (
    plant_row.organization_id,
    actor_id,
    'requester.inspection_requested',
    'inspection',
    created_inspection.id::text
  );

  return created_inspection;
end;
$$;

create or replace function private.admin_update_member(
  p_organization_id uuid,
  p_user_id uuid,
  p_role text,
  p_status text
)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  updated_member public.organization_members%rowtype;
  normalized_role text := lower(trim(p_role));
  normalized_status text := lower(trim(p_status));
begin
  if not private.has_org_role(p_organization_id, array['owner']) then
    raise exception '관리자만 계정 권한을 변경할 수 있습니다.';
  end if;
  if normalized_role not in ('owner', 'expert', 'client') then
    raise exception '지원하지 않는 역할입니다.';
  end if;
  if normalized_status not in ('invited', 'active', 'suspended') then
    raise exception '지원하지 않는 계정 상태입니다.';
  end if;

  update public.organization_members
  set role = normalized_role,
      status = normalized_status,
      joined_at = case
        when normalized_status = 'active' then coalesce(joined_at, now())
        else joined_at
      end
  where organization_id = p_organization_id
    and user_id = p_user_id
  returning * into updated_member;

  if not found then
    raise exception '변경할 사용자를 찾을 수 없습니다.';
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    p_organization_id,
    actor_id,
    'organization.member_updated',
    'organization_member',
    p_user_id::text,
    jsonb_build_object('role', normalized_role, 'status', normalized_status)
  );

  return updated_member;
end;
$$;

create or replace function private.assign_requester_to_plant(
  p_plant_id uuid,
  p_requester_user_id uuid
)
returns public.plant_requesters
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  plant_row public.plants%rowtype;
  created_access public.plant_requesters%rowtype;
begin
  select * into plant_row from public.plants where id = p_plant_id;
  if not found or not private.has_org_role(plant_row.organization_id, array['owner']) then
    raise exception '관리자만 발전소 소유자를 연결할 수 있습니다.';
  end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = plant_row.organization_id
      and user_id = p_requester_user_id
      and role = 'client'
      and status = 'active'
  ) then
    raise exception '활성 의뢰인 계정을 선택해 주세요.';
  end if;

  insert into public.plant_requesters (plant_id, requester_user_id, created_by)
  values (p_plant_id, p_requester_user_id, actor_id)
  on conflict (plant_id, requester_user_id)
  do update set created_by = excluded.created_by
  returning * into created_access;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    plant_row.organization_id,
    actor_id,
    'plant.requester_assigned',
    'plant',
    p_plant_id::text,
    jsonb_build_object('requester_user_id', p_requester_user_id)
  );

  return created_access;
end;
$$;

create or replace function public.register_requester()
returns table (organization_id uuid, organization_name text, member_role text)
language sql
security invoker
set search_path = ''
as $$ select * from private.register_requester(); $$;

create or replace function public.create_requester_plant(
  p_name text,
  p_address text,
  p_capacity_kw numeric,
  p_commissioned_on date
)
returns public.plants
language sql
security invoker
set search_path = ''
as $$
  select private.create_requester_plant(
    p_name, p_address, p_capacity_kw, p_commissioned_on
  );
$$;

create or replace function public.request_inspection(
  p_plant_id uuid,
  p_purpose text,
  p_notes text
)
returns public.inspections
language sql
security invoker
set search_path = ''
as $$ select private.request_inspection(p_plant_id, p_purpose, p_notes); $$;

create or replace function public.admin_update_member(
  p_organization_id uuid,
  p_user_id uuid,
  p_role text,
  p_status text
)
returns public.organization_members
language sql
security invoker
set search_path = ''
as $$
  select private.admin_update_member(
    p_organization_id, p_user_id, p_role, p_status
  );
$$;

create or replace function public.assign_requester_to_plant(
  p_plant_id uuid,
  p_requester_user_id uuid
)
returns public.plant_requesters
language sql
security invoker
set search_path = ''
as $$
  select private.assign_requester_to_plant(p_plant_id, p_requester_user_id);
$$;

revoke all on function private.register_requester() from public, anon;
revoke all on function private.create_requester_plant(text, text, numeric, date) from public, anon;
revoke all on function private.request_inspection(uuid, text, text) from public, anon;
revoke all on function private.admin_update_member(uuid, uuid, text, text) from public, anon;
revoke all on function private.assign_requester_to_plant(uuid, uuid) from public, anon;
grant execute on function private.register_requester() to authenticated;
grant execute on function private.create_requester_plant(text, text, numeric, date) to authenticated;
grant execute on function private.request_inspection(uuid, text, text) to authenticated;
grant execute on function private.admin_update_member(uuid, uuid, text, text) to authenticated;
grant execute on function private.assign_requester_to_plant(uuid, uuid) to authenticated;

revoke all on function public.register_requester() from public, anon;
revoke all on function public.create_requester_plant(text, text, numeric, date) from public, anon;
revoke all on function public.request_inspection(uuid, text, text) from public, anon;
revoke all on function public.admin_update_member(uuid, uuid, text, text) from public, anon;
revoke all on function public.assign_requester_to_plant(uuid, uuid) from public, anon;
grant execute on function public.register_requester() to authenticated;
grant execute on function public.create_requester_plant(text, text, numeric, date) to authenticated;
grant execute on function public.request_inspection(uuid, text, text) to authenticated;
grant execute on function public.admin_update_member(uuid, uuid, text, text) to authenticated;
grant execute on function public.assign_requester_to_plant(uuid, uuid) to authenticated;

-- Retire the pre-invite member activation RPC from browser callers.
revoke execute on function public.add_organization_member_by_email(uuid, text, text) from authenticated;
revoke execute on function private.add_organization_member_by_email(uuid, text, text) from authenticated;

create or replace function private.activate_invited_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.organization_members
    set status = 'active',
        joined_at = coalesce(joined_at, now())
    where user_id = new.id
      and status = 'invited';
  end if;
  return new;
end;
$$;

revoke all on function private.activate_invited_membership() from public, anon, authenticated;

create trigger activate_membership_after_invite_acceptance
  after update of email_confirmed_at on auth.users
  for each row execute function private.activate_invited_membership();

create or replace function private.prevent_last_active_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
    and old.status = 'active'
    and (
      tg_op = 'DELETE'
      or new.role <> 'owner'
      or new.status <> 'active'
    )
  then
    perform 1
    from public.organizations
    where id = old.organization_id
    for update;

    if not exists (
      select 1 from public.organization_members other
      where other.organization_id = old.organization_id
        and other.user_id <> old.user_id
        and other.role = 'owner'
        and other.status = 'active'
    ) then
      raise exception '최소 한 명의 활성 관리자가 필요합니다.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.prevent_last_active_admin() from public, anon, authenticated;

create trigger prevent_last_active_admin_change
  before update or delete on public.organization_members
  for each row execute function private.prevent_last_active_admin();

create or replace function private.guard_expert_inspection_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or private.has_org_role(old.organization_id, array['owner']) then
    return new;
  end if;

  if old.assigned_expert_user_id <> actor_id
    or new.organization_id <> old.organization_id
    or new.plant_id <> old.plant_id
    or new.inspection_code <> old.inspection_code
    or new.requested_on <> old.requested_on
    or new.scheduled_at is distinct from old.scheduled_at
    or new.due_at is distinct from old.due_at
    or new.capture_timezone <> old.capture_timezone
    or new.assigned_field_user_id is distinct from old.assigned_field_user_id
    or new.assigned_expert_user_id is distinct from old.assigned_expert_user_id
    or new.created_by is distinct from old.created_by
    or new.created_at <> old.created_at
    or new.status not in ('expert_review', 'approval')
  then
    raise exception '전문가는 배정된 점검의 검토 상태와 메모만 변경할 수 있습니다.';
  end if;
  return new;
end;
$$;

create or replace function private.guard_expert_report_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or private.has_org_role(old.organization_id, array['owner']) then
    return new;
  end if;

  if not private.can_work_inspection(old.inspection_id)
    or new.organization_id <> old.organization_id
    or new.inspection_id <> old.inspection_id
    or new.version <> old.version
    or new.status not in ('draft', 'review')
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.published_at is distinct from old.published_at
    or new.withdrawn_at is distinct from old.withdrawn_at
    or new.created_by is distinct from old.created_by
    or new.created_at <> old.created_at
  then
    raise exception '전문가는 배정된 보고서의 초안과 검토 요청만 변경할 수 있습니다.';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_expert_inspection_update() from public, anon, authenticated;
revoke all on function private.guard_expert_report_update() from public, anon, authenticated;

create trigger guard_expert_inspection_update
  before update on public.inspections
  for each row execute function private.guard_expert_inspection_update();
create trigger guard_expert_report_update
  before update on public.reports
  for each row execute function private.guard_expert_report_update();

-- The first bootstrapped organization is the platform operator workspace.
create or replace function private.bootstrap_organization(
  p_name text,
  p_slug text,
  p_setup_code text
)
returns table (organization_id uuid, organization_name text, member_role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  token_id uuid;
  created_organization_id uuid;
  normalized_name text := trim(p_name);
  normalized_slug text := lower(trim(p_slug));
begin
  if actor_id is null then raise exception '로그인이 필요합니다.'; end if;
  if not exists (
    select 1 from auth.users
    where id = actor_id and email_confirmed_at is not null and deleted_at is null
  ) then
    raise exception '이메일 인증을 먼저 완료해 주세요.';
  end if;
  if normalized_name = '' or length(normalized_name) > 160 then
    raise exception '조직명은 1~160자로 입력해 주세요.';
  end if;
  if normalized_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    raise exception '조직 식별자는 영문 소문자, 숫자, 하이픈으로 2~63자여야 합니다.';
  end if;
  if exists (select 1 from public.organization_members where user_id = actor_id) then
    raise exception '이미 조직에 연결된 사용자입니다.';
  end if;
  if exists (select 1 from public.organizations where is_primary_operator) then
    raise exception '최초 관리자 작업공간이 이미 존재합니다.';
  end if;

  select token.id into token_id
  from private.organization_bootstrap_tokens token
  where token.token_hash = extensions.digest(
      pg_catalog.convert_to(pg_catalog.upper(pg_catalog.trim(p_setup_code)), 'UTF8'),
      'sha256'
    )
    and token.used_at is null
    and token.expires_at > now()
  for update;

  if token_id is null then
    raise exception '개설 코드가 올바르지 않거나 만료되었습니다.';
  end if;

  insert into public.organizations (name, slug, is_primary_operator)
  values (normalized_name, normalized_slug, true)
  returning id into created_organization_id;

  insert into public.organization_members (
    organization_id, user_id, role, status, joined_at
  ) values (created_organization_id, actor_id, 'owner', 'active', now());

  update private.organization_bootstrap_tokens
  set used_at = now(), used_by = actor_id
  where id = token_id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    created_organization_id,
    actor_id,
    'organization.bootstrapped',
    'organization',
    created_organization_id::text,
    jsonb_build_object('slug', normalized_slug, 'primary_operator', true)
  );

  return query select created_organization_id, normalized_name, 'owner'::text;
end;
$$;

drop policy if exists storage_originals_select_staff on storage.objects;
drop policy if exists storage_originals_insert_staff on storage.objects;
drop policy if exists storage_originals_update_staff on storage.objects;
drop policy if exists storage_originals_delete_operator on storage.objects;
drop policy if exists storage_reports_select_member on storage.objects;
drop policy if exists storage_reports_insert_staff on storage.objects;
drop policy if exists storage_reports_update_staff on storage.objects;
drop policy if exists storage_reports_delete_operator on storage.objects;

create policy storage_originals_select_workers on storage.objects
  for select to authenticated
  using (
    bucket_id = any (array['inspection-originals', 'inspection-derived'])
    and (select private.storage_inspection_access(name, false))
  );
create policy storage_originals_insert_workers on storage.objects
  for insert to authenticated
  with check (
    bucket_id = any (array['inspection-originals', 'inspection-derived'])
    and (select private.storage_inspection_access(name, false))
  );
create policy storage_originals_update_workers on storage.objects
  for update to authenticated
  using (
    bucket_id = any (array['inspection-originals', 'inspection-derived'])
    and (select private.storage_inspection_access(name, false))
  )
  with check (
    bucket_id = any (array['inspection-originals', 'inspection-derived'])
    and (select private.storage_inspection_access(name, false))
  );
create policy storage_originals_delete_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = any (array['inspection-originals', 'inspection-derived'])
    and (select private.storage_inspection_access(name, false))
    and (select private.storage_org_access(name, array['owner']))
  );

create policy storage_reports_select_authorized on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reports'
    and (select private.storage_inspection_access(name, true))
  );
create policy storage_reports_insert_workers on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'reports'
    and (select private.storage_inspection_access(name, false))
  );
create policy storage_reports_update_workers on storage.objects
  for update to authenticated
  using (
    bucket_id = 'reports'
    and (select private.storage_inspection_access(name, false))
  )
  with check (
    bucket_id = 'reports'
    and (select private.storage_inspection_access(name, false))
  );
create policy storage_reports_delete_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'reports'
    and (select private.storage_inspection_access(name, false))
    and (select private.storage_org_access(name, array['owner']))
  );

comment on table public.plant_requesters is
  'Maps requester accounts to only the plants they own or are authorized to view.';
comment on function public.register_requester() is
  'Registers an email-confirmed self-signup as a requester in the primary operator workspace.';
comment on function public.create_requester_plant(text, text, numeric, date) is
  'Atomically creates a requester plant and its ownership mapping.';
comment on function public.request_inspection(uuid, text, text) is
  'Creates a requested inspection for a plant owned by the current requester.';
comment on function public.admin_update_member(uuid, uuid, text, text) is
  'Audited administrator-only role and account status update.';
