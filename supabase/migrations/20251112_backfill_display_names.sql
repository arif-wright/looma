-- Backfill profile display names from auth metadata/email

update public.profiles as p
set display_name = split_part(u.email, '@', 1)
from auth.users as u
where p.id = u.id
  and (p.display_name is null or trim(p.display_name) = '' or p.display_name = 'Unnamed')
  and u.email is not null;
