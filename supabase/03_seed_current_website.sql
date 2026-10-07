-- Optional: copy the current public website into EMPTY CMS tables.
-- Run after 01_business_system.sql in the Supabase SQL Editor.
-- Existing saved content is never replaced, and publication stays off.
begin;
select pg_advisory_xact_lock(hashtext('rm-small-jobs-schema-v1'));
insert into public.site_settings(headline,intro,boundary,phone,whatsapp,email,published)
select 'Small jobs. Done properly.',
       'Need a TV mounted, shelves fitted or flat-pack furniture built? I can help with the small jobs around your home.',
       'TV mounting from £45 · Other home jobs from £30',
       '07365 309553','447365309553','x7reecex@gmail.com',false
where not exists(select 1 from public.site_settings);
do $$ begin
  if not exists(select 1 from public.services) then
    insert into public.services(name,price,description,enabled,featured,sort_order) values
      ('TV mounting','From £45','TV and bracket fitting, with the wall and fixings checked first.',true,false,0),
      ('Shelves & wall hanging','From £30','Shelves, mirrors, pictures and hooks.',true,false,1),
      ('Furniture assembly','From £30','Help building and setting up flat-pack furniture.',true,false,2),
      ('Small home jobs','From £30','Send me your to-do list and I’ll confirm what I can help with.',true,false,3),
      ('Light garden tidy-ups','From £35','Weeding and light clearing. Waste stays in your own bin or agreed bags.',true,false,4),
      ('A few jobs together?','Quote','Send the full list for one quote.',true,false,5);
  end if;
  if not exists(select 1 from public.service_areas) then
    insert into public.service_areas(name,enabled,sort_order) values
      ('Motherwell',true,0),('Wishaw',true,1),('Bellshill',true,2);
  end if;
end $$;
commit;
