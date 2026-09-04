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
  id, organization_id, name, code, capacity_kw
) values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201',
  '수용시험 발전소',
  'ACCEPT-001',
  100
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
begin
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
  select * into report_row
  from public.transition_report_status(report_row.id, 'published', null);

  if report_row.status <> 'published'
    or report_row.approved_at is null
    or report_row.published_at is null
  then
    raise exception 'valid report workflow did not publish';
  end if;

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
select 'report_and_analysis_workflow' as test_name, 'pass' as result;
rollback;
