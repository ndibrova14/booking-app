begin;
create table if not exists public.poimo_analytics_config (
 id boolean primary key default true check(id),
 started_at timestamptz not null default now()
);
insert into public.poimo_analytics_config(id) values(true) on conflict(id) do nothing;
create table if not exists public.poimo_analytics_events (
 id bigint generated always as identity primary key,
 session_id uuid not null,
 client_tg_id bigint not null,
 event_type text not null check(event_type in ('app_open','place_view','booking_form_open')),
 place_id bigint references public.places(id) on delete set null,
 is_test boolean not null default false,
 created_at timestamptz not null default now(),
 check((event_type='app_open' and place_id is null) or event_type<>'app_open')
);
create unique index if not exists poimo_event_dedup
 on public.poimo_analytics_events(client_tg_id,session_id,event_type,coalesce(place_id,0));
create index if not exists poimo_events_period on public.poimo_analytics_events(created_at,place_id);
create table if not exists public.poimo_booking_history (
 id bigint generated always as identity primary key,
 booking_id bigint not null references public.bookings(id) on delete cascade,
 from_status text,
 to_status text not null,
 actor_tg_id bigint,
 source text not null,
 changed_at timestamptz not null default now()
);
alter table public.bookings
 add column if not exists is_test boolean not null default false,
 add column if not exists first_response_at timestamptz,
 add column if not exists first_response_status text,
 add column if not exists confirmed_at timestamptz,
 add column if not exists status_actor_id bigint,
 add column if not exists status_source text;

create or replace function public.poimo_booking_metrics_before()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
   NEW.is_test := NEW.is_test or exists(select 1 from public.places p where p.admin_chat_id=NEW.client_tg_id);
 elsif OLD.status is distinct from NEW.status then
   if OLD.status='new' and NEW.status in ('confirmed','rejected') and OLD.first_response_at is null then
     NEW.first_response_at:=clock_timestamp();
     NEW.first_response_status:=NEW.status;
   end if;
   if NEW.status='confirmed' and OLD.confirmed_at is null then NEW.confirmed_at:=clock_timestamp(); end if;
 end if;
 return NEW;
end; $$;
drop trigger if exists poimo_booking_metrics_before on public.bookings;
create trigger poimo_booking_metrics_before before insert or update on public.bookings
 for each row execute function public.poimo_booking_metrics_before();

create or replace function public.poimo_booking_history_after()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
   insert into public.poimo_booking_history(booking_id,to_status,actor_tg_id,source)
   values(NEW.id,NEW.status,coalesce(NEW.status_actor_id,NEW.client_tg_id),coalesce(NEW.status_source,'guest'));
 elsif OLD.status is distinct from NEW.status then
   insert into public.poimo_booking_history(booking_id,from_status,to_status,actor_tg_id,source)
   values(NEW.id,OLD.status,NEW.status,NEW.status_actor_id,coalesce(NEW.status_source,'system'));
 end if;
 return NEW;
end; $$;
drop trigger if exists poimo_booking_history_after on public.bookings;
create trigger poimo_booking_history_after after insert or update on public.bookings
 for each row execute function public.poimo_booking_history_after();

create or replace function public.poimo_guest_cancel(p_user_id bigint,p_booking_id bigint)
returns setof public.bookings language sql security invoker set search_path='' as $$
 update public.bookings b set status='cancelled',status_actor_id=p_user_id,status_source='guest'
 where b.id=p_booking_id and b.client_tg_id=p_user_id and b.status in ('new','confirmed')
 and ((b.booking_date+b.booking_time) at time zone 'Europe/Kyiv')>now() returning b.*;
$$;

create or replace function public.poimo_track_event(p_user_id bigint,p_owner_id bigint,p_session_id uuid,p_event_type text,p_place_id bigint default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare internal_user boolean;
begin
 if p_user_id is null or p_user_id<1 or p_event_type not in ('app_open','place_view','booking_form_open') then return false; end if;
 if p_event_type='app_open' and p_place_id is not null then return false; end if;
 if p_event_type<>'app_open' and (p_place_id is null or not exists(select 1 from public.places where id=p_place_id and is_active)) then return false; end if;
 internal_user:=coalesce(p_user_id=p_owner_id,false) or exists(select 1 from public.places where admin_chat_id=p_user_id);
 insert into public.poimo_analytics_events(session_id,client_tg_id,event_type,place_id,is_test)
 values(p_session_id,p_user_id,p_event_type,p_place_id,internal_user) on conflict do nothing;
 return true;
end; $$;

create or replace function public.poimo_stats_summary(p_from timestamptz,p_to timestamptz,p_ids bigint[],p_include_test boolean)
returns jsonb language sql stable security invoker set search_path='' as $$
 with visitors as (
   select distinct e.client_tg_id from public.poimo_analytics_events e
   where e.created_at>=p_from and e.created_at<p_to and (p_include_test or not e.is_test)
   and ((p_ids is null and e.event_type='app_open') or (p_ids is not null and e.place_id=any(p_ids)))
 ), events as (
   select * from public.poimo_analytics_events e where e.created_at>=p_from and e.created_at<p_to
   and (p_include_test or not e.is_test) and (p_ids is null or e.place_id=any(p_ids))
 ), cohort as (
   select * from public.bookings b where b.created_at>=p_from and b.created_at<p_to
   and (p_include_test or not b.is_test) and (p_ids is null or b.place_id=any(p_ids))
 ), counts as (
   select count(*) as requests,count(distinct client_tg_id) as bookers,
   count(*) filter(where first_response_status='confirmed') as confirmed,
   count(*) filter(where first_response_status='rejected') as rejected,
   count(*) filter(where status='new') as pending,
   count(*) filter(where status='cancelled' and first_response_at is null) as cancelled_before,
   count(*) filter(where status='cancelled' and first_response_at is not null) as cancelled_after,
   count(*) filter(where first_response_at is not null) as responded,
   count(*) filter(where status='new' and created_at<=now()-interval '15 minutes') as overdue,
   count(*) filter(where first_response_at is not null and first_response_at-created_at<=interval '15 minutes') as fast,
   percentile_cont(0.5) within group(order by greatest(0,extract(epoch from(first_response_at-created_at)))) filter(where first_response_at is not null) as median_seconds
   from cohort
 )
 select jsonb_build_object(
   'visitors',(select count(*) from visitors),
   'sessions',(select count(distinct session_id) from events where (p_ids is null and event_type='app_open') or p_ids is not null),
   'place_viewers',(select count(distinct client_tg_id) from events where event_type='place_view'),
   'form_openers',(select count(distinct client_tg_id) from events where event_type='booking_form_open'),
   'converted_visitors',(select count(distinct b.client_tg_id) from cohort b join visitors v using(client_tg_id)),
   'requests',requests,'bookers',bookers,'confirmed',confirmed,'rejected',rejected,'pending',pending,
   'cancelled_before',cancelled_before,'cancelled_after',cancelled_after,'responded',responded,'overdue',overdue,
   'confirmation_pct',case when requests>0 then round(100.0*confirmed/requests,1) else null end,
   'fast_response_pct',case when responded>0 then round(100.0*fast/responded,1) else null end,
   'median_response_minutes',case when median_seconds is not null then round((median_seconds/60)::numeric,1) else null end
 ) from counts;
$$;

create or replace function public.poimo_analytics_report(p_user_id bigint,p_is_owner boolean,p_start date,p_end date,p_include_test boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare ids bigint[]; started timestamptz; from_time timestamptz; to_time timestamptz; summary jsonb; venue_rows jsonb;
begin
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>365 then raise exception 'invalid period'; end if;
 select array_agg(id) into ids from public.places where p_is_owner or admin_chat_id=p_user_id;
 if not p_is_owner and ids is null then return jsonb_build_object('forbidden',true); end if;
 select started_at into started from public.poimo_analytics_config where id;
 from_time:=greatest(p_start::timestamp at time zone 'Europe/Kyiv',started);
 to_time:=(p_end+1)::timestamp at time zone 'Europe/Kyiv';
 summary:=public.poimo_stats_summary(from_time,to_time,case when p_is_owner then null else ids end,p_include_test);
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'metrics',public.poimo_stats_summary(from_time,to_time,array[p.id],p_include_test)) order by p.id),'[]'::jsonb)
 into venue_rows from public.places p where p.id=any(coalesce(ids,'{}'::bigint[]));
 return jsonb_build_object('ok',true,'owner',p_is_owner,'started_at',started,'start',p_start,'end',p_end,'include_test',p_include_test,'summary',summary,'places',venue_rows);
end; $$;

alter table public.poimo_analytics_config enable row level security;
alter table public.poimo_analytics_events enable row level security;
alter table public.poimo_booking_history enable row level security;
revoke all on public.poimo_analytics_config,public.poimo_analytics_events,public.poimo_booking_history from public,anon,authenticated;
grant select on public.poimo_analytics_config to service_role;
grant select,insert on public.poimo_analytics_events,public.poimo_booking_history to service_role;
grant usage,select on sequence public.poimo_analytics_events_id_seq,public.poimo_booking_history_id_seq to service_role;
revoke all on function public.poimo_booking_metrics_before(),public.poimo_booking_history_after() from public,anon,authenticated;
revoke all on function public.poimo_track_event(bigint,bigint,uuid,text,bigint),public.poimo_stats_summary(timestamptz,timestamptz,bigint[],boolean),public.poimo_analytics_report(bigint,boolean,date,date,boolean) from public,anon,authenticated;
grant execute on function public.poimo_booking_metrics_before(),public.poimo_booking_history_after(),public.poimo_track_event(bigint,bigint,uuid,text,bigint),public.poimo_stats_summary(timestamptz,timestamptz,bigint[],boolean),public.poimo_analytics_report(bigint,boolean,date,date,boolean) to service_role;
revoke all on function public.poimo_guest_cancel(bigint,bigint) from public,anon,authenticated;
grant execute on function public.poimo_guest_cancel(bigint,bigint) to service_role;
commit;
