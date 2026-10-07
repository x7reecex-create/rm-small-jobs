-- RM Small Jobs business system, schema version 1.
-- Run 00_preflight.sql and keep a private database backup first.
-- Run this whole file once in the EXISTING project's SQL Editor as postgres.
-- It is safe to rerun: existing records and primary-key types are preserved.
-- No owner is enrolled automatically. Run 02 afterwards.
-- Existing policies on the eight app tables are REPLACED, not combined: a
-- permissive old policy would otherwise bypass the owner-only policies.
begin;
select pg_advisory_xact_lock(hashtext('rm-small-jobs-schema-v1'));

create table if not exists public.business_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.site_settings (id uuid primary key default gen_random_uuid());
create table if not exists public.services (id uuid primary key default gen_random_uuid());
create table if not exists public.faqs (id uuid primary key default gen_random_uuid());
create table if not exists public.service_areas (id uuid primary key default gen_random_uuid());
create table if not exists public.gallery (id uuid primary key default gen_random_uuid());
create table if not exists public.customers (id uuid primary key default gen_random_uuid());
create table if not exists public.jobs (id uuid primary key default gen_random_uuid());
create table if not exists public.expenses (id uuid primary key default gen_random_uuid());

alter table public.site_settings
  add column if not exists headline text not null default '',
  add column if not exists intro text not null default '',
  add column if not exists boundary text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists whatsapp text not null default '',
  add column if not exists email text not null default '',
  add column if not exists published boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();
alter table public.services
  add column if not exists name text not null default '',
  add column if not exists price text not null default 'Quote',
  add column if not exists description text not null default '',
  add column if not exists enabled boolean not null default false,
  add column if not exists featured boolean not null default false,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();
alter table public.faqs
  add column if not exists question text not null default '',
  add column if not exists answer text not null default '',
  add column if not exists enabled boolean not null default true,
  add column if not exists sort_order integer not null default 0;
alter table public.service_areas
  add column if not exists name text not null default '',
  add column if not exists enabled boolean not null default true,
  add column if not exists sort_order integer not null default 0;
alter table public.gallery
  add column if not exists image_url text not null default '',
  add column if not exists title text not null default '',
  add column if not exists description text not null default '',
  add column if not exists published boolean not null default false,
  add column if not exists created_at timestamptz not null default now();
alter table public.customers
  add column if not exists name text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists email text not null default '',
  add column if not exists address text not null default '',
  add column if not exists postcode text not null default '',
  add column if not exists notes text not null default '',
  add column if not exists client_request_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
alter table public.jobs
  add column if not exists title text not null default '',
  add column if not exists description text not null default '',
  add column if not exists location text not null default '',
  add column if not exists status text not null default 'Enquiry',
  add column if not exists scheduled_at timestamptz,
  add column if not exists price numeric(12,2),
  add column if not exists final_price numeric(12,2),
  add column if not exists client_request_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
alter table public.expenses
  add column if not exists amount numeric(12,2),
  add column if not exists description text not null default '',
  add column if not exists category text not null default 'Other',
  add column if not exists expense_date date,
  add column if not exists client_request_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Refuse incompatible types instead of rewriting/dropping existing columns.
-- varchar is accepted for text fields; existing length limits still apply.
do $$
declare r record; actual text; id_type text; fk_type text; bad_constraint text;
begin
  for r in select * from (values
    ('site_settings','headline','text'),('site_settings','intro','text'),('site_settings','boundary','text'),
    ('site_settings','phone','text'),('site_settings','whatsapp','text'),('site_settings','email','text'),
    ('site_settings','published','bool'),('site_settings','updated_at','timestamptz'),
    ('services','name','text'),('services','price','text'),('services','description','text'),
    ('services','enabled','bool'),('services','featured','bool'),('services','sort_order','integer'),('services','updated_at','timestamptz'),
    ('faqs','question','text'),('faqs','answer','text'),('faqs','enabled','bool'),('faqs','sort_order','integer'),
    ('service_areas','name','text'),('service_areas','enabled','bool'),('service_areas','sort_order','integer'),
    ('gallery','image_url','text'),('gallery','title','text'),('gallery','description','text'),('gallery','published','bool'),('gallery','created_at','timestamptz'),
    ('customers','name','text'),('customers','phone','text'),('customers','email','text'),('customers','address','text'),('customers','postcode','text'),('customers','notes','text'),('customers','client_request_id','uuid'),
    ('jobs','title','text'),('jobs','description','text'),('jobs','location','text'),('jobs','status','text'),('jobs','scheduled_at','timestamptz'),('jobs','price','numeric'),('jobs','final_price','numeric'),('jobs','client_request_id','uuid'),
    ('expenses','amount','numeric'),('expenses','description','text'),('expenses','category','text'),('expenses','expense_date','date'),('expenses','client_request_id','uuid')
  ) as expected(tbl,col,kind) loop
    select t.typname into actual from pg_attribute a join pg_type t on t.oid=a.atttypid
    where a.attrelid=format('public.%I',r.tbl)::regclass and a.attname=r.col and not a.attisdropped;
    if actual is null or not (actual=r.kind or (r.kind='text' and actual in ('varchar','bpchar')) or (r.kind='integer' and actual in ('int2','int4','int8'))) then
      raise exception 'Incompatible column %.%: expected %, found %. Nothing was applied. Review 00_preflight.sql results before adapting the migration.',r.tbl,r.col,r.kind,actual;
    end if;
  end loop;
  for r in select unnest(array['site_settings','services','faqs','service_areas','gallery','customers','jobs','expenses']) as tbl loop
    select format_type(a.atttypid,a.atttypmod) into id_type from pg_attribute a
    where a.attrelid=format('public.%I',r.tbl)::regclass and a.attname='id' and not a.attisdropped;
    if id_type is null or id_type not in ('uuid','bigint','integer','smallint','text','character varying') then
      raise exception 'Unsupported or missing %.id type: %. Existing IDs were not changed.',r.tbl,id_type;
    end if;
  end loop;
  select format_type(a.atttypid,a.atttypmod) into id_type from pg_attribute a
  where a.attrelid='public.customers'::regclass and a.attname='id';
  select format_type(a.atttypid,a.atttypmod) into fk_type from pg_attribute a
  where a.attrelid='public.jobs'::regclass and a.attname='customer_id' and not a.attisdropped;
  if fk_type is null then
    execute format('alter table public.jobs add column customer_id %s',id_type);
  elsif fk_type<>id_type then
    raise exception 'jobs.customer_id (%) does not match customers.id (%). Nothing was applied; review the existing relationship.',fk_type,id_type;
  end if;
  -- Legacy CHECK constraints may reject the new status/category values. Stop
  -- for review rather than silently dropping a business rule.
  select con.conname into bad_constraint from pg_constraint con
  where con.contype='c' and con.conrelid in ('public.jobs'::regclass,'public.expenses'::regclass)
    and con.conname not like 'rm_%'
    and ((con.conrelid='public.jobs'::regclass and pg_get_constraintdef(con.oid) ~ '\mstatus\M')
      or (con.conrelid='public.expenses'::regclass and pg_get_constraintdef(con.oid) ~ '\mcategory\M')) limit 1;
  if bad_constraint is not null then
    raise exception 'Existing status/category rule % requires review. Nothing was applied; see 00_preflight.sql before changing this constraint.',bad_constraint;
  end if;
  if (select count(*) from public.site_settings)>1 then
    raise exception 'site_settings contains more than one row. Keep a backup and choose the intended homepage record before running this migration; no records were deleted.';
  end if;
end $$;

-- Existing projects may require a quote and default new jobs to 'Quoted'.
-- An enquiry can have no quote yet; preserve saved values while aligning the
-- column defaults with the new app and its allowed status values.
alter table public.jobs
  alter column price drop not null,
  alter column price drop default,
  alter column status set default 'Enquiry';

-- Copy only missing legacy expense descriptions. Existing notes remain intact.
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='expenses' and column_name='note') then
    execute 'update public.expenses set description=note::text where coalesce(description,'''')='''' and note is not null';
  end if;
end $$;
update public.expenses set expense_date=(created_at at time zone 'Europe/London')::date
where expense_date is null and created_at is not null;
alter table public.expenses alter column expense_date set default (now() at time zone 'Europe/London')::date;

create unique index if not exists rm_single_site_settings on public.site_settings ((true));
create unique index if not exists rm_jobs_request_id on public.jobs(client_request_id);
create unique index if not exists rm_customers_request_id on public.customers(client_request_id);
create unique index if not exists rm_expenses_request_id on public.expenses(client_request_id);
create index if not exists rm_jobs_customer on public.jobs(customer_id);
create index if not exists rm_jobs_schedule on public.jobs(scheduled_at);
create index if not exists rm_expenses_date on public.expenses(expense_date);

-- Preserve and index the existing optional expense-to-job relationship.
do $$ begin
  if exists(select 1 from information_schema.columns
            where table_schema='public' and table_name='expenses' and column_name='job_id') then
    create index if not exists rm_expenses_job on public.expenses(job_id);
  end if;
end $$;

-- NOT VALID preserves unusual historical records. New/edited records must
-- satisfy these checks; legacy values should be reviewed in the admin app.
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.jobs'::regclass and conname='rm_jobs_customer_fk') then
    alter table public.jobs add constraint rm_jobs_customer_fk foreign key(customer_id) references public.customers(id) on delete set null not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.jobs'::regclass and conname='rm_jobs_status') then
    alter table public.jobs add constraint rm_jobs_status check(status in ('Enquiry','Quote sent','Booked','In progress','Completed','Cancelled')) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.jobs'::regclass and conname='rm_jobs_prices') then
    alter table public.jobs add constraint rm_jobs_prices check((price is null or price>=0) and (final_price is null or final_price>=0)) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.expenses'::regclass and conname='rm_expense_amount') then
    alter table public.expenses add constraint rm_expense_amount check(amount>0) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.expenses'::regclass and conname='rm_expense_category') then
    alter table public.expenses add constraint rm_expense_category check(category in ('Tools','Materials','Fuel/travel','Advertising','Insurance','Other')) not valid;
  end if;
end $$;

create or replace function public.is_business_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.business_admins where user_id=(select auth.uid()));
$$;
revoke all on function public.is_business_admin() from public, anon, authenticated;
grant execute on function public.is_business_admin() to authenticated;

-- Replace policies AND inherited table grants. The allowlist itself is only
-- editable by the project owner through the SQL Editor, never by the app.
do $$ declare tbl text; p record; seq text;
begin
  foreach tbl in array array['business_admins','site_settings','services','faqs','service_areas','gallery','jobs','customers','expenses'] loop
    execute format('alter table public.%I enable row level security',tbl);
    for p in select policyname from pg_policies where schemaname='public' and tablename=tbl loop
      execute format('drop policy %I on public.%I',p.policyname,tbl);
    end loop;
    execute format('revoke all on table public.%I from public, anon, authenticated',tbl);
    -- Old column grants survive table-level REVOKE, so remove those too.
    for p in select column_name from information_schema.columns where table_schema='public' and table_name=tbl loop
      execute format('revoke all (%I) on table public.%I from public, anon, authenticated',p.column_name,tbl);
    end loop;
    if tbl<>'business_admins' then
      execute format('grant select, insert, update, delete on table public.%I to authenticated',tbl);
      execute format('create policy rm_owner_only on public.%I for all to authenticated using ((select public.is_business_admin())) with check ((select public.is_business_admin()))',tbl);
      -- Existing serial IDs keep working. This grants sequence use, not rows;
      -- table RLS still prevents a non-owner inserting or modifying records.
      seq:=pg_get_serial_sequence(format('public.%I',tbl),'id');
      if seq is not null then
        execute format('revoke all on sequence %s from public, anon, authenticated',seq);
        execute format('grant usage on sequence %s to authenticated',seq);
      end if;
    end if;
  end loop;
end $$;

create or replace function public.rm_admin_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('is_admin',public.is_business_admin(),'schema_version',1);
$$;
revoke all on function public.rm_admin_status() from public, anon, authenticated;
grant execute on function public.rm_admin_status() to authenticated;

-- One whitelisted public read route. No direct anonymous table access, no
-- private business rows, no SELECT *, and no dynamically executed user input.
create or replace function public.rm_public_site() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare settings public.site_settings%rowtype;
begin
  select * into settings from public.site_settings limit 1;
  if not found or settings.published is distinct from true then
    return jsonb_build_object('published',false);
  end if;
  return jsonb_build_object(
    'published',true,
    'settings',jsonb_build_object('headline',settings.headline,'intro',settings.intro,'boundary',settings.boundary,'phone',settings.phone,'whatsapp',settings.whatsapp,'email',settings.email),
    'services',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'price',price,'description',description,'featured',featured,'sort_order',sort_order) order by sort_order,id),'[]'::jsonb) from public.services where enabled is true),
    'faqs',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'question',question,'answer',answer,'sort_order',sort_order) order by sort_order,id),'[]'::jsonb) from public.faqs where enabled is true),
    'areas',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'sort_order',sort_order) order by sort_order,id),'[]'::jsonb) from public.service_areas where enabled is true),
    'gallery',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'image_url',image_url,'title',title,'description',description,'created_at',created_at) order by created_at desc,id),'[]'::jsonb) from public.gallery where published is true)
  );
end $$;
revoke all on function public.rm_public_site() from public, anon, authenticated;
grant execute on function public.rm_public_site() to anon, authenticated;

-- Make changed columns/RPCs available to Supabase's REST API.
notify pgrst, 'reload schema';
commit;
