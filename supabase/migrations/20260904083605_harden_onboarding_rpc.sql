-- Remote migration version: 20260904083605.
-- Keep security-definer implementations outside the Data API schema. Public
-- RPC wrappers execute with the caller's rights and can only reach the checked
-- private implementation through an explicit grant.

create index organization_bootstrap_tokens_used_by_idx
  on private.organization_bootstrap_tokens (used_by)
  where used_by is not null;

alter function public.bootstrap_organization(text, text, text)
  set schema private;
alter function public.add_organization_member_by_email(uuid, text, text)
  set schema private;

create function public.bootstrap_organization(
  p_name text,
  p_slug text,
  p_setup_code text
)
returns table (organization_id uuid, organization_name text, member_role text)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.bootstrap_organization(p_name, p_slug, p_setup_code);
$$;

create function public.add_organization_member_by_email(
  p_organization_id uuid,
  p_email text,
  p_role text
)
returns table (user_id uuid, email text, member_role text)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.add_organization_member_by_email(
    p_organization_id,
    p_email,
    p_role
  );
$$;

revoke all on function private.bootstrap_organization(text, text, text) from public;
revoke all on function private.bootstrap_organization(text, text, text) from anon;
grant execute on function private.bootstrap_organization(text, text, text) to authenticated;

revoke all on function private.add_organization_member_by_email(uuid, text, text) from public;
revoke all on function private.add_organization_member_by_email(uuid, text, text) from anon;
grant execute on function private.add_organization_member_by_email(uuid, text, text) to authenticated;

revoke all on function public.bootstrap_organization(text, text, text) from public;
revoke all on function public.bootstrap_organization(text, text, text) from anon;
grant execute on function public.bootstrap_organization(text, text, text) to authenticated;

revoke all on function public.add_organization_member_by_email(uuid, text, text) from public;
revoke all on function public.add_organization_member_by_email(uuid, text, text) from anon;
grant execute on function public.add_organization_member_by_email(uuid, text, text) to authenticated;

comment on function public.bootstrap_organization(text, text, text) is
  'Caller-rights RPC wrapper for the checked private organization bootstrap implementation.';
comment on function public.add_organization_member_by_email(uuid, text, text) is
  'Caller-rights RPC wrapper for the checked private member activation implementation.';
