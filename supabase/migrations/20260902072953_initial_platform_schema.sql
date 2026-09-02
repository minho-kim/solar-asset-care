-- Solar Asset Care: initial multi-tenant platform schema.
-- Timestamps represent absolute instants (`timestamptz`). The UI renders them
-- in each plant's IANA timezone, with Asia/Seoul as the current default.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  default_timezone text not null default 'Asia/Seoul',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in (
    'owner', 'operator', 'field_technician', 'expert', 'approver', 'client', 'maintainer'
  )),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.plants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  address text,
  timezone text not null default 'Asia/Seoul',
  capacity_kw numeric(12,3) check (capacity_kw is null or capacity_kw >= 0),
  commissioned_on date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plant_id uuid not null references public.plants(id) on delete restrict,
  inspection_code text not null,
  purpose text,
  status text not null default 'requested' check (status in (
    'requested', 'scheduled', 'uploading', 'quality_review', 'analysis',
    'expert_review', 'approval', 'published', 'closed', 'cancelled'
  )),
  requested_on date not null default current_date,
  scheduled_at timestamptz,
  due_at timestamptz,
  capture_timezone text not null default 'Asia/Seoul',
  assigned_field_user_id uuid references auth.users(id) on delete set null,
  assigned_expert_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, inspection_code)
);

create table public.inspection_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  kind text not null check (kind in (
    'thermal_original', 'visible_original', 'preview', 'analysis_overlay',
    'maintenance_before', 'maintenance_after'
  )),
  storage_bucket text not null,
  storage_path text not null,
  original_name text not null,
  mime_type text,
  bytes bigint check (bytes is null or bytes >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz,
  capture_timezone text not null default 'Asia/Seoul',
  quality_status text not null default 'pending' check (quality_status in (
    'pending', 'valid', 'needs_review', 'rejected'
  )),
  paired_file_id uuid references public.inspection_files(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  algorithm_key text not null,
  algorithm_version text not null,
  status text not null default 'queued' check (status in (
    'queued', 'running', 'succeeded', 'failed', 'cancelled'
  )),
  input_manifest jsonb not null default '{}'::jsonb,
  result_summary jsonb,
  error_code text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  check (finished_at is null or started_at is null or finished_at >= started_at)
);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  analysis_run_id uuid references public.analysis_runs(id) on delete set null,
  source text not null check (source in ('rule_candidate', 'expert_manual')),
  kind text not null check (kind in (
    'hotspot', 'coldspot', 'mismatch', 'damage', 'quality_issue', 'other'
  )),
  severity text not null default 'review' check (severity in (
    'info', 'review', 'minor', 'major', 'critical'
  )),
  relative_heat_score numeric(5,2) check (
    relative_heat_score is null or relative_heat_score between 0 and 100
  ),
  temperature_max_c numeric(7,2),
  temperature_delta_c numeric(7,2),
  region jsonb,
  disposition text not null default 'pending' check (disposition in (
    'pending', 'accepted', 'modified', 'rejected'
  )),
  expert_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in (
    'draft', 'review', 'approved', 'published', 'withdrawn'
  )),
  title text not null,
  storage_bucket text,
  storage_path text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  withdrawn_at timestamptz,
  change_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, version)
);

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete restrict,
  finding_id uuid references public.findings(id) on delete set null,
  title text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'requested' check (status in (
    'requested', 'assigned', 'quoted', 'scheduled', 'in_progress', 'completed', 'cancelled'
  )),
  assignee_user_id uuid references auth.users(id) on delete set null,
  vendor_name text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  completion_note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or completed_at >= created_at)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  occurred_at timestamptz not null default now(),
  request_id text,
  metadata jsonb not null default '{}'::jsonb
);

create index organization_members_user_active_idx
  on public.organization_members (user_id, organization_id)
  where status = 'active';
create index plants_org_idx on public.plants (organization_id, name);
create index inspections_org_status_due_idx on public.inspections (organization_id, status, due_at);
create index inspections_plant_idx on public.inspections (plant_id, created_at desc);
create index inspection_files_inspection_kind_idx
  on public.inspection_files (inspection_id, kind, created_at);
create index analysis_runs_inspection_idx
  on public.analysis_runs (inspection_id, requested_at desc);
create index findings_inspection_disposition_idx
  on public.findings (inspection_id, disposition, severity);
create index reports_org_status_idx
  on public.reports (organization_id, status, published_at desc);
create index maintenance_org_status_idx
  on public.maintenance_requests (organization_id, status, scheduled_at);
create index audit_events_org_time_idx
  on public.audit_events (organization_id, occurred_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, 'user'), '@', 1)),
    new.email
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function private.has_org_role(
  p_organization_id uuid,
  p_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (p_roles is null or membership.role = any (p_roles))
  );
$$;

create or replace function private.shares_organization_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members me
    join public.organization_members them
      on them.organization_id = me.organization_id
     and them.status = 'active'
    where me.user_id = (select auth.uid())
      and me.status = 'active'
      and them.user_id = p_user_id
  );
$$;

create or replace function private.storage_org_access(
  p_object_name text,
  p_roles text[] default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  first_segment text;
  parsed_organization_id uuid;
begin
  first_segment := split_part(p_object_name, '/', 1);
  if first_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;
  parsed_organization_id := first_segment::uuid;
  return private.has_org_role(parsed_organization_id, p_roles);
end;
$$;

revoke all on function private.handle_new_user() from public;
revoke all on function private.has_org_role(uuid, text[]) from public;
revoke all on function private.shares_organization_with(uuid) from public;
revoke all on function private.storage_org_access(text, text[]) from public;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;
grant execute on function private.shares_organization_with(uuid) to authenticated;
grant execute on function private.storage_org_access(text, text[]) to authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger organization_members_set_updated_at before update on public.organization_members
  for each row execute function private.set_updated_at();
create trigger plants_set_updated_at before update on public.plants
  for each row execute function private.set_updated_at();
create trigger inspections_set_updated_at before update on public.inspections
  for each row execute function private.set_updated_at();
create trigger findings_set_updated_at before update on public.findings
  for each row execute function private.set_updated_at();
create trigger reports_set_updated_at before update on public.reports
  for each row execute function private.set_updated_at();
create trigger maintenance_requests_set_updated_at before update on public.maintenance_requests
  for each row execute function private.set_updated_at();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.plants enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_files enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.findings enable row level security;
alter table public.reports enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_select_member on public.organizations
  for select to authenticated using (private.has_org_role(id, null));
create policy profiles_select_shared_org on public.profiles
  for select to authenticated using (
    (select auth.uid()) = user_id or private.shares_organization_with(user_id)
  );
create policy profiles_update_self on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy organization_members_select_member on public.organization_members
  for select to authenticated using (private.has_org_role(organization_id, null));
create policy organization_members_write_owner on public.organization_members
  for all to authenticated using (private.has_org_role(organization_id, array['owner']))
  with check (private.has_org_role(organization_id, array['owner']));

create policy plants_select_member on public.plants
  for select to authenticated using (private.has_org_role(organization_id, null));
create policy plants_write_operator on public.plants
  for all to authenticated using (private.has_org_role(organization_id, array['owner', 'operator']))
  with check (private.has_org_role(organization_id, array['owner', 'operator']));

create policy inspections_select_member on public.inspections
  for select to authenticated using (private.has_org_role(organization_id, null));
create policy inspections_write_staff on public.inspections
  for all to authenticated using (
    private.has_org_role(organization_id, array['owner', 'operator', 'field_technician', 'expert', 'approver'])
  ) with check (
    private.has_org_role(organization_id, array['owner', 'operator', 'field_technician', 'expert', 'approver'])
  );

create policy inspection_files_select_staff on public.inspection_files
  for select to authenticated using (
    private.has_org_role(organization_id, array['owner', 'operator', 'field_technician', 'expert', 'approver', 'maintainer'])
  );
create policy inspection_files_write_staff on public.inspection_files
  for all to authenticated using (
    private.has_org_role(organization_id, array['owner', 'operator', 'field_technician', 'expert'])
  ) with check (
    private.has_org_role(organization_id, array['owner', 'operator', 'field_technician', 'expert'])
  );

create policy analysis_runs_select_staff on public.analysis_runs
  for select to authenticated using (
    private.has_org_role(organization_id, array['owner', 'operator', 'expert', 'approver'])
  );
create policy analysis_runs_write_staff on public.analysis_runs
  for all to authenticated using (
    private.has_org_role(organization_id, array['owner', 'operator', 'expert'])
  ) with check (
    private.has_org_role(organization_id, array['owner', 'operator', 'expert'])
  );

create policy findings_select_member on public.findings
  for select to authenticated using (private.has_org_role(organization_id, null));
create policy findings_write_expert on public.findings
  for all to authenticated using (
    private.has_org_role(organization_id, array['owner', 'operator', 'expert'])
  ) with check (
    private.has_org_role(organization_id, array['owner', 'operator', 'expert'])
  );

create policy reports_select_member on public.reports
  for select to authenticated using (private.has_org_role(organization_id, null));
create policy reports_write_staff on public.reports
  for all to authenticated using (
    private.has_org_role(organization_id, array['owner', 'operator', 'expert', 'approver'])
  ) with check (
    private.has_org_role(organization_id, array['owner', 'operator', 'expert', 'approver'])
  );

create policy maintenance_select_member on public.maintenance_requests
  for select to authenticated using (private.has_org_role(organization_id, null));
create policy maintenance_write_staff on public.maintenance_requests
  for all to authenticated using (
    private.has_org_role(organization_id, array['owner', 'operator', 'maintainer'])
  ) with check (
    private.has_org_role(organization_id, array['owner', 'operator', 'maintainer'])
  );

create policy audit_events_select_auditor on public.audit_events
  for select to authenticated using (
    private.has_org_role(organization_id, array['owner', 'operator', 'approver'])
  );

grant all on table public.organizations to authenticated;
grant all on table public.profiles to authenticated;
grant all on table public.organization_members to authenticated;
grant all on table public.plants to authenticated;
grant all on table public.inspections to authenticated;
grant all on table public.inspection_files to authenticated;
grant all on table public.analysis_runs to authenticated;
grant all on table public.findings to authenticated;
grant all on table public.reports to authenticated;
grant all on table public.maintenance_requests to authenticated;
grant all on table public.audit_events to authenticated;
grant usage, select on all sequences in schema public to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('inspection-originals', 'inspection-originals', false, 52428800,
    array['image/jpeg', 'image/png', 'image/tiff', 'application/octet-stream']),
  ('inspection-derived', 'inspection-derived', false, 20971520,
    array['image/jpeg', 'image/png', 'image/webp', 'application/json']),
  ('reports', 'reports', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy storage_originals_select_staff on storage.objects
  for select to authenticated using (
    bucket_id = any (array['inspection-originals', 'inspection-derived'])
    and private.storage_org_access(name, array['owner', 'operator', 'field_technician', 'expert', 'approver', 'maintainer'])
  );
create policy storage_originals_insert_staff on storage.objects
  for insert to authenticated with check (
    bucket_id = any (array['inspection-originals', 'inspection-derived'])
    and private.storage_org_access(name, array['owner', 'operator', 'field_technician', 'expert'])
  );
create policy storage_originals_update_staff on storage.objects
  for update to authenticated using (
    bucket_id = any (array['inspection-originals', 'inspection-derived'])
    and private.storage_org_access(name, array['owner', 'operator', 'field_technician', 'expert'])
  ) with check (
    bucket_id = any (array['inspection-originals', 'inspection-derived'])
    and private.storage_org_access(name, array['owner', 'operator', 'field_technician', 'expert'])
  );
create policy storage_originals_delete_operator on storage.objects
  for delete to authenticated using (
    bucket_id = any (array['inspection-originals', 'inspection-derived'])
    and private.storage_org_access(name, array['owner', 'operator'])
  );

create policy storage_reports_select_member on storage.objects
  for select to authenticated using (
    bucket_id = 'reports' and private.storage_org_access(name, null)
  );
create policy storage_reports_insert_staff on storage.objects
  for insert to authenticated with check (
    bucket_id = 'reports'
    and private.storage_org_access(name, array['owner', 'operator', 'expert', 'approver'])
  );
create policy storage_reports_update_staff on storage.objects
  for update to authenticated using (
    bucket_id = 'reports'
    and private.storage_org_access(name, array['owner', 'operator', 'expert', 'approver'])
  ) with check (
    bucket_id = 'reports'
    and private.storage_org_access(name, array['owner', 'operator', 'expert', 'approver'])
  );
create policy storage_reports_delete_operator on storage.objects
  for delete to authenticated using (
    bucket_id = 'reports' and private.storage_org_access(name, array['owner', 'operator'])
  );

comment on column public.organizations.default_timezone is
  'IANA timezone used for display and local scheduling; timestamps remain timestamptz.';
comment on column public.plants.timezone is
  'IANA timezone for the physical plant. Current default is Asia/Seoul.';
comment on column public.inspections.capture_timezone is
  'Original inspection/capture timezone retained alongside timestamptz values.';
comment on column public.inspection_files.capture_timezone is
  'Original capture timezone retained for camera metadata interpretation.';
