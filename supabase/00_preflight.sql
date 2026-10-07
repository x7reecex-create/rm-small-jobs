-- READ ONLY. Run in the existing project's Supabase SQL Editor before 01.
-- Keep results private: they describe your existing database, not customer rows.
select table_name, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('site_settings','services','faqs','service_areas','gallery','jobs','customers','expenses','business_admins')
order by table_name, ordinal_position;

select c.relname as table_name, con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('site_settings','services','faqs','service_areas','gallery','jobs','customers','expenses','business_admins')
order by c.relname, con.conname;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public'
order by tablename, policyname;

select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- Review unrelated views/functions too: an old SECURITY DEFINER function or
-- view could expose data independently of the new table policies.
select schemaname, viewname, definition from pg_views where schemaname = 'public';
select p.proname, p.prosecdef as security_definer, pg_get_function_identity_arguments(p.oid) as arguments,
       p.proacl as permissions
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by p.proname;

select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated','PUBLIC')
order by table_name, grantee, privilege_type;
