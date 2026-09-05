-- Keep the last-admin safeguard for all live organizations. A trusted database
-- deletion of the parent organization must also be able to remove its memberships.
create or replace function private.prevent_last_active_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role='owner' and old.status='active' and
    (tg_op='DELETE' or new.role<>'owner' or new.status<>'active') then
    perform 1 from public.organizations where id=old.organization_id for update;
    if not found and tg_op='DELETE' then return old; end if;
    if not exists(select 1 from public.organization_members other
      where other.organization_id=old.organization_id and other.user_id<>old.user_id
        and other.role='owner' and other.status='active') then
      raise exception '최소 한 명의 활성 관리자가 필요합니다.';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.prevent_last_active_admin() from public,anon,authenticated;
