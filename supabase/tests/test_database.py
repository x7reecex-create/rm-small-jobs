"""Real PostgreSQL checks in an isolated container; never runs against Supabase."""
from pathlib import Path
import os
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
CONTAINER = f"rm-small-jobs-sql-test-{os.getpid()}"
MIGRATION = (ROOT / "01_business_system.sql").read_text()


def command(args, text=None, ok=True):
    result = subprocess.run(args, input=text, text=True, capture_output=True)
    if ok and result.returncode:
        raise AssertionError(result.stderr[-5000:] + result.stdout[-1500:])
    return result


def sql(query, database="postgres", ok=True):
    return command(["docker", "exec", "-i", CONTAINER, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], query, ok)


AUTH = """
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
"""

CHECKS = """
insert into public.business_admins(user_id) values('11111111-1111-4111-8111-111111111111');
alter table public.services add column internal_note text default 'PRIVATE CMS EXTRA FIELD';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$ begin
 if public.rm_admin_status()<>jsonb_build_object('is_admin',true,'schema_version',1) then raise exception 'Owner status failed'; end if;
end $$;
insert into public.site_settings(headline) values('Test homepage');
insert into public.services(name,price,enabled) values('Visible service','From £45',true),('Hidden service','From £90',false);
insert into public.faqs(question,answer,enabled) values('Visible?','Yes',true),('Hidden?','Yes',false);
insert into public.service_areas(name,enabled) values('Visible area',true),('Hidden area',false);
insert into public.gallery(title,image_url,published) values('Visible photo','https://example.test/photo.jpg',true),('Hidden photo','https://example.test/draft.jpg',false);
insert into public.customers(name,notes,client_request_id) values('TEST CUSTOMER','PRIVATE CUSTOMER NOTE','33333333-3333-4333-8333-333333333333');
insert into public.jobs(title,customer_id,status,price,final_price,client_request_id)
 select 'TEST JOB',id,'Completed',45,50,'44444444-4444-4444-8444-444444444444' from public.customers where name='TEST CUSTOMER';
insert into public.expenses(amount,category,description,expense_date,client_request_id) values(5,'Materials','TEST EXPENSE','2026-10-07','55555555-5555-4555-8555-555555555555');
do $$ begin
 begin insert into public.jobs(title,client_request_id) values('DUPLICATE','44444444-4444-4444-8444-444444444444'); raise exception 'Duplicate request accepted'; exception when unique_violation then null; end;
 begin insert into public.jobs(title,status) values('INVALID','Paid'); raise exception 'Invalid status accepted'; exception when check_violation then null; end;
 begin insert into public.expenses(amount,category) values(-1,'Materials'); raise exception 'Negative expense accepted'; exception when check_violation then null; end;
 begin insert into public.expenses(amount,category) values(1,'Invalid'); raise exception 'Invalid expense category accepted'; exception when check_violation then null; end;
 begin insert into public.business_admins(user_id) values('22222222-2222-4222-8222-222222222222'); raise exception 'App enrolled another admin'; exception when insufficient_privilege then null; end;
end $$;
set role anon;
do $$ declare t text; content jsonb;
begin
 content:=public.rm_public_site();
 if content<>jsonb_build_object('published',false) then raise exception 'Unpublished site leaked'; end if;
 foreach t in array array['business_admins','site_settings','services','faqs','service_areas','gallery','customers','jobs','expenses'] loop
   begin execute format('select * from public.%I',t); raise exception 'Anon read allowed: %',t; exception when insufficient_privilege then null; end;
 end loop;
 begin insert into public.jobs(title) values('ANON WRITE'); raise exception 'Anon insert allowed'; exception when insufficient_privilege then null; end;
 begin perform public.rm_admin_status(); raise exception 'Anon admin RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$ declare t text; n bigint; begin
 if public.is_business_admin() then raise exception 'Unapproved user became owner'; end if;
 foreach t in array array['site_settings','services','faqs','service_areas','gallery','customers','jobs','expenses'] loop
   execute format('select count(*) from public.%I',t) into n;
   if n<>0 then raise exception 'Unapproved read allowed: %',t; end if;
 end loop;
 begin insert into public.customers(name) values('STRANGER WRITE'); raise exception 'Unapproved insert allowed'; exception when insufficient_privilege then null; end;
 update public.customers set name='STOLEN'; get diagnostics n = row_count;
 if n<>0 then raise exception 'Unapproved update allowed'; end if;
 delete from public.expenses; get diagnostics n = row_count;
 if n<>0 then raise exception 'Unapproved delete allowed'; end if;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
update public.site_settings set published=true;
update public.customers set phone='07000000000' where name='TEST CUSTOMER';
update public.jobs set status='Cancelled' where title='TEST JOB';
do $$ declare n integer; begin
 select count(*) into n from public.customers where phone='07000000000';
 if n<>1 then raise exception 'Owner edit failed'; end if;
end $$;
set role anon;
do $$ declare content jsonb; begin
 content:=public.rm_public_site();
 if not (content->>'published')::boolean or content->'settings'->>'headline'<>'Test homepage' then raise exception 'Published settings missing'; end if;
 if jsonb_array_length(content->'services')<>1 or jsonb_array_length(content->'faqs')<>1 or jsonb_array_length(content->'areas')<>1 or jsonb_array_length(content->'gallery')<>1 then raise exception 'Visibility filters failed'; end if;
 if content::text like '%PRIVATE%' or content::text like '%TEST CUSTOMER%' or content::text like '%Hidden%' or content ? 'jobs' or content ? 'expenses' or content ? 'customers' then raise exception 'Public projection leaked private/draft data'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
delete from public.jobs where title='TEST JOB';
delete from public.expenses where description='TEST EXPENSE';
do $$ begin
 if exists(select 1 from public.jobs) or exists(select 1 from public.expenses) then raise exception 'Owner deletion failed'; end if;
end $$;
reset role;
"""


try:
    command(["docker", "run", "--rm", "--detach", "--network", "none", "--name", CONTAINER, "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17-alpine"])
    for _ in range(30):
        if command(["docker", "exec", CONTAINER, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], ok=False).returncode == 0:
            break
        time.sleep(1)
    else:
        raise AssertionError("Disposable PostgreSQL did not become ready")
    sql("create role anon; create role authenticated;")
    sql(AUTH)
    sql(MIGRATION)
    sql(MIGRATION)
    sql(CHECKS)
    print("PASS: fresh schema and repeat migration; owner CRUD; anon and non-owner denial; private allowlist; visibility gate/projection; retry uniqueness; status/category/amount constraints")

    sql("create database legacy;")
    sql(AUTH + """
      create table public.customers(id bigint generated by default as identity primary key,name text);
      create table public.jobs(id bigint generated by default as identity primary key,title text,status text,price numeric,scheduled_at timestamptz,payment_status text);
      create table public.expenses(id bigint generated by default as identity primary key,amount numeric,description text,note text,created_at timestamptz);
      insert into public.customers(name) values('EXISTING CUSTOMER');
      insert into public.jobs(title,status,price,payment_status) values('EXISTING JOB','Paid',45,'Paid');
      insert into public.expenses(amount,description,note,created_at) values(3,'','LEGACY NOTE','2026-10-01 23:30:00+00');
      alter table public.jobs enable row level security;
      create policy insecure_old_policy on public.jobs for all to anon using(true) with check(true);
      grant select,insert,update,delete on public.jobs to anon;
      grant select(title) on public.jobs to anon;
    """, "legacy")
    sql(MIGRATION, "legacy")
    sql(MIGRATION, "legacy")
    sql("""
      do $$ begin
       if (select data_type from information_schema.columns where table_schema='public' and table_name='jobs' and column_name='customer_id')<>'bigint' then raise exception 'Legacy ID type not retained'; end if;
       if not exists(select 1 from public.jobs where title='EXISTING JOB' and status='Paid' and payment_status='Paid' and final_price is null) then raise exception 'Legacy job changed'; end if;
       if not exists(select 1 from public.expenses where note='LEGACY NOTE' and description='LEGACY NOTE' and expense_date='2026-10-02') then raise exception 'Legacy expense backfill failed'; end if;
       if exists(select 1 from pg_policies where policyname='insecure_old_policy') then raise exception 'Old permissive policy remained'; end if;
       if has_column_privilege('anon','public.jobs','title','select') then raise exception 'Legacy column grant remained'; end if;
      end $$;
      insert into public.business_admins(user_id) values('11111111-1111-4111-8111-111111111111');
      set role authenticated;
      select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
      insert into public.jobs(title,status,customer_id) values('NEW SERIAL JOB','Booked',1);
      reset role;
    """, "legacy")
    print("PASS: existing bigint IDs, records and payment fields retained; London expense dates; old insecure policies and column grants removed; owner serial inserts")

    sql("create database seedcheck;")
    sql(AUTH, "seedcheck")
    sql(MIGRATION, "seedcheck")
    seed = (ROOT / "03_seed_current_website.sql").read_text()
    sql(seed, "seedcheck")
    sql("update public.site_settings set intro='EXISTING COPY TO KEEP';", "seedcheck")
    sql(seed, "seedcheck")
    sql("""
      do $$ begin
       if (select count(*) from public.services)<>6 or (select count(*) from public.service_areas)<>3 then raise exception 'Seed counts changed'; end if;
       if not exists(select 1 from public.services where name='TV mounting' and price='From £45') then raise exception 'Starting price changed'; end if;
       if not exists(select 1 from public.site_settings where intro='EXISTING COPY TO KEEP' and published=false) then raise exception 'Seed overwrote content or published it'; end if;
       if (select count(*) from public.customers)<>0 then raise exception 'Seed created fake customers'; end if;
      end $$;
    """, "seedcheck")
    print("PASS: optional seed preserves existing CMS copy, prices and draft state; repeated run creates no duplicates or customers")

    sql("create database incompatible;")
    sql(AUTH + "create table public.jobs(id uuid primary key default gen_random_uuid(),status integer);", "incompatible")
    failed = sql(MIGRATION, "incompatible", ok=False)
    assert failed.returncode != 0 and "Incompatible column jobs.status" in failed.stderr, failed.stderr
    sql("do $$ begin if to_regclass('public.customers') is not null then raise exception 'Failed migration left partial changes'; end if; end $$;", "incompatible")
    print("PASS: incompatible schema aborts with useful error and rolls back every change")
finally:
    command(["docker", "rm", "--force", CONTAINER], ok=False)
