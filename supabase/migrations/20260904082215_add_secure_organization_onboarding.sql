-- Remote migration version: 20260904082215.
-- Secure first-organization bootstrap and owner-managed member activation.
-- The bootstrap secret is stored only as a SHA-256 digest and is consumed once.

create table private.organization_bootstrap_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  label text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

revoke all on table private.organization_bootstrap_tokens from public;
revoke all on table private.organization_bootstrap_tokens from anon;
revoke all on table private.organization_bootstrap_tokens from authenticated;

insert into private.organization_bootstrap_tokens (token_hash, label, expires_at)
values (
  decode('c501b94c52d6685c381c9b484fc6c2a0b8ab89d3948093142ccc1c33a4b5a21f', 'hex'),
  'initial SolarScope owner',
  now() + interval '30 days'
);

create policy organizations_update_owner on public.organizations
  for update to authenticated
  using (private.has_org_role(id, array['owner']))
  with check (private.has_org_role(id, array['owner']));

create or replace function public.bootstrap_organization(
  p_name text,
  p_slug text,
  p_setup_code text
)
returns table (organization_id uuid, organization_name text, member_role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  token_id uuid;
  created_organization_id uuid;
  normalized_name text := trim(p_name);
  normalized_slug text := lower(trim(p_slug));
begin
  if actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = actor_id
      and email_confirmed_at is not null
      and deleted_at is null
  ) then
    raise exception '이메일 인증을 먼저 완료해 주세요.';
  end if;

  if normalized_name = '' or length(normalized_name) > 160 then
    raise exception '조직명은 1~160자로 입력해 주세요.';
  end if;

  if normalized_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    raise exception '조직 식별자는 영문 소문자, 숫자, 하이픈으로 2~63자여야 합니다.';
  end if;

  if exists (
    select 1 from public.organization_members where user_id = actor_id
  ) then
    raise exception '이미 조직에 연결된 사용자입니다.';
  end if;

  select token.id
    into token_id
    from private.organization_bootstrap_tokens token
   where token.token_hash = extensions.digest(
     pg_catalog.convert_to(pg_catalog.upper(pg_catalog.trim(p_setup_code)), 'UTF8'),
     'sha256'
   )
     and token.used_at is null
     and token.expires_at > now()
   for update;

  if token_id is null then
    raise exception '개설 코드가 올바르지 않거나 만료되었습니다.';
  end if;

  insert into public.organizations (name, slug)
  values (normalized_name, normalized_slug)
  returning id into created_organization_id;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    joined_at
  )
  values (
    created_organization_id,
    actor_id,
    'owner',
    'active',
    now()
  );

  update private.organization_bootstrap_tokens
     set used_at = now(),
         used_by = actor_id
   where id = token_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    created_organization_id,
    actor_id,
    'organization.bootstrapped',
    'organization',
    created_organization_id::text,
    jsonb_build_object('slug', normalized_slug)
  );

  return query
  select created_organization_id, normalized_name, 'owner'::text;
end;
$$;

create or replace function public.add_organization_member_by_email(
  p_organization_id uuid,
  p_email text,
  p_role text
)
returns table (user_id uuid, email text, member_role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_user_id uuid;
  target_email text;
  normalized_role text := lower(trim(p_role));
begin
  if actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not private.has_org_role(p_organization_id, array['owner']) then
    raise exception '조직 소유자만 사용자를 추가할 수 있습니다.';
  end if;

  if normalized_role not in (
    'owner', 'operator', 'field_technician', 'expert',
    'approver', 'client', 'maintainer'
  ) then
    raise exception '지원하지 않는 역할입니다.';
  end if;

  select users.id, users.email
    into target_user_id, target_email
    from auth.users users
   where lower(users.email) = lower(trim(p_email))
     and users.email_confirmed_at is not null
     and users.deleted_at is null
   limit 1;

  if target_user_id is null then
    raise exception '가입 및 이메일 인증을 완료한 사용자를 찾을 수 없습니다.';
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    joined_at
  )
  values (
    p_organization_id,
    target_user_id,
    normalized_role,
    'active',
    now()
  )
  on conflict (organization_id, user_id)
  do update set
    role = excluded.role,
    status = 'active',
    joined_at = coalesce(public.organization_members.joined_at, now());

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_organization_id,
    actor_id,
    'organization.member_saved',
    'organization_member',
    target_user_id::text,
    jsonb_build_object('email', target_email, 'role', normalized_role)
  );

  return query select target_user_id, target_email, normalized_role;
end;
$$;

revoke all on function public.bootstrap_organization(text, text, text) from public;
revoke all on function public.bootstrap_organization(text, text, text) from anon;
grant execute on function public.bootstrap_organization(text, text, text) to authenticated;

revoke all on function public.add_organization_member_by_email(uuid, text, text) from public;
revoke all on function public.add_organization_member_by_email(uuid, text, text) from anon;
grant execute on function public.add_organization_member_by_email(uuid, text, text) to authenticated;

comment on function public.bootstrap_organization(text, text, text) is
  'Consumes a one-time secret after email verification to create the first organization and owner membership.';
comment on function public.add_organization_member_by_email(uuid, text, text) is
  'Lets an organization owner activate a previously registered and verified user by email.';
