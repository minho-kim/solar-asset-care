-- The public site has no anonymous business-data API. Browser access begins
-- only after Supabase Auth and is then constrained by RLS membership policies.

revoke all on table public.organizations from anon;
revoke all on table public.profiles from anon;
revoke all on table public.organization_members from anon;
revoke all on table public.plants from anon;
revoke all on table public.inspections from anon;
revoke all on table public.inspection_files from anon;
revoke all on table public.analysis_runs from anon;
revoke all on table public.findings from anon;
revoke all on table public.reports from anon;
revoke all on table public.maintenance_requests from anon;
revoke all on table public.audit_events from anon;
revoke all on all sequences in schema public from anon;
