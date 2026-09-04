-- Enforce report versions and state transitions in the database so browser
-- clients cannot skip approval or silently overwrite a published report.

create unique index reports_one_published_per_inspection_idx
  on public.reports (inspection_id)
  where status = 'published';

create or replace function private.create_report_draft(
  p_inspection_id uuid,
  p_title text
)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  inspection_row public.inspections%rowtype;
  next_version integer;
  created_report public.reports%rowtype;
begin
  if actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into inspection_row
  from public.inspections
  where id = p_inspection_id
  for update;

  if not found or not private.can_work_inspection(p_inspection_id) then
    raise exception '이 점검의 보고서 초안을 만들 권한이 없습니다.';
  end if;
  if inspection_row.status in ('cancelled', 'closed') then
    raise exception '취소되거나 종료된 점검에는 보고서 초안을 만들 수 없습니다.';
  end if;
  if nullif(trim(p_title), '') is null or length(trim(p_title)) > 240 then
    raise exception '보고서 제목은 1~240자로 입력해 주세요.';
  end if;

  select coalesce(max(version), 0) + 1
  into next_version
  from public.reports
  where inspection_id = p_inspection_id;

  insert into public.reports (
    organization_id,
    inspection_id,
    version,
    status,
    title,
    created_by
  ) values (
    inspection_row.organization_id,
    inspection_row.id,
    next_version,
    'draft',
    trim(p_title),
    actor_id
  )
  returning * into created_report;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    inspection_row.organization_id,
    actor_id,
    'report.draft_created',
    'report',
    created_report.id::text,
    jsonb_build_object(
      'inspection_id', inspection_row.id,
      'version', next_version
    )
  );

  return created_report;
end;
$$;

create or replace function public.create_report_draft(
  p_inspection_id uuid,
  p_title text
)
returns public.reports
language sql
security invoker
set search_path = ''
as $$
  select private.create_report_draft(p_inspection_id, p_title);
$$;

create or replace function private.transition_report_status(
  p_report_id uuid,
  p_next_status text,
  p_reason text default null
)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  report_row public.reports%rowtype;
  inspection_row public.inspections%rowtype;
  saved_report public.reports%rowtype;
  normalized_next text := lower(trim(p_next_status));
  normalized_reason text := nullif(trim(p_reason), '');
  actor_is_owner boolean;
  now_at timestamptz := now();
begin
  if actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into report_row
  from public.reports
  where id = p_report_id
  for update;

  if not found then
    raise exception '보고서를 찾을 수 없습니다.';
  end if;

  select * into inspection_row
  from public.inspections
  where id = report_row.inspection_id
  for update;

  if not private.can_work_inspection(report_row.inspection_id) then
    raise exception '이 보고서의 상태를 변경할 권한이 없습니다.';
  end if;

  actor_is_owner := private.has_org_role(
    report_row.organization_id,
    array['owner']
  );

  if report_row.status = 'draft' and normalized_next = 'review' then
    if not exists (
      select 1 from public.inspection_files
      where inspection_id = report_row.inspection_id
    ) then
      raise exception '검토 요청 전에 점검 원본을 한 개 이상 저장해야 합니다.';
    end if;
    if exists (
      select 1 from public.findings
      where inspection_id = report_row.inspection_id
        and disposition = 'pending'
    ) then
      raise exception '모든 분석 후보를 판정한 뒤 검토를 요청해 주세요.';
    end if;
  elsif report_row.status = 'review' and normalized_next = 'draft' then
    if not actor_is_owner then
      raise exception '관리자만 수정 요청을 보낼 수 있습니다.';
    end if;
    if normalized_reason is null then
      raise exception '수정 요청 사유를 입력해 주세요.';
    end if;
  elsif report_row.status = 'review' and normalized_next = 'approved' then
    if not actor_is_owner then
      raise exception '관리자만 보고서를 승인할 수 있습니다.';
    end if;
    if exists (
      select 1 from public.findings
      where inspection_id = report_row.inspection_id
        and disposition = 'pending'
    ) then
      raise exception '판정 대기 중인 분석 후보가 있어 승인할 수 없습니다.';
    end if;
  elsif report_row.status = 'approved' and normalized_next = 'draft' then
    if not actor_is_owner then
      raise exception '관리자만 승인을 취소할 수 있습니다.';
    end if;
    if normalized_reason is null then
      raise exception '승인 취소 사유를 입력해 주세요.';
    end if;
  elsif report_row.status = 'approved' and normalized_next = 'published' then
    if not actor_is_owner then
      raise exception '관리자만 보고서를 발행할 수 있습니다.';
    end if;
  elsif report_row.status = 'published' and normalized_next = 'withdrawn' then
    if not actor_is_owner then
      raise exception '관리자만 발행 보고서를 회수할 수 있습니다.';
    end if;
    if normalized_reason is null then
      raise exception '보고서 회수 사유를 입력해 주세요.';
    end if;
  else
    raise exception '허용되지 않은 보고서 상태 변경입니다: % → %',
      report_row.status, normalized_next;
  end if;

  update public.reports
  set status = normalized_next,
      approved_by = case
        when normalized_next = 'approved' then actor_id
        when normalized_next = 'draft' then null
        else approved_by
      end,
      approved_at = case
        when normalized_next = 'approved' then now_at
        when normalized_next = 'draft' then null
        else approved_at
      end,
      published_at = case
        when normalized_next = 'published' then now_at
        else published_at
      end,
      withdrawn_at = case
        when normalized_next = 'withdrawn' then now_at
        else withdrawn_at
      end,
      change_reason = case
        when normalized_reason is not null then normalized_reason
        else change_reason
      end
  where id = report_row.id
  returning * into saved_report;

  update public.inspections
  set status = case
        when normalized_next = 'review' then 'approval'
        when normalized_next = 'draft' then 'expert_review'
        when normalized_next = 'published' then 'published'
        when normalized_next = 'withdrawn' then 'approval'
        else status
      end
  where id = report_row.inspection_id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    report_row.organization_id,
    actor_id,
    'report.status_changed',
    'report',
    report_row.id::text,
    jsonb_strip_nulls(
      jsonb_build_object(
        'inspection_id', report_row.inspection_id,
        'version', report_row.version,
        'from', report_row.status,
        'to', normalized_next,
        'reason', normalized_reason
      )
    )
  );

  return saved_report;
end;
$$;

create or replace function public.transition_report_status(
  p_report_id uuid,
  p_next_status text,
  p_reason text default null
)
returns public.reports
language sql
security invoker
set search_path = ''
as $$
  select private.transition_report_status(
    p_report_id,
    p_next_status,
    p_reason
  );
$$;

revoke insert, update on table public.reports from authenticated;
grant update (title, storage_bucket, storage_path)
  on table public.reports to authenticated;

revoke all on function private.create_report_draft(uuid, text)
  from public, anon;
grant execute on function private.create_report_draft(uuid, text)
  to authenticated;
revoke all on function public.create_report_draft(uuid, text)
  from public, anon;
grant execute on function public.create_report_draft(uuid, text)
  to authenticated;

revoke all on function private.transition_report_status(uuid, text, text)
  from public, anon;
grant execute on function private.transition_report_status(uuid, text, text)
  to authenticated;
revoke all on function public.transition_report_status(uuid, text, text)
  from public, anon;
grant execute on function public.transition_report_status(uuid, text, text)
  to authenticated;

comment on function public.create_report_draft(uuid, text) is
  'Creates the next report version atomically for an authorized inspection worker.';
comment on function public.transition_report_status(uuid, text, text) is
  'Enforces audited draft, review, approval, publication, and withdrawal transitions.';
