begin;
alter table public.places
  add column if not exists description text,
  add column if not exists average_check integer,
  add column if not exists gallery_urls text[] not null default '{}',
  add column if not exists has_terrace boolean,
  add column if not exists kids_friendly boolean,
  add column if not exists accessible_entrance boolean,
  add column if not exists visit_notes text,
  add column if not exists pet_notes text;
commit;
