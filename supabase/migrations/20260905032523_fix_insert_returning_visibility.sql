-- STABLE self-lookup helpers cannot see the new row during INSERT ... RETURNING.
-- Check existing parent membership first for the same authorized staff roles.
alter policy plants_select_authorized on public.plants using (
  (select private.has_org_role(organization_id,array['owner'])) or (select private.can_view_plant(id)));
alter policy inspections_select_authorized on public.inspections using (
  (select private.has_org_role(organization_id,array['owner'])) or (select private.can_view_inspection(id)));
alter policy findings_select_authorized on public.findings using (
  (select private.can_work_inspection(inspection_id)) or (select private.can_view_finding(id)));
