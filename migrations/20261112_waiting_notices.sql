begin;
alter table public.bookings
  add column if not exists waiting_notice_state text,
  add column if not exists waiting_notice_attempted_at timestamptz,
  add column if not exists waiting_notice_sent_at timestamptz;

create or replace function public.poimo_guest_bookings_v2(p_user_id bigint, p_offset integer default 0)
returns table(id bigint, place_name text, booking_date date, booking_time time,
 guests integer, status text, reminder_enabled boolean, can_cancel boolean, waiting_long boolean)
language sql stable security invoker set search_path = '' as $$
 select b.id, b.place_name, b.booking_date, b.booking_time, b.guests, b.status,
 b.reminder_enabled,
 b.status in ('new','confirmed') and ((b.booking_date + b.booking_time) at time zone 'Europe/Kyiv') > now(),
 b.status = 'new' and b.created_at <= now() - interval '15 minutes'
   and ((b.booking_date + b.booking_time) at time zone 'Europe/Kyiv') > now()
 from public.bookings b where b.client_tg_id = p_user_id
 order by b.booking_date desc, b.booking_time desc, b.id desc
 limit 51 offset greatest(0, least(p_offset, 10000));
$$;

create or replace function public.poimo_claim_waiting_notices()
returns setof public.bookings language sql security invoker set search_path = '' as $$
 with due as (
   select b.id from public.bookings b
   where b.status = 'new' and b.client_tg_id is not null
   and b.waiting_notice_state is null
   and b.created_at <= now() - interval '15 minutes'
   and ((b.booking_date + b.booking_time) at time zone 'Europe/Kyiv') > now()
   order by b.created_at, b.id
   limit 5 for update skip locked
 )
 update public.bookings b
 set waiting_notice_state = 'sending', waiting_notice_attempted_at = now()
 from due where b.id = due.id returning b.*;
$$;

revoke all on function public.poimo_guest_bookings_v2(bigint, integer) from public, anon, authenticated;
revoke all on function public.poimo_claim_waiting_notices() from public, anon, authenticated;
grant execute on function public.poimo_guest_bookings_v2(bigint, integer) to service_role;
grant execute on function public.poimo_claim_waiting_notices() to service_role;
create index if not exists bookings_waiting_notice_due
  on public.bookings(created_at) where status = 'new' and waiting_notice_state is null;
commit;
