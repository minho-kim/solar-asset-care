-- Partner and quote scaffolding for the MVP intermediary workflow.
-- Partners remain external records for now. A separate partner-user link and
-- private one-time token table allow a vendor portal or secure response link
-- to be added later without expanding organization member roles.

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  partner_type text not null check (partner_type in (
    'construction', 'maintenance', 'electrical', 'cleaning', 'dismantling', 'recycling'
  )),
  service_regions text[] not null default '{}',
  rating numeric(2,1) check (rating is null or rating between 0 and 5),
  transaction_count integer not null default 0 check (transaction_count >= 0),
  status text not null default 'active' check (status in ('active', 'inactive', 'blocked')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partner_private_details (
  partner_id uuid primary key references public.partners(id) on delete cascade,
  business_registration_number text,
  license_registration_number text,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partner_users (
  partner_id uuid not null references public.partners(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (partner_id, user_id)
);

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plant_id uuid not null references public.plants(id) on delete restrict,
  inspection_id uuid references public.inspections(id) on delete set null,
  maintenance_request_id uuid references public.maintenance_requests(id) on delete set null,
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  request_code text not null,
  title text not null check (length(trim(title)) between 1 and 200),
  scope_summary text,
  status text not null default 'draft' check (status in (
    'draft', 'requested', 'collecting', 'ready_for_selection', 'selected', 'completed', 'cancelled'
  )),
  response_due_at timestamptz,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, request_code)
);

create table public.quote_request_findings (
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  finding_id uuid not null references public.findings(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (quote_request_id, finding_id)
);

create table public.partner_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete restrict,
  status text not null default 'requested' check (status in (
    'requested', 'submitted', 'selected', 'not_selected', 'withdrawn', 'completed'
  )),
  amount_krw numeric(14,0) check (amount_krw is null or amount_krw >= 0),
  estimated_days integer check (estimated_days is null or estimated_days > 0),
  proposed_start_on date,
  valid_until date,
  scope text,
  conditions text,
  commission_rate numeric(5,2) not null default 0 check (commission_rate between 0 and 100),
  commission_amount_krw numeric(14,0) generated always as (
    case
      when amount_krw is null then null
      else round(amount_krw * commission_rate / 100)
    end
  ) stored,
  submitted_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz,
  submitted_at timestamptz,
  selected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_request_id, partner_id)
);

alter table public.quote_requests
  add column selected_quote_id uuid references public.partner_quotes(id) on delete set null;

create table private.partner_quote_access_tokens (
  quote_id uuid primary key references public.partner_quotes(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

revoke all on table private.partner_quote_access_tokens from public, anon, authenticated;

create index partners_org_status_name_idx
  on public.partners (organization_id, status, name);
create index partners_created_by_idx on public.partners (created_by)
  where created_by is not null;
create index partner_users_user_idx on public.partner_users (user_id, partner_id);
create index partner_users_invited_by_idx on public.partner_users (invited_by)
  where invited_by is not null;
create index quote_requests_plant_status_created_idx
  on public.quote_requests (plant_id, status, created_at desc);
create index quote_requests_inspection_idx on public.quote_requests (inspection_id)
  where inspection_id is not null;
create unique index quote_requests_maintenance_unique_idx
  on public.quote_requests (maintenance_request_id)
  where maintenance_request_id is not null;
create index quote_requests_requester_status_idx
  on public.quote_requests (requester_user_id, status, created_at desc);
create index quote_requests_requested_by_idx on public.quote_requests (requested_by)
  where requested_by is not null;
create index quote_requests_selected_quote_idx on public.quote_requests (selected_quote_id)
  where selected_quote_id is not null;
create index quote_request_findings_finding_idx
  on public.quote_request_findings (finding_id, quote_request_id);
create index partner_quotes_partner_status_idx
  on public.partner_quotes (partner_id, status, created_at desc);
create index partner_quotes_org_status_idx
  on public.partner_quotes (organization_id, status, created_at desc);
create index partner_quotes_submitted_by_idx on public.partner_quotes (submitted_by)
  where submitted_by is not null;
create index partner_quotes_created_by_idx on public.partner_quotes (created_by)
  where created_by is not null;

create trigger partners_set_updated_at before update on public.partners
  for each row execute function private.set_updated_at();
create trigger partner_private_details_set_updated_at before update on public.partner_private_details
  for each row execute function private.set_updated_at();
create trigger partner_users_set_updated_at before update on public.partner_users
  for each row execute function private.set_updated_at();
create trigger quote_requests_set_updated_at before update on public.quote_requests
  for each row execute function private.set_updated_at();
create trigger partner_quotes_set_updated_at before update on public.partner_quotes
  for each row execute function private.set_updated_at();

create or replace function private.validate_partner_quote_relations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plant_organization_id uuid;
  related_plant_id uuid;
  related_organization_id uuid;
  selected_request_id uuid;
begin
  if tg_table_name = 'quote_requests' then
    select organization_id into plant_organization_id
    from public.plants where id = new.plant_id;

    if plant_organization_id is null or new.organization_id <> plant_organization_id then
      raise exception '견적 요청의 조직과 발전소가 일치하지 않습니다.';
    end if;
    if not private.is_plant_requester(new.plant_id, new.requester_user_id)
      or not exists (
        select 1
        from public.organization_members membership
        where membership.organization_id = new.organization_id
          and membership.user_id = new.requester_user_id
          and membership.role = 'client'
          and membership.status = 'active'
      )
    then
      raise exception '견적 요청자는 해당 발전소의 활성 의뢰인이어야 합니다.';
    end if;

    if new.inspection_id is not null then
      select plant_id, organization_id into related_plant_id, related_organization_id
      from public.inspections where id = new.inspection_id;
      if related_plant_id is null
        or related_plant_id <> new.plant_id
        or related_organization_id <> new.organization_id
      then
        raise exception '견적 요청의 점검과 발전소가 일치하지 않습니다.';
      end if;
    end if;

    if new.maintenance_request_id is not null then
      select inspection.plant_id, maintenance.organization_id
      into related_plant_id, related_organization_id
      from public.maintenance_requests maintenance
      join public.inspections inspection on inspection.id = maintenance.inspection_id
      where maintenance.id = new.maintenance_request_id;
      if related_plant_id is null
        or related_plant_id <> new.plant_id
        or related_organization_id <> new.organization_id
      then
        raise exception '견적 요청의 유지보수 작업과 발전소가 일치하지 않습니다.';
      end if;
    end if;

    if new.selected_quote_id is not null then
      select quote_request_id into selected_request_id
      from public.partner_quotes where id = new.selected_quote_id;
      if selected_request_id is null or selected_request_id <> new.id then
        raise exception '선택 견적이 해당 견적 요청에 속하지 않습니다.';
      end if;
    end if;
  elsif tg_table_name = 'partner_quotes' then
    select request.organization_id into related_organization_id
    from public.quote_requests request
    where request.id = new.quote_request_id;

    if related_organization_id is null or new.organization_id <> related_organization_id then
      raise exception '업체 견적의 조직과 견적 요청이 일치하지 않습니다.';
    end if;
    if not exists (
      select 1 from public.partners partner
      where partner.id = new.partner_id
        and partner.organization_id = new.organization_id
    ) then
      raise exception '업체 견적의 업체와 조직이 일치하지 않습니다.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_partner_quote_relations()
  from public, anon, authenticated;

create trigger quote_requests_validate_relations
  before insert or update on public.quote_requests
  for each row execute function private.validate_partner_quote_relations();
create trigger partner_quotes_validate_relations
  before insert or update on public.partner_quotes
  for each row execute function private.validate_partner_quote_relations();

create or replace function private.validate_quote_request_finding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.quote_requests request
    join public.findings finding on finding.id = new.finding_id
    join public.inspections inspection on inspection.id = finding.inspection_id
    where request.id = new.quote_request_id
      and finding.organization_id = request.organization_id
      and inspection.plant_id = request.plant_id
      and (request.inspection_id is null or finding.inspection_id = request.inspection_id)
  ) then
    raise exception '조치 항목이 견적 요청의 발전소와 일치하지 않습니다.';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_quote_request_finding()
  from public, anon, authenticated;

create trigger quote_request_findings_validate_relations
  before insert or update on public.quote_request_findings
  for each row execute function private.validate_quote_request_finding();

create or replace function private.can_view_quote_request(p_quote_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.quote_requests request
    where request.id = p_quote_request_id
      and (
        private.has_org_role(request.organization_id, array['owner'])
        or (
          request.requester_user_id = (select auth.uid())
          and private.is_plant_requester(request.plant_id, (select auth.uid()))
        )
      )
  );
$$;

revoke all on function private.can_view_quote_request(uuid) from public, anon;
grant execute on function private.can_view_quote_request(uuid) to authenticated;

alter table public.partners enable row level security;
alter table public.partner_private_details enable row level security;
alter table public.partner_users enable row level security;
alter table public.quote_requests enable row level security;
alter table public.quote_request_findings enable row level security;
alter table public.partner_quotes enable row level security;

create policy partners_select_authorized on public.partners
  for select to authenticated
  using (
    (select private.has_org_role(organization_id, array['owner']))
    or exists (
      select 1
      from public.partner_quotes quote
      join public.quote_requests request on request.id = quote.quote_request_id
      where quote.partner_id = partners.id
        and quote.status in ('submitted', 'selected', 'not_selected', 'completed')
        and request.requester_user_id = (select auth.uid())
        and (select private.is_plant_requester(request.plant_id, (select auth.uid())))
    )
  );
create policy partners_insert_admin on public.partners
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner'])));
create policy partners_update_admin on public.partners
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])))
  with check ((select private.has_org_role(organization_id, array['owner'])));
create policy partners_delete_admin on public.partners
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])));

create policy partner_private_details_admin on public.partner_private_details
  for all to authenticated
  using (
    exists (
      select 1 from public.partners partner
      where partner.id = partner_private_details.partner_id
        and (select private.has_org_role(partner.organization_id, array['owner']))
    )
  )
  with check (
    exists (
      select 1 from public.partners partner
      where partner.id = partner_private_details.partner_id
        and (select private.has_org_role(partner.organization_id, array['owner']))
    )
  );

create policy partner_users_admin on public.partner_users
  for all to authenticated
  using (
    exists (
      select 1 from public.partners partner
      where partner.id = partner_users.partner_id
        and (select private.has_org_role(partner.organization_id, array['owner']))
    )
  )
  with check (
    exists (
      select 1 from public.partners partner
      where partner.id = partner_users.partner_id
        and (select private.has_org_role(partner.organization_id, array['owner']))
    )
  );

create policy quote_requests_select_authorized on public.quote_requests
  for select to authenticated
  using ((select private.can_view_quote_request(id)));
create policy quote_requests_insert_admin on public.quote_requests
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner'])));
create policy quote_requests_update_admin on public.quote_requests
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])))
  with check ((select private.has_org_role(organization_id, array['owner'])));
create policy quote_requests_delete_admin on public.quote_requests
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])));

create policy quote_request_findings_select_authorized on public.quote_request_findings
  for select to authenticated
  using ((select private.can_view_quote_request(quote_request_id)));
create policy quote_request_findings_admin on public.quote_request_findings
  for all to authenticated
  using (
    exists (
      select 1 from public.quote_requests request
      where request.id = quote_request_id
        and (select private.has_org_role(request.organization_id, array['owner']))
    )
  )
  with check (
    exists (
      select 1 from public.quote_requests request
      where request.id = quote_request_id
        and (select private.has_org_role(request.organization_id, array['owner']))
    )
  );

create policy partner_quotes_select_authorized on public.partner_quotes
  for select to authenticated
  using (
    (select private.has_org_role(organization_id, array['owner']))
    or (
      status in ('submitted', 'selected', 'not_selected', 'completed')
      and (select private.can_view_quote_request(quote_request_id))
    )
  );
create policy partner_quotes_insert_admin on public.partner_quotes
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner'])));
create policy partner_quotes_update_admin on public.partner_quotes
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])))
  with check ((select private.has_org_role(organization_id, array['owner'])));
create policy partner_quotes_delete_admin on public.partner_quotes
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['owner'])));

grant select, insert, update, delete on table public.partners to authenticated;
grant select, insert, update, delete on table public.partner_private_details to authenticated;
grant select, insert, update, delete on table public.partner_users to authenticated;
grant select, insert, update, delete on table public.quote_requests to authenticated;
grant select, insert, update, delete on table public.quote_request_findings to authenticated;
grant select, insert, update, delete on table public.partner_quotes to authenticated;

revoke all on table public.partners from anon;
revoke all on table public.partner_private_details from anon;
revoke all on table public.partner_users from anon;
revoke all on table public.quote_requests from anon;
revoke all on table public.quote_request_findings from anon;
revoke all on table public.partner_quotes from anon;

create or replace function private.select_partner_quote(p_quote_id uuid)
returns public.partner_quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  quote_row public.partner_quotes%rowtype;
  request_row public.quote_requests%rowtype;
  selected_quote public.partner_quotes%rowtype;
begin
  if actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select request.* into request_row
  from public.quote_requests request
  join public.partner_quotes quote on quote.quote_request_id = request.id
  where quote.id = p_quote_id
  for update of request;

  if not found then
    raise exception '선택할 견적을 찾을 수 없습니다.';
  end if;

  select * into quote_row from public.partner_quotes where id = p_quote_id;

  if not (
    private.has_org_role(request_row.organization_id, array['owner'])
    or (
      request_row.requester_user_id = actor_id
      and private.is_plant_requester(request_row.plant_id, actor_id)
    )
  ) then
    raise exception '이 견적을 선택할 권한이 없습니다.';
  end if;
  if request_row.status not in ('requested', 'collecting', 'ready_for_selection', 'selected') then
    raise exception '현재 상태에서는 업체를 선택할 수 없습니다.';
  end if;
  if quote_row.status not in ('submitted', 'selected', 'not_selected') then
    raise exception '제출이 완료된 견적만 선택할 수 있습니다.';
  end if;

  update public.partner_quotes
  set status = case when id = p_quote_id then 'selected' else 'not_selected' end,
      selected_at = case when id = p_quote_id then now() else null end
  where quote_request_id = request_row.id
    and status in ('submitted', 'selected', 'not_selected');

  update public.quote_requests
  set selected_quote_id = p_quote_id,
      status = 'selected'
  where id = request_row.id;

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    request_row.organization_id,
    actor_id,
    'quote.selected',
    'partner_quote',
    p_quote_id::text,
    jsonb_build_object(
      'quote_request_id', request_row.id,
      'partner_id', quote_row.partner_id,
      'amount_krw', quote_row.amount_krw
    )
  );

  select * into selected_quote from public.partner_quotes where id = p_quote_id;
  return selected_quote;
end;
$$;

create or replace function public.select_partner_quote(p_quote_id uuid)
returns public.partner_quotes
language sql
security invoker
set search_path = ''
as $$ select private.select_partner_quote(p_quote_id); $$;

revoke all on function private.select_partner_quote(uuid) from public, anon;
grant execute on function private.select_partner_quote(uuid) to authenticated;
revoke all on function public.select_partner_quote(uuid) from public, anon;
grant execute on function public.select_partner_quote(uuid) to authenticated;

comment on table public.partners is
  'Public-facing partner company data; private contacts and registration details are stored separately.';
comment on table public.partner_users is
  'Reserved link between Auth users and partner companies for a future partner portal.';
comment on table private.partner_quote_access_tokens is
  'Hashed one-time response tokens reserved for future passwordless quote submission links.';
comment on table public.quote_requests is
  'A requester-visible request that groups up to several partner quote responses.';
comment on function public.select_partner_quote(uuid) is
  'Selects one submitted partner quote for the current requester plant and records an audit event.';
