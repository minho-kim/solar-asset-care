-- Split FOR ALL rules into operation-specific rules. This keeps permissions
-- explicit and avoids overlapping permissive SELECT policies.

drop policy if exists organization_members_write_owner on public.organization_members;
create policy organization_members_insert_owner on public.organization_members
  for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner']));
create policy organization_members_update_owner on public.organization_members
  for update to authenticated
  using (private.has_org_role(organization_id, array['owner']))
  with check (private.has_org_role(organization_id, array['owner']));
create policy organization_members_delete_owner on public.organization_members
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner']));

drop policy if exists plants_write_operator on public.plants;
create policy plants_insert_operator on public.plants
  for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'operator']));
create policy plants_update_operator on public.plants
  for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'operator']))
  with check (private.has_org_role(organization_id, array['owner', 'operator']));
create policy plants_delete_operator on public.plants
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'operator']));

drop policy if exists inspections_write_staff on public.inspections;
create policy inspections_insert_staff on public.inspections
  for insert to authenticated
  with check (private.has_org_role(
    organization_id, array['owner', 'operator', 'field_technician', 'expert', 'approver']
  ));
create policy inspections_update_staff on public.inspections
  for update to authenticated
  using (private.has_org_role(
    organization_id, array['owner', 'operator', 'field_technician', 'expert', 'approver']
  ))
  with check (private.has_org_role(
    organization_id, array['owner', 'operator', 'field_technician', 'expert', 'approver']
  ));
create policy inspections_delete_staff on public.inspections
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'operator']));

drop policy if exists inspection_files_write_staff on public.inspection_files;
create policy inspection_files_insert_staff on public.inspection_files
  for insert to authenticated
  with check (private.has_org_role(
    organization_id, array['owner', 'operator', 'field_technician', 'expert']
  ));
create policy inspection_files_update_staff on public.inspection_files
  for update to authenticated
  using (private.has_org_role(
    organization_id, array['owner', 'operator', 'field_technician', 'expert']
  ))
  with check (private.has_org_role(
    organization_id, array['owner', 'operator', 'field_technician', 'expert']
  ));
create policy inspection_files_delete_staff on public.inspection_files
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'operator']));

drop policy if exists analysis_runs_write_staff on public.analysis_runs;
create policy analysis_runs_insert_staff on public.analysis_runs
  for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'operator', 'expert']));
create policy analysis_runs_update_staff on public.analysis_runs
  for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'operator', 'expert']))
  with check (private.has_org_role(organization_id, array['owner', 'operator', 'expert']));
create policy analysis_runs_delete_staff on public.analysis_runs
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'operator']));

drop policy if exists findings_write_expert on public.findings;
create policy findings_insert_expert on public.findings
  for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'operator', 'expert']));
create policy findings_update_expert on public.findings
  for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'operator', 'expert']))
  with check (private.has_org_role(organization_id, array['owner', 'operator', 'expert']));
create policy findings_delete_expert on public.findings
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'operator']));

drop policy if exists reports_write_staff on public.reports;
create policy reports_insert_staff on public.reports
  for insert to authenticated
  with check (private.has_org_role(
    organization_id, array['owner', 'operator', 'expert', 'approver']
  ));
create policy reports_update_staff on public.reports
  for update to authenticated
  using (private.has_org_role(
    organization_id, array['owner', 'operator', 'expert', 'approver']
  ))
  with check (private.has_org_role(
    organization_id, array['owner', 'operator', 'expert', 'approver']
  ));
create policy reports_delete_staff on public.reports
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'operator']));

drop policy if exists maintenance_write_staff on public.maintenance_requests;
create policy maintenance_insert_staff on public.maintenance_requests
  for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'operator', 'maintainer']));
create policy maintenance_update_staff on public.maintenance_requests
  for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'operator', 'maintainer']))
  with check (private.has_org_role(organization_id, array['owner', 'operator', 'maintainer']));
create policy maintenance_delete_staff on public.maintenance_requests
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'operator']));
