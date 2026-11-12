begin;
alter table public.bookings
  add column if not exists reminder_enabled boolean not null default false,
  add column if not exists reminder_state text,
  add column if not exists reminder_attempted_at timestamptz,
  add column if not exists reminder_sent_at timestamptz;

create or replace function public.poimo_guest_bookings(p_user_id bigint, p_offset integer default 0)
returns table(id bigint, place_name text, booking_date date, booking_time time,
 guests integer, status text, reminder_enabled boolean, can_cancel boolean)
language sql stable security invoker set search_path = '' as $$
 select b.id, b.place_name, b.booking_date, b.booking_time, b.guests, b.status,
 b.reminder_enabled,
 b.status in ('new','confirmed') and
 ((b.booking_date + b.booking_time) at time zone 'Europe/Kyiv') > now()
 from public.bookings b where b.client_tg_id = p_user_id
 order by b.booking_date desc, b.booking_time desc, b.id desc
 limit 51 offset greatest(0, least(p_offset, 10000));
$$;

create or replace function public.poimo_guest_cancel(p_user_id bigint, p_booking_id bigint)
returns setof public.bookings language sql security invoker set search_path = '' as $$
 update public.bookings b set status = 'cancelled'
 where b.id = p_booking_id and b.client_tg_id = p_user_id
 and b.status in ('new','confirmed')
 and ((b.booking_date + b.booking_time) at time zone 'Europe/Kyiv') > now()
 returning b.*;
$$;

create or replace function public.poimo_claim_reminders()
returns setof public.bookings language sql security invoker set search_path = '' as $$
 with due as (
   select b.id from public.bookings b
   where b.status = 'confirmed' and b.reminder_enabled
   and b.client_tg_id is not null and b.reminder_state is null
   and ((b.booking_date + b.booking_time) at time zone 'Europe/Kyiv') > now()
   and ((b.booking_date + b.booking_time) at time zone 'Europe/Kyiv') <= now() + interval '2 hours'
   order by b.booking_date, b.booking_time, b.id
   limit 5 for update skip locked
 )
 update public.bookings b set reminder_state = 'sending', reminder_attempted_at = now()
 from due where b.id = due.id returning b.*;
$$;

revoke all on function public.poimo_guest_bookings(bigint, integer) from public, anon, authenticated;
revoke all on function public.poimo_guest_cancel(bigint, bigint) from public, anon, authenticated;
revoke all on function public.poimo_claim_reminders() from public, anon, authenticated;
grant execute on function public.poimo_guest_bookings(bigint, integer) to service_role;
grant execute on function public.poimo_guest_cancel(bigint, bigint) to service_role;
grant execute on function public.poimo_claim_reminders() to service_role;
commit;
