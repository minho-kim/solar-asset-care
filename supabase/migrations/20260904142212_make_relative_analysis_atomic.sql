-- Keep each relative image analysis run auditable and finalize its findings
-- atomically so retries cannot create duplicate successful results.

create unique index analysis_runs_one_success_per_file_idx
  on public.analysis_runs ((input_manifest ->> 'inspection_file_id'))
  where status = 'succeeded'
    and algorithm_key = 'rgb-luminance-relative'
    and input_manifest ? 'inspection_file_id';

create or replace function private.start_relative_analysis(
  p_inspection_file_id uuid,
  p_normalized_pixels integer
)
returns public.analysis_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  file_row public.inspection_files%rowtype;
  inspection_row public.inspections%rowtype;
  created_run public.analysis_runs%rowtype;
begin
  if actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_normalized_pixels is null
    or p_normalized_pixels < 1
    or p_normalized_pixels > 96000
  then
    raise exception '분석 픽셀 수가 허용 범위를 벗어났습니다.';
  end if;

  select * into file_row
  from public.inspection_files
  where id = p_inspection_file_id;

  if not found or not private.can_work_inspection(file_row.inspection_id) then
    raise exception '이 원본을 분석할 권한이 없습니다.';
  end if;
  if file_row.kind <> 'thermal_original'
    or file_row.mime_type not in ('image/jpeg', 'image/png')
  then
    raise exception '상대 분석은 열화상 JPG 또는 PNG 원본만 지원합니다.';
  end if;

  select * into inspection_row
  from public.inspections
  where id = file_row.inspection_id;

  if inspection_row.status in ('published', 'closed', 'cancelled') then
    raise exception '발행·종료·취소된 점검은 다시 분석할 수 없습니다.';
  end if;

  if exists (
    select 1
    from public.analysis_runs
    where algorithm_key = 'rgb-luminance-relative'
      and status = 'succeeded'
      and input_manifest ->> 'inspection_file_id' = file_row.id::text
  ) then
    raise exception '이 원본의 상대 분석이 이미 완료됐습니다.';
  end if;

  insert into public.analysis_runs (
    organization_id,
    inspection_id,
    algorithm_key,
    algorithm_version,
    status,
    input_manifest,
    requested_by,
    started_at
  ) values (
    file_row.organization_id,
    file_row.inspection_id,
    'rgb-luminance-relative',
    '1.0.0',
    'running',
    jsonb_build_object(
      'inspection_file_id', file_row.id,
      'normalized_pixels', p_normalized_pixels
    ),
    actor_id,
    now()
  )
  returning * into created_run;

  return created_run;
end;
$$;

create or replace function public.start_relative_analysis(
  p_inspection_file_id uuid,
  p_normalized_pixels integer
)
returns public.analysis_runs
language sql
security invoker
set search_path = ''
as $$
  select private.start_relative_analysis(
    p_inspection_file_id,
    p_normalized_pixels
  );
$$;

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
  finished_at timestamptz := now();
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
      finished_at = finished_at
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

create or replace function public.complete_relative_analysis(
  p_analysis_run_id uuid,
  p_result_summary jsonb,
  p_regions jsonb
)
returns public.analysis_runs
language sql
security invoker
set search_path = ''
as $$
  select private.complete_relative_analysis(
    p_analysis_run_id,
    p_result_summary,
    p_regions
  );
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
  finished_at timestamptz := now();
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
        'failed_at', finished_at
      ),
      error_code = 'RELATIVE_ANALYSIS_FAILED',
      finished_at = finished_at
  where id = run_row.id
  returning * into saved_run;

  return saved_run;
end;
$$;

create or replace function public.fail_relative_analysis(
  p_analysis_run_id uuid,
  p_message text
)
returns public.analysis_runs
language sql
security invoker
set search_path = ''
as $$
  select private.fail_relative_analysis(p_analysis_run_id, p_message);
$$;

revoke insert, update on table public.analysis_runs from authenticated;

revoke all on function private.start_relative_analysis(uuid, integer)
  from public, anon;
grant execute on function private.start_relative_analysis(uuid, integer)
  to authenticated;
revoke all on function public.start_relative_analysis(uuid, integer)
  from public, anon;
grant execute on function public.start_relative_analysis(uuid, integer)
  to authenticated;

revoke all on function private.complete_relative_analysis(uuid, jsonb, jsonb)
  from public, anon;
grant execute on function private.complete_relative_analysis(uuid, jsonb, jsonb)
  to authenticated;
revoke all on function public.complete_relative_analysis(uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.complete_relative_analysis(uuid, jsonb, jsonb)
  to authenticated;

revoke all on function private.fail_relative_analysis(uuid, text)
  from public, anon;
grant execute on function private.fail_relative_analysis(uuid, text)
  to authenticated;
revoke all on function public.fail_relative_analysis(uuid, text)
  from public, anon;
grant execute on function public.fail_relative_analysis(uuid, text)
  to authenticated;

comment on function public.start_relative_analysis(uuid, integer) is
  'Starts a checked relative-image analysis for one authorized thermal original.';
comment on function public.complete_relative_analysis(uuid, jsonb, jsonb) is
  'Atomically stores validated relative candidates and completes their analysis run.';
comment on function public.fail_relative_analysis(uuid, text) is
  'Records a bounded failure summary for a running relative-image analysis.';
