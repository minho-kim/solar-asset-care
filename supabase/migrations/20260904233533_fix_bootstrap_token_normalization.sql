-- PostgreSQL exposes the trim implementation as btrim, not pg_catalog.trim.
-- Replace only token normalization; preserve the existing checks, grants and audit flow.
do $migration$
declare
  definition text := pg_catalog.pg_get_functiondef(
    'private.bootstrap_organization(text,text,text)'::pg_catalog.regprocedure
  );
begin
  if pg_catalog.strpos(definition, 'pg_catalog.trim(p_setup_code)') = 0 then
    raise exception 'Expected bootstrap token normalization was not found';
  end if;
  execute pg_catalog.replace(
    definition,
    'pg_catalog.trim(p_setup_code)',
    'pg_catalog.btrim(p_setup_code)'
  );
end;
$migration$;
