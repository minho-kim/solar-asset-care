-- Transactional acceptance test for relative analysis and report publication.
-- The final ROLLBACK guarantees that no test user or business row remains.

begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
) values (
  '00000000-0000-4000-8000-000000000101',
  'authenticated',
  'authenticated',
  'acceptance-owner@example.invalid',
  '',
  now(),
  '{}'::jsonb,
  '{"name":"수용시험 관리자"}'::jsonb,
  now(),
  now(),
  false,
  false
);

insert into public.organizations (id, name, slug, is_primary_operator)
values (
  '00000000-0000-4000-8000-000000000201',
  '수용시험 조직',
  'acceptance-test-org',
  false
);

insert into public.organization_members (
  organization_id, user_id, role, status, joined_at
) values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  'owner',
  'active',
  now()
);

insert into public.plants (
  id, organization_id, name, code, capacity_kw, commissioned_on
) values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201',
  '수용시험 발전소',
  'ACCEPT-001',
  100, '2020-01-01'
);

insert into public.inspections (
  id, organization_id, plant_id, inspection_code, status,
  assigned_expert_user_id, created_by
) values (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000301',
  'ACCEPT-INS-001',
  'quality_review',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000101'
);

insert into public.inspection_files (
  id, organization_id, inspection_id, kind, storage_bucket,
  storage_path, original_name, mime_type, bytes, sha256, created_by
) values (
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000401',
  'thermal_original',
  'inspection-originals',
  'acceptance/test.png',
  'test.png',
  'image/png',
  100,
  repeat('a', 64),
  '00000000-0000-4000-8000-000000000101'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',
  true
);

do $$
declare
  run_row public.analysis_runs%rowtype;
  report_row public.reports%rowtype;
  caught_expected boolean;
  settings_row public.calculation_settings%rowtype;
  assessment_row public.inspection_assessments%rowtype;
  snapshot_hash text;
begin
  caught_expected := false;
  begin
    delete from public.organization_members where organization_id='00000000-0000-4000-8000-000000000201'
      and user_id='00000000-0000-4000-8000-000000000101';
  exception when others then caught_expected:=position('최소 한 명' in sqlerrm)>0 or sqlstate='42501'; end;
  if not caught_expected then raise exception 'last administrator removal was permitted'; end if;
  select * into run_row
  from public.start_relative_analysis(
    '00000000-0000-4000-8000-000000000501',
    100
  );

  select * into run_row
  from public.complete_relative_analysis(
    run_row.id,
    '{"heatIndex":80,"contrast":25,"hotCandidates":1,"coldCandidates":0}'::jsonb,
    '[{"kind":"hot","x":0.1,"y":0.1,"width":0.2,"height":0.2,"area_percent":4,"score":82}]'::jsonb
  );

  if run_row.status <> 'succeeded' then
    raise exception 'analysis did not succeed';
  end if;

  caught_expected := false;
  begin
    perform public.start_relative_analysis(
      '00000000-0000-4000-8000-000000000501',
      100
    );
  exception when others then
    caught_expected := position('이미 완료' in sqlerrm) > 0;
  end;
  if not caught_expected then
    raise exception 'duplicate successful analysis was not rejected';
  end if;

  update public.findings
  set disposition = 'accepted',
      reviewed_by = '00000000-0000-4000-8000-000000000101',
      reviewed_at = now()
  where analysis_run_id = run_row.id;

  select * into report_row
  from public.create_report_draft(
    '00000000-0000-4000-8000-000000000401',
    '수용시험 보고서'
  );

  caught_expected := false;
  begin
    perform public.transition_report_status(report_row.id, 'review', null);
  exception when others then
    caught_expected := position('촬영조건·발전량 평가' in sqlerrm)>0;
  end;
  if not caught_expected then raise exception 'missing assessment did not block review'; end if;

  select * into settings_row from public.save_calculation_settings(
    '00000000-0000-4000-8000-000000000201', '2020-01-01',
    '{"sunHours":3.6,"degradationRatePercent":0.6,"orientationFactor":1,"selfUseTariff":165,"smp":125,"rec":72,"recWeight":1,"prNormal":0.85,"prWarning":0.7,"irradianceMinimum":600,"windWarning":7,"angleMinimum":10,"angleMaximum":80,"distanceMaximum":30,"deltaTWarning":5,"deltaTCritical":10,"improvementRates":{"soiling":0.9,"string":0.95,"inverter":1,"diode":0.7,"cell_pid":0.4}}',
    'Rollback-only acceptance fixture, not operational criteria');
  select * into assessment_row from public.save_inspection_assessment(
    '00000000-0000-4000-8000-000000000401', settings_row.id,
    jsonb_build_object('measuredAt',now()-interval '1 hour','source','test fixture','irradiance',599,'wind',3,'ambientTemperature',25,'angle',45,'distance',20),
    '{"periodStart":"2026-01-01","periodEnd":"2026-08-31","actualGenerationKwh":60000,"operationType":"generation","repairCost":2000000,"defectType":"soiling","generationSource":"test fixture"}', '', 0);
  if jsonb_array_length(assessment_row.warnings)<>1 then raise exception 'irradiance warning missing'; end if;
  caught_expected := false;
  begin
    perform public.transition_report_status(report_row.id, 'review', null);
  exception when others then caught_expected := position('촬영조건 기준' in sqlerrm)>0;
  end;
  if not caught_expected then raise exception 'unsafe capture did not block review'; end if;
  select * into assessment_row from public.save_inspection_assessment(
    assessment_row.inspection_id, settings_row.id, assessment_row.capture || '{"irradiance":600}',
    assessment_row.calculation_input,'',1);
  if (assessment_row.result->>'periodDays')::int<>243
    or abs((assessment_row.result->>'expectedGenerationKwh')::numeric - 100*3.6*243*power(0.994::numeric,6))>0.000001 then
    raise exception 'server calculation does not match reference';
  end if;
  caught_expected := false;
  begin
    perform public.save_inspection_assessment(assessment_row.inspection_id,settings_row.id,assessment_row.capture,assessment_row.calculation_input,'',1);
  exception when others then caught_expected := position('다른 사용자가 변경' in sqlerrm)>0;
  end;
  if not caught_expected then raise exception 'stale write was not rejected'; end if;

  caught_expected := false;
  begin
    perform public.transition_report_status(report_row.id, 'published', null);
  exception when others then
    caught_expected := position('허용되지 않은' in sqlerrm) > 0;
  end;
  if not caught_expected then
    raise exception 'draft-to-published transition was not rejected';
  end if;

  select * into report_row
  from public.transition_report_status(report_row.id, 'review', null);
  select * into report_row
  from public.transition_report_status(report_row.id, 'approved', null);
  caught_expected := false;
  begin perform public.transition_report_status(report_row.id,'published',null);
  exception when others then caught_expected:=position('PDF를 생성' in sqlerrm)>0; end;
  if not caught_expected then raise exception 'publication without PDF was permitted'; end if;
  -- SQL-only storage metadata fixture; physical PDF generation is tested separately.
  select sha256 into snapshot_hash from public.report_snapshots where report_id=report_row.id;
  insert into storage.objects(bucket_id,name,metadata,owner_id)
    values('reports',report_row.organization_id::text||'/'||report_row.inspection_id::text||'/'||report_row.id::text||'/'||snapshot_hash||'.pdf',
      '{"size":100,"mimetype":"application/pdf"}',auth.uid()::text);
  perform public.archive_report_pdf(report_row.id,snapshot_hash,repeat('b',64),100,'text-assessment-v1');
  select * into report_row
  from public.transition_report_status(report_row.id, 'published', null);

  if report_row.status <> 'published'
    or report_row.approved_at is null
    or report_row.published_at is null
  then
    raise exception 'valid report workflow did not publish';
  end if;

  select sha256 into snapshot_hash from public.report_snapshots where report_id=report_row.id;
  if snapshot_hash is null then raise exception 'snapshot was not created'; end if;
  update public.plants set name='수정된 발전소 이름',capacity_kw=200 where id='00000000-0000-4000-8000-000000000301';
  update public.findings set expert_note='발행 후 수정' where analysis_run_id=run_row.id;
  if (select content->'plant'->>'name' from public.report_snapshots where report_id=report_row.id)<>'수용시험 발전소'
    or (select sha256 from public.report_snapshots where report_id=report_row.id)<>snapshot_hash then
    raise exception 'published content changed with source data';
  end if;
  caught_expected := false;
  begin
    update public.report_snapshots set content='{}' where report_id=report_row.id;
  exception when insufficient_privilege then caught_expected:=true; end;
  if not caught_expected then raise exception 'snapshot is writable'; end if;
  caught_expected := false;
  begin
    update public.calculation_settings set values='{}' where id=settings_row.id;
  exception when insufficient_privilege then caught_expected:=true; end;
  if not caught_expected then raise exception 'settings history is writable'; end if;
  caught_expected := false;
  begin
    update public.reports set title='tampered' where id=report_row.id;
  exception when others then caught_expected:=position('직접 변경' in sqlerrm)>0; end;
  if not caught_expected then raise exception 'published title is writable'; end if;

  caught_expected := false;
  begin
    update public.reports
    set status = 'draft'
    where id = report_row.id;
  exception when insufficient_privilege then
    caught_expected := true;
  end;
  if not caught_expected then
    raise exception 'direct report status update was not blocked';
  end if;
end
$$;

reset role;

-- Two organizations, an assigned/unassigned expert and two requesters.
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
  'role-acceptance-'||n||'@example.invalid','',now(),'{}','{}',now(),now(),false,false
from generate_series(102,106) n;
insert into public.organizations(id,name,slug,is_primary_operator)
values('00000000-0000-4000-8000-000000000202','수용시험 다른 조직','acceptance-other-org',false);
insert into public.organization_members(organization_id,user_id,role,status,joined_at) values
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000102','owner','active',now()),
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000103','expert','active',now()),
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000104','client','active',now()),
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000105','client','active',now()),
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000106','expert','active',now());
insert into public.plant_requesters(plant_id,requester_user_id)
values('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000104');
update public.inspections set assigned_expert_user_id='00000000-0000-4000-8000-000000000103'
where id='00000000-0000-4000-8000-000000000401';

set local role authenticated;
do $$
declare n integer; r uuid; a public.inspection_assessments%rowtype; caught boolean; snapshot_hash text;
begin
  -- Other organization owner cannot discover records or write via RPC.
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}',true);
  if exists(select 1 from public.inspection_assessments) or exists(select 1 from public.report_snapshots)
    or exists(select 1 from public.calculation_settings) then raise exception 'cross-organization read leaked'; end if;
  caught:=false;
  begin perform public.save_calculation_settings('00000000-0000-4000-8000-000000000201','2026-01-01','{}','attack');
  exception when others then caught:=position('관리자만' in sqlerrm)>0; end;
  if not caught then raise exception 'cross-organization settings write permitted'; end if;
  -- A linked requester can read ONLY the issued snapshot, never internal assessment/settings.
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000104","role":"authenticated"}',true);
  select report_id,sha256 into r,snapshot_hash from public.report_snapshots;
  if r is null or exists(select 1 from public.inspection_assessments) or exists(select 1 from public.calculation_settings) then
    raise exception 'requester published/internal visibility is wrong'; end if;
  -- A different requester and unassigned expert see no snapshot or assessment.
  for n in 105..106 loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true);
    if exists(select 1 from public.report_snapshots) or exists(select 1 from public.inspection_assessments) then
      raise exception 'unassigned user can read inspection'; end if;
  end loop;
  -- Assigned expert can assess but cannot change criteria, approve a report or authorize exceptions.
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}',true);
  select * into a from public.inspection_assessments;
  if a.inspection_id is null or not exists(select 1 from public.report_snapshots) then raise exception 'assigned expert cannot read'; end if;
  caught:=false;
  begin perform public.save_inspection_assessment(a.inspection_id,a.settings_id,a.capture,a.calculation_input,'expert exception',a.revision);
  exception when others then caught:=position('관리자만' in sqlerrm)>0; end;
  if not caught then raise exception 'expert can authorize exception'; end if;
  select * into a from public.save_inspection_assessment(a.inspection_id,a.settings_id,a.capture,a.calculation_input,'',a.revision);
  if a.revision<>3 then raise exception 'expert assessment write failed'; end if;
  caught:=false;
  begin perform public.transition_report_status(r,'withdrawn','expert withdrawal');
  exception when others then caught:=position('관리자만' in sqlerrm)>0; end;
  if not caught then raise exception 'expert can withdraw report'; end if;
  -- Temperature without measurement evidence is rejected; manual findings are audited.
  caught:=false;
  begin insert into public.findings(organization_id,inspection_id,source,kind,temperature_max_c,disposition,expert_note)
    values(a.organization_id,a.inspection_id,'expert_manual','hotspot',70,'accepted','test');
  exception when others then caught:=position('측정 장비' in sqlerrm)>0; end;
  if not caught then raise exception 'temperature without evidence accepted'; end if;
  insert into public.findings(organization_id,inspection_id,source,kind,temperature_max_c,temperature_delta_c,measurement_source,disposition,expert_note,defect_type,location_label)
    values(a.organization_id,a.inspection_id,'expert_manual','hotspot',70,12,'Test instrument record','accepted','test','cell_hotspot','A-01');
  if (select sha256 from public.report_snapshots where report_id=r)<>snapshot_hash then raise exception 'new finding altered published report'; end if;
  -- Withdrawal removes requester access, even with the same JWT.
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',true);
  perform public.transition_report_status(r,'withdrawn','수용시험 회수');
  if not exists(select 1 from public.audit_events where action='finding.created') then raise exception 'finding audit missing'; end if;
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000104","role":"authenticated"}',true);
  if exists(select 1 from public.report_snapshots) then raise exception 'withdrawn report still visible to requester'; end if;
end $$;
reset role;
select 'analysis_assessment_snapshot_manual_finding_and_two_tenant_roles' as test_name, 'pass' as result;
rollback;
