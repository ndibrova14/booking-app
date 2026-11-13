begin;
alter table public.bookings add column if not exists delivery_event_nonce uuid;
create table if not exists public.poimo_delivery_jobs (
 id bigint generated always as identity primary key,
 booking_id bigint not null references public.bookings(id) on delete cascade,
 kind text not null check(kind in ('new_booking','confirmed','rejected','cancelled_guest','cancelled_restaurant','reminder','waiting')),
 state text not null default 'queued' check(state in ('queued','processing','sent','dead','unknown','skipped')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 locked_at timestamptz,
 lock_token uuid,
 last_error text,
 telegram_message_id bigint,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(booking_id,kind)
);
create index if not exists poimo_delivery_due on public.poimo_delivery_jobs(next_attempt_at,id) where state='queued';

create or replace function public.poimo_enqueue_booking_delivery()
returns trigger language plpgsql security invoker set search_path='' as $$
declare event_kind text;
begin
 if TG_OP='INSERT' then
   -- Old deployed code still uses pending and continues its legacy direct delivery.
   if NEW.notification_status='queued' then event_kind:='new_booking'; end if;
 elsif OLD.status is distinct from NEW.status and NEW.delivery_event_nonce is not null and NEW.delivery_event_nonce is distinct from OLD.delivery_event_nonce then
   if NEW.status in ('confirmed','rejected') then event_kind:=NEW.status;
   elsif NEW.status='cancelled' then event_kind:=case when NEW.status_source='guest' then 'cancelled_guest' else 'cancelled_restaurant' end;
   end if;
 end if;
 if event_kind is not null then
   insert into public.poimo_delivery_jobs(booking_id,kind) values(NEW.id,event_kind) on conflict do nothing;
 end if;
 return NEW;
end; $$;
drop trigger if exists poimo_enqueue_booking_delivery on public.bookings;
create trigger poimo_enqueue_booking_delivery after insert or update on public.bookings for each row execute function public.poimo_enqueue_booking_delivery();

create or replace function public.poimo_sync_delivery_state()
returns trigger language plpgsql security invoker set search_path='' as $$
declare label text;
begin
 label:=case NEW.state when 'dead' then 'failed' when 'processing' then 'sending' when 'queued' then case when NEW.attempts>0 then 'retrying' else 'queued' end else NEW.state end;
 if NEW.kind='new_booking' then update public.bookings set notification_status=label where id=NEW.booking_id and notification_status is distinct from label;
 elsif NEW.kind='reminder' then update public.bookings set reminder_state=label,reminder_sent_at=case when NEW.state='sent' then now() else reminder_sent_at end where id=NEW.booking_id and reminder_state is distinct from label;
 elsif NEW.kind='waiting' then update public.bookings set waiting_notice_state=label,waiting_notice_sent_at=case when NEW.state='sent' then now() else waiting_notice_sent_at end where id=NEW.booking_id and waiting_notice_state is distinct from label;
 end if;
 return NEW;
end; $$;
drop trigger if exists poimo_sync_delivery_state on public.poimo_delivery_jobs;
create trigger poimo_sync_delivery_state after insert or update of state on public.poimo_delivery_jobs for each row execute function public.poimo_sync_delivery_state();

create or replace function public.poimo_claim_delivery(p_booking_id bigint default null,p_kind text default null)
returns setof public.poimo_delivery_jobs language plpgsql security invoker set search_path='' as $$
begin
 -- An abandoned sender may have delivered. Never reclaim it blindly.
 update public.poimo_delivery_jobs set state='unknown',last_error='sender_interrupted',updated_at=now()
 where state='processing' and locked_at<now()-interval '2 minutes';
 return query with due as (
   select j.id from public.poimo_delivery_jobs j where j.state='queued' and j.next_attempt_at<=now() and j.attempts<4
   and (p_booking_id is null or j.booking_id=p_booking_id) and (p_kind is null or j.kind=p_kind)
   order by j.next_attempt_at,j.id limit 1 for update skip locked
 )
 update public.poimo_delivery_jobs j set state='processing',attempts=j.attempts+1,locked_at=now(),lock_token=gen_random_uuid(),updated_at=now()
 from due where j.id=due.id returning j.*;
end; $$;

create or replace function public.poimo_finish_delivery(p_id bigint,p_token uuid,p_state text,p_error text default null,p_retry_after integer default 0,p_message_id bigint default null)
returns setof public.poimo_delivery_jobs language sql security invoker set search_path='' as $$
 update public.poimo_delivery_jobs j
 set state=case when p_state='queued' and j.attempts>=4 then 'dead' else p_state end,
 next_attempt_at=now()+make_interval(secs=>greatest(coalesce(p_retry_after,0),case j.attempts when 1 then 60 when 2 then 300 else 900 end)),
 last_error=left(p_error,80),telegram_message_id=p_message_id,updated_at=now()
 where j.id=p_id and j.lock_token=p_token and j.state='processing' and p_state in ('queued','sent','dead','unknown','skipped')
 returning j.*;
$$;

-- New handlers use v2. Old deployed handlers keep their original functions, avoiding double sends during deployment.
create or replace function public.poimo_guest_cancel_delivery(p_user_id bigint,p_booking_id bigint)
returns setof public.bookings language sql security invoker set search_path='' as $$
 update public.bookings b set status='cancelled',status_actor_id=p_user_id,status_source='guest',delivery_event_nonce=gen_random_uuid()
 where b.id=p_booking_id and b.client_tg_id=p_user_id and b.status in ('new','confirmed')
 and ((b.booking_date+b.booking_time) at time zone 'Europe/Kyiv')>now() returning b.*;
$$;
create or replace function public.poimo_queue_reminders()
returns setof public.bookings language sql security invoker set search_path='' as $$
 with due as (
  select b.id from public.bookings b where b.status='confirmed' and b.reminder_enabled and b.client_tg_id is not null and b.reminder_state is null
  and ((b.booking_date+b.booking_time) at time zone 'Europe/Kyiv')>now()
  and ((b.booking_date+b.booking_time) at time zone 'Europe/Kyiv')<=now()+interval '2 hours'
  order by b.booking_date,b.booking_time,b.id limit 5 for update skip locked
 ), marked as (
  update public.bookings b set reminder_state='queued',reminder_attempted_at=now() from due where b.id=due.id returning b.*
 ), enqueued as (
  insert into public.poimo_delivery_jobs(booking_id,kind) select id,'reminder' from marked on conflict do nothing returning booking_id
 ) select m.* from marked m join enqueued e on e.booking_id=m.id;
$$;
create or replace function public.poimo_queue_waiting_notices()
returns setof public.bookings language sql security invoker set search_path='' as $$
 with due as (
  select b.id from public.bookings b where b.status='new' and b.client_tg_id is not null and b.waiting_notice_state is null
  and b.created_at<=now()-interval '15 minutes'
  and ((b.booking_date+b.booking_time) at time zone 'Europe/Kyiv')>now()
  order by b.created_at,b.id limit 5 for update skip locked
 ), marked as (
  update public.bookings b set waiting_notice_state='queued',waiting_notice_attempted_at=now() from due where b.id=due.id returning b.*
 ), enqueued as (
  insert into public.poimo_delivery_jobs(booking_id,kind) select id,'waiting' from marked on conflict do nothing returning booking_id
 ) select m.* from marked m join enqueued e on e.booking_id=m.id;
$$;

alter table public.poimo_delivery_jobs enable row level security;
revoke all on public.poimo_delivery_jobs from public,anon,authenticated;
grant select,insert,update on public.poimo_delivery_jobs to service_role;
grant usage,select on sequence public.poimo_delivery_jobs_id_seq to service_role;
revoke all on function public.poimo_enqueue_booking_delivery(),public.poimo_sync_delivery_state(),public.poimo_claim_delivery(bigint,text),public.poimo_finish_delivery(bigint,uuid,text,text,integer,bigint),public.poimo_guest_cancel_delivery(bigint,bigint),public.poimo_queue_reminders(),public.poimo_queue_waiting_notices() from public,anon,authenticated;
grant execute on function public.poimo_enqueue_booking_delivery(),public.poimo_sync_delivery_state(),public.poimo_claim_delivery(bigint,text),public.poimo_finish_delivery(bigint,uuid,text,text,integer,bigint),public.poimo_guest_cancel_delivery(bigint,bigint),public.poimo_queue_reminders(),public.poimo_queue_waiting_notices() to service_role;
commit;
