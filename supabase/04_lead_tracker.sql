-- STAGED ONLY: apply to the inspected RM Small Jobs project after owner approval.
-- Requires schema version 1 and UUID job IDs. Creates no customer/lead fixtures.
begin;
select pg_advisory_xact_lock(hashtext('rm-small-jobs-lead-tracker-v1'));
do $$ begin
 if to_regclass('public.leads') is not null then
  raise exception 'leads already exists. Inspect its schema before applying this one-time setup.';
 end if;
 if not exists(select 1 from pg_attribute where attrelid='public.jobs'::regclass and attname='id' and atttypid='uuid'::regtype and not attisdropped) then
  raise exception 'This setup requires the inspected project UUID job IDs. No changes applied.';
 end if;
end $$;
create table public.leads (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(btrim(title)) between 1 and 200),
 location text not null default '' check(length(location)<=500),
 source_url text not null default '' check(length(source_url)<=2048 and (source_url='' or source_url ~ '^https://')),
 request_date_label text not null default '' check(length(request_date_label)<=200),
 relevance text not null default 'Needs checking' check(relevance in ('Needs checking','Request verified','Still needed confirmed','Closed or unsuitable')),
 priority text not null default 'P2' check(priority in ('P1','P2','P3')),
 status text not null default 'New opportunity' check(status in ('New opportunity','Contacted','Quote sent','Booked','Completed','Closed')),
 follow_up_on date check(follow_up_on between date '2000-01-01' and date '2100-12-31'),
 customer_ref text not null default '' check(length(customer_ref)<=200),
 quoted_price numeric(12,2) check(quoted_price between 0 and 1000000),
 received_amount numeric(12,2) not null default 0 check(received_amount between 0 and 1000000),
 response_draft text not null default '' check(length(response_draft)<=6000),
 notes text not null default '' check(length(notes)<=6000),
 offer_used boolean not null default false,
 job_id uuid unique references public.jobs(id) on delete set null,
 client_request_id uuid unique,
 created_at timestamptz not null default now(),
 check(received_amount=0 or length(btrim(customer_ref))>0)
);
alter table public.leads enable row level security;
revoke all on public.leads from public, anon, authenticated;
grant select,insert,update,delete on public.leads to authenticated;
create policy rm_leads_admin on public.leads for all to authenticated
 using ((select public.is_business_admin())) with check ((select public.is_business_admin()));
-- No public RPC or publication path returns this table.
commit;
