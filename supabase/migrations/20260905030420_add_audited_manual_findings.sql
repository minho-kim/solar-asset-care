alter table public.findings
  add column defect_type text check (defect_type in ('cell_hotspot','submodule','module','string','junction_inverter','soiling_shade','pid_degradation','other')),
  add column location_label text check (length(location_label)<=200),
  add column measurement_source text check (length(measurement_source)<=1000),
  add column source_file_id uuid references public.inspection_files(id);
create index findings_source_file_idx on public.findings(source_file_id);

create function private.validate_finding_evidence()
returns trigger language plpgsql security definer set search_path = '' as $$
declare source_id uuid; x numeric; y numeric; w numeric; h numeric;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not private.can_work_inspection(new.inspection_id) then raise exception '이 점검의 판정을 수정할 권한이 없습니다.'; end if;
  if tg_op='UPDATE' and (old.inspection_id<>new.inspection_id or old.source<>new.source
    or old.analysis_run_id is distinct from new.analysis_run_id) then
    raise exception '판정의 원본 관계는 바꿀 수 없습니다.';
  end if;
  if new.source='rule_candidate' then
    select (input_manifest->>'inspection_file_id')::uuid into source_id
      from public.analysis_runs where id=new.analysis_run_id and inspection_id=new.inspection_id;
    if source_id is null then raise exception '분석 원본을 확인할 수 없습니다.'; end if;
    new.source_file_id := source_id;
  end if;
  if new.source_file_id is not null and not exists(select 1 from public.inspection_files
    where id=new.source_file_id and inspection_id=new.inspection_id) then
    raise exception '같은 점검의 원본 파일을 선택해 주세요.';
  end if;
  if new.temperature_max_c is not null or new.temperature_delta_c is not null then
    if nullif(btrim(new.measurement_source),'') is null then raise exception '온도 수치에는 측정 장비·원본과 측정 근거가 필요합니다.'; end if;
    if new.temperature_max_c not between -273.15 and 2000
      or new.temperature_delta_c not between -1000 and 1000 then raise exception '온도 수치의 범위를 확인해 주세요.'; end if;
  end if;
  if new.region is not null then
    if new.source_file_id is null then raise exception '위치를 표시할 원본 파일을 선택해 주세요.'; end if;
    x:=private.required_number(new.region,'x',0,1); y:=private.required_number(new.region,'y',0,1);
    w:=private.required_number(new.region,'width',0.000001,1); h:=private.required_number(new.region,'height',0.000001,1);
    if x+w>1.000001 or y+h>1.000001 then raise exception '표시 영역이 이미지 범위를 벗어났습니다.'; end if;
  end if;
  if new.disposition in ('accepted','modified','rejected') then
    new.reviewed_by:=auth.uid(); new.reviewed_at:=now();
  else new.reviewed_by:=null; new.reviewed_at:=null;
  end if;
  return new;
end $$;
create trigger validate_finding_evidence before insert or update on public.findings
  for each row execute function private.validate_finding_evidence();

create function private.audit_finding_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(new.organization_id,auth.uid(),case when tg_op='INSERT' then 'finding.created' else 'finding.reviewed' end,
      'finding',new.id::text,jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) end,'after',to_jsonb(new)));
  return new;
end $$;
create trigger audit_finding_change after insert or update on public.findings
  for each row execute function private.audit_finding_change();
revoke all on function private.validate_finding_evidence(),private.audit_finding_change() from public,anon,authenticated;
-- Rejection keeps evidence and reviewer history; destructive removal is not a UI action.
revoke delete on public.findings from authenticated;
