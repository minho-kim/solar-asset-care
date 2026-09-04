-- Avoid PL/pgSQL variable/column name ambiguity in analysis finalization.

create or replace function private.complete_relative_analysis(
  p_analysis_run_id uuid,
  p_result_summary jsonb,
  p_regions jsonb
)
returns public.analysis_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  run_row public.analysis_runs%rowtype;
  saved_run public.analysis_runs%rowtype;
  region_count integer;
  inserted_count integer;
  finished_at_value timestamptz := now();
begin
  if actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into run_row
  from public.analysis_runs
  where id = p_analysis_run_id
  for update;

  if not found
    or not private.can_work_inspection(run_row.inspection_id)
  then
    raise exception '이 분석 실행을 완료할 권한이 없습니다.';
  end if;
  if run_row.algorithm_key <> 'rgb-luminance-relative'
    or run_row.status <> 'running'
  then
    raise exception '실행 중인 상대 분석만 완료할 수 있습니다.';
  end if;
  if jsonb_typeof(p_result_summary) <> 'object' then
    raise exception '분석 요약 형식이 올바르지 않습니다.';
  end if;
  if jsonb_typeof(p_regions) <> 'array' then
    raise exception '분석 후보 형식이 올바르지 않습니다.';
  end if;

  region_count := jsonb_array_length(p_regions);
  if region_count > 10 then
    raise exception '분석 후보는 한 실행에 최대 10건입니다.';
  end if;

  insert into public.findings (
    organization_id,
    inspection_id,
    analysis_run_id,
    source,
    kind,
    severity,
    relative_heat_score,
    region,
    disposition
  )
  select
    run_row.organization_id,
    run_row.inspection_id,
    run_row.id,
    'rule_candidate',
    case when region.kind = 'hot' then 'hotspot' else 'coldspot' end,
    case
      when region.score >= 90 then 'major'
      when region.score >= 75 then 'review'
      else 'info'
    end,
    region.score,
    jsonb_build_object(
      'x', region.x,
      'y', region.y,
      'width', region.width,
      'height', region.height,
      'area_percent', region.area_percent
    ),
    'pending'
  from jsonb_to_recordset(p_regions) as region(
    kind text,
    x numeric,
    y numeric,
    width numeric,
    height numeric,
    area_percent numeric,
    score numeric
  )
  where region.kind in ('hot', 'cold')
    and region.x between 0 and 1
    and region.y between 0 and 1
    and region.width > 0 and region.width <= 1
    and region.height > 0 and region.height <= 1
    and region.x + region.width <= 1.01
    and region.y + region.height <= 1.01
    and region.area_percent > 0 and region.area_percent <= 100
    and region.score between 0 and 100;

  get diagnostics inserted_count = row_count;
  if inserted_count <> region_count then
    raise exception '분석 후보 값에 허용 범위를 벗어난 항목이 있습니다.';
  end if;

  update public.analysis_runs
  set status = 'succeeded',
      result_summary = p_result_summary,
      error_code = null,
      finished_at = finished_at_value
  where id = run_row.id
  returning * into saved_run;

  update public.inspections
  set status = 'expert_review'
  where id = run_row.inspection_id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    run_row.organization_id,
    actor_id,
    'analysis.relative_completed',
    'analysis_run',
    run_row.id::text,
    jsonb_build_object(
      'inspection_id', run_row.inspection_id,
      'candidate_count', region_count
    )
  );

  return saved_run;
end;
$$;

create or replace function private.fail_relative_analysis(
  p_analysis_run_id uuid,
  p_message text
)
returns public.analysis_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  run_row public.analysis_runs%rowtype;
  saved_run public.analysis_runs%rowtype;
  finished_at_value timestamptz := now();
begin
  if actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into run_row
  from public.analysis_runs
  where id = p_analysis_run_id
  for update;

  if not found
    or not private.can_work_inspection(run_row.inspection_id)
  then
    raise exception '이 분석 실행을 실패 처리할 권한이 없습니다.';
  end if;
  if run_row.algorithm_key <> 'rgb-luminance-relative'
    or run_row.status <> 'running'
  then
    raise exception '실행 중인 상대 분석만 실패 처리할 수 있습니다.';
  end if;

  update public.analysis_runs
  set status = 'failed',
      result_summary = jsonb_build_object(
        'message', left(coalesce(nullif(trim(p_message), ''), '분석 실패'), 300),
        'failed_at', finished_at_value
      ),
      error_code = 'RELATIVE_ANALYSIS_FAILED',
      finished_at = finished_at_value
  where id = run_row.id
  returning * into saved_run;

  return saved_run;
end;
$$;
