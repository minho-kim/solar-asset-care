create table public.report_documents (
  report_id uuid not null references public.reports(id),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  pdf_sha256 text not null check (pdf_sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text not null unique,
  bytes bigint not null check (bytes between 1 and 20000000),
  renderer_version text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(report_id,snapshot_sha256)
);
create index report_documents_creator_idx on public.report_documents(created_by);
alter table public.report_documents enable row level security;
revoke all on public.report_documents from public,anon,authenticated;
grant select on public.report_documents to authenticated;
create policy documents_select_viewers on public.report_documents for select to authenticated
  using ((select private.can_view_report(report_id)) and exists(
    select 1 from public.report_snapshots s where s.report_id=report_documents.report_id and s.sha256=report_documents.snapshot_sha256));

-- Nothing in this bucket may be replaced through browser credentials.
drop policy storage_reports_select_authorized on storage.objects;
drop policy storage_reports_insert_workers on storage.objects;
drop policy storage_reports_update_workers on storage.objects;
drop policy storage_reports_delete_admin on storage.objects;
create policy archived_pdf_select_viewers on storage.objects for select to authenticated using (
  bucket_id='reports' and (exists(select 1 from public.report_documents d where d.storage_path=name)
    or exists(select 1 from public.reports r join public.report_snapshots s on s.report_id=r.id
      where r.status='approved' and private.has_org_role(r.organization_id,array['owner'])
        and name=r.organization_id::text||'/'||r.inspection_id::text||'/'||r.id::text||'/'||s.sha256||'.pdf')));
create policy archived_pdf_insert_admin on storage.objects for insert to authenticated with check (
  bucket_id='reports' and exists(select 1 from public.reports r join public.report_snapshots s on s.report_id=r.id
    where r.status='approved' and private.has_org_role(r.organization_id,array['owner'])
      and name=r.organization_id::text||'/'||r.inspection_id::text||'/'||r.id::text||'/'||s.sha256||'.pdf'));

create function private.archive_report_pdf(p_report_id uuid,p_snapshot_sha256 text,p_pdf_sha256 text,p_bytes bigint,p_renderer_version text)
returns public.report_documents language plpgsql security definer set search_path = '' as $$
declare r public.reports%rowtype; s public.report_snapshots%rowtype; d public.report_documents%rowtype; path text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into r from public.reports where id=p_report_id for update;
  if not found or not private.has_org_role(r.organization_id,array['owner']) or r.status<>'approved' then
    raise exception '관리자만 승인된 보고서의 PDF를 보관할 수 있습니다.';
  end if;
  select * into s from public.report_snapshots where report_id=r.id;
  if s.sha256 is distinct from p_snapshot_sha256 then raise exception '검토본이 변경됐습니다. 다시 생성해 주세요.'; end if;
  if p_renderer_version<>'text-assessment-v1' then raise exception '지원하지 않는 PDF 생성 형식입니다.'; end if;
  path:=r.organization_id::text||'/'||r.inspection_id::text||'/'||r.id::text||'/'||s.sha256||'.pdf';
  if not exists(select 1 from storage.objects where bucket_id='reports' and name=path
    and (metadata->>'size')::bigint=p_bytes and metadata->>'mimetype'='application/pdf') then
    raise exception '보관할 PDF 파일을 확인할 수 없습니다.';
  end if;
  select * into d from public.report_documents where report_id=r.id and snapshot_sha256=s.sha256;
  if found then
    if d.pdf_sha256<>p_pdf_sha256 or d.bytes<>p_bytes then raise exception '이미 보관한 PDF와 내용이 다릅니다.'; end if;
    return d;
  end if;
  insert into public.report_documents(report_id,snapshot_sha256,pdf_sha256,storage_path,bytes,renderer_version,created_by)
    values(r.id,s.sha256,p_pdf_sha256,path,p_bytes,p_renderer_version,auth.uid()) returning * into d;
  insert into public.audit_events(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(r.organization_id,auth.uid(),'report.pdf_archived','report',r.id::text,to_jsonb(d));
  return d;
end $$;
create function public.archive_report_pdf(p_report_id uuid,p_snapshot_sha256 text,p_pdf_sha256 text,p_bytes bigint,p_renderer_version text)
returns public.report_documents language sql security invoker set search_path = '' as $$
  select private.archive_report_pdf(p_report_id,p_snapshot_sha256,p_pdf_sha256,p_bytes,p_renderer_version);
$$;
revoke all on function private.archive_report_pdf(uuid,text,text,bigint,text),public.archive_report_pdf(uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function private.archive_report_pdf(uuid,text,text,bigint,text),public.archive_report_pdf(uuid,text,text,bigint,text) to authenticated;

create function private.require_archived_pdf_on_publish() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status='published' and old.status<>'published' and not exists(
    select 1 from public.report_snapshots s join public.report_documents d
      on d.report_id=s.report_id and d.snapshot_sha256=s.sha256 where s.report_id=new.id
  ) then raise exception 'PDF를 생성·보관한 뒤 발행해 주세요.'; end if;
  return new;
end $$;
create trigger require_archived_pdf_on_publish before update on public.reports
  for each row execute function private.require_archived_pdf_on_publish();
revoke all on function private.require_archived_pdf_on_publish() from public,anon,authenticated;
