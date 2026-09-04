-- Keep one permissive policy per action so Postgres evaluates only the rules
-- needed for that operation.

drop policy quote_request_findings_admin on public.quote_request_findings;

create policy quote_request_findings_insert_admin on public.quote_request_findings
  for insert to authenticated
  with check (
    exists (
      select 1 from public.quote_requests request
      where request.id = quote_request_id
        and (select private.has_org_role(request.organization_id, array['owner']))
    )
  );

create policy quote_request_findings_update_admin on public.quote_request_findings
  for update to authenticated
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

create policy quote_request_findings_delete_admin on public.quote_request_findings
  for delete to authenticated
  using (
    exists (
      select 1 from public.quote_requests request
      where request.id = quote_request_id
        and (select private.has_org_role(request.organization_id, array['owner']))
    )
  );
