-- Index foreign-key columns that are not already covered by the initial indexes.

create index analysis_runs_organization_id_idx on public.analysis_runs (organization_id);
create index analysis_runs_requested_by_idx on public.analysis_runs (requested_by);
create index audit_events_actor_user_id_idx on public.audit_events (actor_user_id);
create index findings_analysis_run_id_idx on public.findings (analysis_run_id);
create index findings_organization_id_idx on public.findings (organization_id);
create index findings_reviewed_by_idx on public.findings (reviewed_by);
create index inspection_files_created_by_idx on public.inspection_files (created_by);
create index inspection_files_organization_id_idx on public.inspection_files (organization_id);
create index inspection_files_paired_file_id_idx on public.inspection_files (paired_file_id);
create index inspections_assigned_expert_user_id_idx on public.inspections (assigned_expert_user_id);
create index inspections_assigned_field_user_id_idx on public.inspections (assigned_field_user_id);
create index inspections_created_by_idx on public.inspections (created_by);
create index maintenance_requests_assignee_user_id_idx on public.maintenance_requests (assignee_user_id);
create index maintenance_requests_created_by_idx on public.maintenance_requests (created_by);
create index maintenance_requests_finding_id_idx on public.maintenance_requests (finding_id);
create index maintenance_requests_inspection_id_idx on public.maintenance_requests (inspection_id);
create index reports_approved_by_idx on public.reports (approved_by);
create index reports_created_by_idx on public.reports (created_by);
