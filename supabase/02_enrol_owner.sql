-- Run AFTER 01_business_system.sql, in the Supabase SQL Editor.
-- First create/invite your own login under Authentication > Users if needed.
-- Copy its User UID (a UUID, NOT its email or password), replace the example
-- below, then run this file. Do not commit your real UID to the public repo.
-- Run this only for someone who should control all RM Small Jobs records.
begin;
do $$
declare owner_uid uuid := '00000000-0000-0000-0000-000000000000';
begin
  if owner_uid='00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Replace the example owner_uid with your own Authentication > Users > User UID before running this file.';
  end if;
  if not exists(select 1 from auth.users where id=owner_uid) then
    raise exception 'That User UID does not exist in this project. Check Authentication > Users.';
  end if;
  insert into public.business_admins(user_id) values(owner_uid) on conflict(user_id) do nothing;
end $$;
commit;
