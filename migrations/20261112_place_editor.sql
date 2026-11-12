begin;
alter table public.places
  add column if not exists editor_version integer not null default 0;
commit;
