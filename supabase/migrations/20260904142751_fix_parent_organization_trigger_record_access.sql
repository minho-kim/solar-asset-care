-- Dynamic trigger records only expose columns from their current table.
-- Keep table-specific field access inside nested branches so unrelated inserts
-- do not try to read a field that does not exist on NEW.

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

  if parent_organization_id is null
    or new.organization_id <> parent_organization_id
  then
    raise exception '하위 데이터의 조직이 상위 데이터와 일치하지 않습니다.';
  end if;

  if tg_table_name = 'findings' then
    if new.analysis_run_id is not null then
      select inspection_id into related_inspection_id
      from public.analysis_runs
      where id = new.analysis_run_id
        and organization_id = new.organization_id;

      if related_inspection_id is null
        or related_inspection_id <> new.inspection_id
      then
        raise exception '분석 실행과 판정 후보의 점검이 일치하지 않습니다.';
      end if;
    end if;
  end if;

  if tg_table_name = 'maintenance_requests' then
    if new.finding_id is not null then
      select inspection_id into related_inspection_id
      from public.findings
      where id = new.finding_id
        and organization_id = new.organization_id;

      if related_inspection_id is null
        or related_inspection_id <> new.inspection_id
      then
        raise exception '판정 후보와 유지보수 요청의 점검이 일치하지 않습니다.';
      end if;
    end if;
  end if;

  return new;
end;
$$;
