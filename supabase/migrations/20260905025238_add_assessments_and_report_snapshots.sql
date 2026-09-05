-- Versioned calculation criteria, server-computed assessments and frozen reports.
-- No default tariffs are activated: an administrator must save an explicit version.
create table public.calculation_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  version integer not null check (version > 0),
  effective_from date not null,
  values jsonb not null check (jsonb_typeof(values) = 'object'),
  change_reason text not null check (length(btrim(change_reason)) between 1 and 1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, version)
);
create index calculation_settings_effective_idx
  on public.calculation_settings (organization_id, effective_from desc, version desc);
create index calculation_settings_creator_idx on public.calculation_settings(created_by);

create table public.inspection_assessments (
  inspection_id uuid primary key references public.inspections(id),
  organization_id uuid not null references public.organizations(id),
  settings_id uuid not null references public.calculation_settings(id),
  revision integer not null check (revision > 0),
  capture jsonb not null,
  calculation_input jsonb not null,
  result jsonb not null,
  warnings jsonb not null,
  exception_reason text,
  exception_approved_by uuid references auth.users(id),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
create index inspection_assessments_org_idx on public.inspection_assessments(organization_id);
create index inspection_assessments_settings_idx on public.inspection_assessments(settings_id);
create index inspection_assessments_updater_idx on public.inspection_assessments(updated_by);
create index inspection_assessments_approver_idx on public.inspection_assessments(exception_approved_by);

create table public.report_snapshots (
  report_id uuid primary key references public.reports(id),
  organization_id uuid not null references public.organizations(id),
  schema_version integer not null default 1,
  content jsonb not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  frozen_by uuid not null references auth.users(id),
  frozen_at timestamptz not null default now()
);
create index report_snapshots_org_idx on public.report_snapshots(organization_id);
create index report_snapshots_creator_idx on public.report_snapshots(frozen_by);

alter table public.calculation_settings enable row level security;
alter table public.inspection_assessments enable row level security;
alter table public.report_snapshots enable row level security;
revoke all on public.calculation_settings, public.inspection_assessments,
  public.report_snapshots from public, anon, authenticated;
grant select on public.calculation_settings, public.inspection_assessments,
  public.report_snapshots to authenticated;
create policy settings_read_staff on public.calculation_settings for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','expert'])));
create policy assessments_read_workers on public.inspection_assessments for select to authenticated
  using ((select private.can_work_inspection(inspection_id)));
create policy snapshots_read_report_viewers on public.report_snapshots for select to authenticated
  using ((select private.can_view_report(report_id)));

-- Only trusted RPCs can write. All public entry points are invoker wrappers.
create function private.required_number(j jsonb, k text, lo numeric, hi numeric)
returns numeric language plpgsql immutable set search_path = '' as $$
declare n numeric;
begin
  if jsonb_typeof(j->k) is distinct from 'number' then
    raise exception '숫자 항목을 확인해 주세요: %', k;
  end if;
  n := (j->>k)::numeric;
  if n < lo or n > hi then raise exception '허용 범위를 벗어났습니다: %', k; end if;
  return n;
end $$;

create function private.validate_calculation_settings(v jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare k text;
begin
  perform private.required_number(v,'sunHours',0.01,24);
  perform private.required_number(v,'degradationRatePercent',0,20);
  perform private.required_number(v,'orientationFactor',0.01,2);
  perform private.required_number(v,'selfUseTariff',0,10000);
  perform private.required_number(v,'smp',0,10000);
  perform private.required_number(v,'rec',0,10000);
  perform private.required_number(v,'recWeight',0,10);
  perform private.required_number(v,'prNormal',0.01,2);
  perform private.required_number(v,'prWarning',0,2);
  perform private.required_number(v,'irradianceMinimum',1,2000);
  perform private.required_number(v,'windWarning',0,100);
  perform private.required_number(v,'angleMinimum',0,90);
  perform private.required_number(v,'angleMaximum',0,90);
  perform private.required_number(v,'distanceMaximum',0.01,1000);
  perform private.required_number(v,'deltaTWarning',0,500);
  perform private.required_number(v,'deltaTCritical',0,500);
  if (v->>'prWarning')::numeric >= (v->>'prNormal')::numeric
    or (v->>'angleMinimum')::numeric >= (v->>'angleMaximum')::numeric
    or (v->>'deltaTWarning')::numeric >= (v->>'deltaTCritical')::numeric then
    raise exception '성능비·촬영각도·온도차의 하한은 상한보다 작아야 합니다.';
  end if;
  foreach k in array array['soiling','string','inverter','diode','cell_pid'] loop
    perform private.required_number(v->'improvementRates',k,0,1);
  end loop;
end $$;

create function private.save_calculation_settings(
  p_organization_id uuid, p_effective_from date, p_values jsonb, p_reason text
) returns public.calculation_settings language plpgsql security definer set search_path = '' as $$
declare r public.calculation_settings%rowtype; n integer;
begin
  if auth.uid() is null or not private.has_org_role(p_organization_id,array['owner']) then
    raise exception '관리자만 계산 기준을 등록할 수 있습니다.';
  end if;
  if p_effective_from is null or p_effective_from < date '2000-01-01'
    or p_effective_from > (now() at time zone 'Asia/Seoul')::date + 366 then
    raise exception '적용 시작일을 확인해 주세요.';
  end if;
  perform private.validate_calculation_settings(p_values);
  perform 1 from public.organizations where id = p_organization_id for update;
  select coalesce(max(version),0)+1 into n from public.calculation_settings where organization_id=p_organization_id;
  insert into public.calculation_settings(organization_id,version,effective_from,values,change_reason,created_by)
    values(p_organization_id,n,p_effective_from,p_values,btrim(p_reason),auth.uid()) returning * into r;
  insert into public.audit_events(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(p_organization_id,auth.uid(),'calculation.settings_created','calculation_settings',r.id::text,
      jsonb_build_object('version',n,'effective_from',p_effective_from,'reason',p_reason));
  return r;
end $$;
create function public.save_calculation_settings(p_organization_id uuid,p_effective_from date,p_values jsonb,p_reason text)
returns public.calculation_settings language sql security invoker set search_path = '' as $$
  select private.save_calculation_settings(p_organization_id,p_effective_from,p_values,p_reason);
$$;

-- Period includes both endpoint dates. Payback annualizes the same-period recovery
-- using 365 days; these are estimates, not measured IEC performance ratios.
create function private.compute_solar_assessment(p jsonb, v jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  start_on date; end_on date; days integer; age integer; capacity numeric;
  actual numeric; expected numeric; tariff numeric; loss numeric; ratio numeric;
  recovery numeric; rate numeric; repair numeric; year integer;
begin
  perform private.validate_calculation_settings(v);
  if coalesce(p->>'periodStart','') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p->>'periodEnd','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception '분석 시작일과 종료일을 입력해 주세요.';
  end if;
  start_on := (p->>'periodStart')::date; end_on := (p->>'periodEnd')::date;
  days := end_on-start_on+1;
  if days not between 1 and 3660 then raise exception '분석기간은 1~3660일이어야 합니다.'; end if;
  capacity := private.required_number(p,'capacityKwp',0.001,1000000);
  actual := private.required_number(p,'actualGenerationKwh',0,100000000000);
  repair := private.required_number(p,'repairCost',0,1000000000000);
  year := private.required_number(p,'installationYear',1900,2200);
  if year <> (p->>'installationYear')::numeric or year > extract(year from end_on) then
    raise exception '설치연도는 분석 종료연도보다 늦을 수 없습니다.';
  end if;
  if p->>'operationType' not in ('self-use','generation') or p->>'operationType' is null then
    raise exception '운영형태를 선택해 주세요.';
  end if;
  if p->>'defectType' not in ('soiling','string','inverter','diode','cell_pid') or p->>'defectType' is null then
    raise exception '개선 대상 유형을 선택해 주세요.';
  end if;
  if length(btrim(coalesce(p->>'generationSource',''))) not between 1 and 1000 then
    raise exception '실발전량의 출처를 입력해 주세요.';
  end if;
  age := extract(year from end_on)::integer-year;
  expected := capacity*(v->>'sunHours')::numeric*days
    *power(1-(v->>'degradationRatePercent')::numeric/100,age)*(v->>'orientationFactor')::numeric;
  tariff := case when p->>'operationType'='self-use' then (v->>'selfUseTariff')::numeric
    else (v->>'smp')::numeric+(v->>'rec')::numeric*(v->>'recWeight')::numeric end;
  ratio := actual/expected; loss := greatest(0,expected-actual);
  rate := (v->'improvementRates'->>(p->>'defectType'))::numeric;
  recovery := loss*tariff*rate;
  return jsonb_build_object('engineVersion','period-estimate-v1','periodDays',days,'elapsedYears',age,
    'expectedGenerationKwh',expected,'actualGenerationKwh',actual,'performanceRatio',ratio,
    'lossKwh',loss,'tariff',tariff,'expectedRevenue',expected*tariff,'currentRevenue',actual*tariff,
    'lossAmount',loss*tariff,'improvementRate',rate,'recoverableAmount',recovery,
    'annualRecoverableAmount',recovery*365/days,
    'paybackYears',case when recovery>0 then repair/(recovery*365/days) else null end,
    'prStatus',case when ratio>=(v->>'prNormal')::numeric then '정상'
      when ratio>=(v->>'prWarning')::numeric then '주의' else '점검 필요' end);
end $$;

create function private.save_inspection_assessment(
  p_inspection_id uuid,p_settings_id uuid,p_capture jsonb,p_input jsonb,
  p_exception_reason text,p_expected_revision integer
) returns public.inspection_assessments language plpgsql security definer set search_path = '' as $$
declare
  i public.inspections%rowtype; s public.calculation_settings%rowtype;
  prev public.inspection_assessments%rowtype; r public.inspection_assessments%rowtype;
  plant public.plants%rowtype; canonical_input jsonb; warnings jsonb := '[]';
  measured timestamptz; exception_reason text := nullif(btrim(p_exception_reason),''); n numeric;
begin
  if auth.uid() is null or not private.can_work_inspection(p_inspection_id) then
    raise exception '이 점검의 평가를 저장할 권한이 없습니다.';
  end if;
  select * into i from public.inspections where id=p_inspection_id for update;
  if i.status in ('cancelled','closed') then raise exception '종료된 점검은 수정할 수 없습니다.'; end if;
  select * into plant from public.plants where id=i.plant_id;
  select * into s from public.calculation_settings where id=p_settings_id and organization_id=i.organization_id;
  if not found then raise exception '이 조직의 계산 기준을 선택해 주세요.'; end if;
  select * into prev from public.inspection_assessments where inspection_id=i.id;
  if p_expected_revision is null or p_expected_revision<>coalesce(prev.revision,0) then
    raise exception '다른 사용자가 변경했습니다. 새로고침 후 다시 저장해 주세요.';
  end if;
  if coalesce(p_capture->>'measuredAt','') !~ '(Z|[+-]\d{2}:\d{2})$' then
    raise exception '촬영 시각에는 시간대가 필요합니다.';
  end if;
  measured := (p_capture->>'measuredAt')::timestamptz;
  if measured>now()+interval '5 minutes' or measured<timestamptz '2000-01-01Z' then
    raise exception '촬영 시각은 미래가 될 수 없습니다.';
  end if;
  if s.effective_from>(measured at time zone 'Asia/Seoul')::date then
    raise exception '촬영일에 적용할 수 있는 계산 기준을 선택해 주세요.';
  end if;
  if length(btrim(coalesce(p_capture->>'source',''))) not between 1 and 1000 then
    raise exception '촬영조건 측정 장비·출처를 입력해 주세요.';
  end if;
  n := private.required_number(p_capture,'irradiance',0,2000);
  if n<(s.values->>'irradianceMinimum')::numeric then warnings:=warnings||'"일사량 기준 미달"'::jsonb; end if;
  n := private.required_number(p_capture,'wind',0,100);
  if n>(s.values->>'windWarning')::numeric then warnings:=warnings||'"풍속 기준 초과"'::jsonb; end if;
  perform private.required_number(p_capture,'ambientTemperature',-80,80);
  n := private.required_number(p_capture,'angle',0,90);
  if n<(s.values->>'angleMinimum')::numeric or n>(s.values->>'angleMaximum')::numeric then
    warnings:=warnings||'"촬영각도 기준 이탈"'::jsonb; end if;
  n := private.required_number(p_capture,'distance',0.01,1000);
  if n>(s.values->>'distanceMaximum')::numeric then warnings:=warnings||'"촬영거리 기준 초과"'::jsonb; end if;
  if exception_reason is not null and
    (not private.has_org_role(i.organization_id,array['owner']) or length(exception_reason)>1000) then
    raise exception '관리자만 1000자 이내 사유로 촬영조건 예외를 승인할 수 있습니다.';
  end if;
  if plant.capacity_kw is null or plant.commissioned_on is null then
    raise exception '발전소에 설비용량과 가동 시작일을 먼저 등록해 주세요.';
  end if;
  canonical_input := p_input || jsonb_build_object('capacityKwp',plant.capacity_kw,
    'installationYear',extract(year from plant.commissioned_on)::integer);
  if (p_input->>'periodStart')::date<plant.commissioned_on
    or (p_input->>'periodEnd')::date>(now() at time zone 'Asia/Seoul')::date then
    raise exception '분석기간은 가동 시작일 이후부터 오늘까지로 입력해 주세요.';
  end if;
  insert into public.inspection_assessments(inspection_id,organization_id,settings_id,revision,capture,
    calculation_input,result,warnings,exception_reason,exception_approved_by,updated_by)
  values(i.id,i.organization_id,s.id,coalesce(prev.revision,0)+1,p_capture,canonical_input,
    private.compute_solar_assessment(canonical_input,s.values),warnings,exception_reason,
    case when exception_reason is not null then auth.uid() end,auth.uid())
  on conflict(inspection_id) do update set settings_id=excluded.settings_id,revision=excluded.revision,
    capture=excluded.capture,calculation_input=excluded.calculation_input,result=excluded.result,
    warnings=excluded.warnings,exception_reason=excluded.exception_reason,
    exception_approved_by=excluded.exception_approved_by,updated_by=excluded.updated_by,updated_at=now()
  returning * into r;
  insert into public.audit_events(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(i.organization_id,auth.uid(),'inspection.assessment_saved','inspection',i.id::text,
      jsonb_build_object('before',to_jsonb(prev),'after',to_jsonb(r)));
  return r;
end $$;
create function public.save_inspection_assessment(p_inspection_id uuid,p_settings_id uuid,p_capture jsonb,
  p_input jsonb,p_exception_reason text,p_expected_revision integer)
returns public.inspection_assessments language sql security invoker set search_path = '' as $$
  select private.save_inspection_assessment(p_inspection_id,p_settings_id,p_capture,p_input,p_exception_reason,p_expected_revision);
$$;

-- Freeze only when entering review, not at publication. The approver and client
-- see the SAME content even if the plant, findings or assessment later change.
create function private.freeze_report_content()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.inspection_assessments%rowtype; body jsonb;
begin
  if tg_op='UPDATE' and old.status<>'draft'
    and (new.title is distinct from old.title or new.storage_path is distinct from old.storage_path
      or new.storage_bucket is distinct from old.storage_bucket) then
    raise exception '검토 중이거나 발행된 보고서는 직접 변경할 수 없습니다. 수정 요청 후 새로 검토해 주세요.';
  end if;
  if new.status='review' and old.status='draft' then
    select * into a from public.inspection_assessments where inspection_id=new.inspection_id;
    if not found then raise exception '촬영조건·발전량 평가를 저장한 뒤 검토를 요청해 주세요.'; end if;
    if jsonb_array_length(a.warnings)>0 and a.exception_approved_by is null then
      raise exception '촬영조건 기준을 충족하지 못했습니다. 재촬영하거나 관리자의 사유 있는 예외 승인이 필요합니다.';
    end if;
    select jsonb_build_object('schemaVersion',1,'title',new.title,
      'inspection',jsonb_build_object('inspection_code',i.inspection_code,'purpose',i.purpose,
        'notes',i.notes,'scheduled_at',i.scheduled_at),
      'plant',jsonb_build_object('name',p.name,'address',p.address,'capacity_kw',p.capacity_kw,'commissioned_on',p.commissioned_on),
      'organization',jsonb_build_object('name',o.name),
      'assessment',to_jsonb(a),'settings',to_jsonb(s),
      'findings',coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at,f.id) from public.findings f
        where f.inspection_id=i.id and f.disposition in ('accepted','modified')),'[]'::jsonb),
      'maintenance',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'status',m.status) order by m.created_at,m.id)
        from public.maintenance_requests m where m.inspection_id=i.id),'[]'::jsonb),
      'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'kind',f.kind,'original_name',f.original_name,
        'sha256',f.sha256,'bytes',f.bytes) order by f.created_at,f.id) from public.inspection_files f where f.inspection_id=i.id),'[]'::jsonb)
    ) into body from public.inspections i join public.plants p on p.id=i.plant_id
      join public.organizations o on o.id=i.organization_id
      join public.calculation_settings s on s.id=a.settings_id where i.id=new.inspection_id;
    insert into public.report_snapshots(report_id,organization_id,content,sha256,frozen_by)
      values(new.id,new.organization_id,body,encode(extensions.digest(body::text,'sha256'),'hex'),auth.uid());
  elsif new.status='draft' and old.status in ('review','approved') then
    -- Preserve the superseded review content in audit before allowing a fresh snapshot.
    insert into public.audit_events(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
      select new.organization_id,auth.uid(),'report.review_snapshot_superseded','report',new.id::text,to_jsonb(s)
      from public.report_snapshots s where report_id=new.id;
    delete from public.report_snapshots where report_id=new.id;
  elsif new.status in ('approved','published') and new.status<>old.status then
    if not exists(select 1 from public.report_snapshots where report_id=new.id) then
      raise exception '검토 보관본이 없습니다. 수정 요청 후 다시 검토해 주세요.';
    end if;
  end if;
  return new;
end $$;
create trigger freeze_report_content before update on public.reports
  for each row execute function private.freeze_report_content();

revoke all on function private.required_number(jsonb,text,numeric,numeric),
  private.validate_calculation_settings(jsonb),private.compute_solar_assessment(jsonb,jsonb),
  private.freeze_report_content() from public,anon,authenticated;
revoke all on function private.save_calculation_settings(uuid,date,jsonb,text),
  public.save_calculation_settings(uuid,date,jsonb,text),
  private.save_inspection_assessment(uuid,uuid,jsonb,jsonb,text,integer),
  public.save_inspection_assessment(uuid,uuid,jsonb,jsonb,text,integer) from public,anon,authenticated;
grant execute on function private.save_calculation_settings(uuid,date,jsonb,text),
  public.save_calculation_settings(uuid,date,jsonb,text),
  private.save_inspection_assessment(uuid,uuid,jsonb,jsonb,text,integer),
  public.save_inspection_assessment(uuid,uuid,jsonb,jsonb,text,integer) to authenticated;

-- Published reports must be withdrawn, not deleted along with their immutable evidence.
revoke delete on public.reports from authenticated;
