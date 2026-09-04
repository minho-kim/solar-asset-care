-- Keep organization ids aligned with their parent records and limit expert
-- updates to the fields needed for assigned review work.

create or replace function private.enforce_parent_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_organization_id uuid;
  related_inspection_id uuid;
begin
  case tg_table_name
    when 'inspections' then
      select organization_id into parent_organization_id
      from public.plants where id = new.plant_id;
    when 'inspection_files', 'analysis_runs', 'findings', 'reports', 'maintenance_requests' then
      select organization_id into parent_organization_id
      from public.inspections where id = new.inspection_id;
    else
      raise exception '지원하지 않는 관계 검사 대상입니다.';
  end case;

  if parent_organization_id is null or new.organization_id <> parent_organization_id then
    raise exception '하위 데이터의 조직이 상위 데이터와 일치하지 않습니다.';
  end if;

  if tg_table_name = 'findings' and new.analysis_run_id is not null then
    select inspection_id into related_inspection_id
    from public.analysis_runs
    where id = new.analysis_run_id
      and organization_id = new.organization_id;
    if related_inspection_id is null or related_inspection_id <> new.inspection_id then
      raise exception '분석 실행과 판정 후보의 점검이 일치하지 않습니다.';
    end if;
  end if;

  if tg_table_name = 'maintenance_requests' and new.finding_id is not null then
    select inspection_id into related_inspection_id
    from public.findings
    where id = new.finding_id
      and organization_id = new.organization_id;
    if related_inspection_id is null or related_inspection_id <> new.inspection_id then
      raise exception '판정 후보와 유지보수 요청의 점검이 일치하지 않습니다.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_parent_organization()
  from public, anon, authenticated;

create trigger inspections_enforce_parent_organization
  before insert or update on public.inspections
  for each row execute function private.enforce_parent_organization();
create trigger inspection_files_enforce_parent_organization
  before insert or update on public.inspection_files
  for each row execute function private.enforce_parent_organization();
create trigger analysis_runs_enforce_parent_organization
  before insert or update on public.analysis_runs
  for each row execute function private.enforce_parent_organization();
create trigger findings_enforce_parent_organization
  before insert or update on public.findings
  for each row execute function private.enforce_parent_organization();
create trigger reports_enforce_parent_organization
  before insert or update on public.reports
  for each row execute function private.enforce_parent_organization();
create trigger maintenance_enforce_parent_organization
  before insert or update on public.maintenance_requests
  for each row execute function private.enforce_parent_organization();

create or replace function private.guard_expert_file_update()
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
    or new.kind <> old.kind
    or new.storage_bucket <> old.storage_bucket
    or new.storage_path <> old.storage_path
    or new.original_name <> old.original_name
    or new.created_by is distinct from old.created_by
    or new.created_at <> old.created_at
  then
    raise exception '전문가는 배정된 점검 파일의 품질 정보만 변경할 수 있습니다.';
  end if;
  return new;
end;
$$;

create or replace function private.guard_expert_analysis_update()
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
    or new.algorithm_key <> old.algorithm_key
    or new.algorithm_version <> old.algorithm_version
    or new.input_manifest <> old.input_manifest
    or new.requested_by is distinct from old.requested_by
    or new.requested_at <> old.requested_at
    or new.created_at <> old.created_at
  then
    raise exception '전문가는 배정된 분석의 실행 결과만 변경할 수 있습니다.';
  end if;
  return new;
end;
$$;

create or replace function private.guard_expert_finding_update()
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
    or new.analysis_run_id is distinct from old.analysis_run_id
    or new.source <> old.source
    or new.created_at <> old.created_at
    or new.reviewed_by is distinct from actor_id
    or new.disposition not in ('accepted', 'modified', 'rejected')
  then
    raise exception '전문가는 배정된 판정 후보의 검토 결과만 변경할 수 있습니다.';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_expert_file_update()
  from public, anon, authenticated;
revoke all on function private.guard_expert_analysis_update()
  from public, anon, authenticated;
revoke all on function private.guard_expert_finding_update()
  from public, anon, authenticated;

create trigger guard_expert_file_update
  before update on public.inspection_files
  for each row execute function private.guard_expert_file_update();
create trigger guard_expert_analysis_update
  before update on public.analysis_runs
  for each row execute function private.guard_expert_analysis_update();
create trigger guard_expert_finding_update
  before update on public.findings
  for each row execute function private.guard_expert_finding_update();

drop trigger guard_expert_report_update on public.reports;

create or replace function private.guard_expert_report_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  source_organization_id uuid := case
    when tg_op = 'INSERT' then new.organization_id
    else old.organization_id
  end;
begin
  if actor_id is null
    or private.has_org_role(source_organization_id, array['owner'])
  then
    return new;
  end if;

  if not private.can_work_inspection(new.inspection_id)
    or new.status not in ('draft', 'review')
    or new.approved_by is not null
    or new.approved_at is not null
    or new.published_at is not null
    or new.withdrawn_at is not null
  then
    raise exception '전문가는 배정된 보고서의 초안과 검토 요청만 저장할 수 있습니다.';
  end if;

  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.inspection_id <> old.inspection_id
    or new.version <> old.version
    or new.created_by is distinct from old.created_by
    or new.created_at <> old.created_at
  ) then
    raise exception '전문가는 보고서의 소유 관계나 버전을 변경할 수 없습니다.';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_expert_report_update()
  from public, anon, authenticated;

create trigger guard_expert_report_update
  before insert or update on public.reports
  for each row execute function private.guard_expert_report_update();
