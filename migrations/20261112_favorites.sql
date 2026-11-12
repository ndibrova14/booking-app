begin;
create table if not exists public.favorites (
  client_tg_id bigint not null,
  place_id bigint not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_tg_id, place_id)
);
alter table public.favorites enable row level security;
revoke all on table public.favorites from public, anon, authenticated;
grant select, insert, delete on table public.favorites to service_role;
commit;
