create index plant_requesters_created_by_idx
  on public.plant_requesters (created_by)
  where created_by is not null;
