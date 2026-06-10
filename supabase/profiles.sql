-- Username -> email lookup for login. Run once in the Supabase SQL editor.
--
-- profiles is kept in sync with auth.users by trigger. There is no select
-- policy on the table itself; the login screen resolves usernames only
-- through get_email_for_username(), which returns a single email per exact
-- username match.

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  username   text unique,
  email      text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Keep profiles in sync on signup, email change, or username change
create or replace function public.handle_user_upsert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  begin
    insert into public.profiles (user_id, username, email)
    values (new.id, lower(new.raw_user_meta_data->>'username'), new.email)
    on conflict (user_id) do update
      set username = coalesce(lower(new.raw_user_meta_data->>'username'), profiles.username),
          email    = new.email;
  exception when unique_violation then
    -- Username collision must never block auth itself
    insert into public.profiles (user_id, username, email)
    values (new.id, null, new.email)
    on conflict (user_id) do update set email = new.email;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_upsert on auth.users;
create trigger on_auth_user_upsert
  after insert or update on auth.users
  for each row execute function public.handle_user_upsert();

-- Backfill all existing users
insert into public.profiles (user_id, username, email)
select id, lower(raw_user_meta_data->>'username'), email
from auth.users
on conflict (user_id) do nothing;

-- Original accounts that predate username metadata
update public.profiles set username = 'raksa'  where email = 'raksask90@gmail.com'    and username is null;
update public.profiles set username = 'dara'   where email = 'dara@gmail.com'         and username is null;
update public.profiles set username = 'sreydy' where email = 'raksa.chou99@gmail.com' and username is null;

-- Login lookup, callable by anyone (also used to check username availability at signup)
create or replace function public.get_email_for_username(uname text)
returns text
language sql
security definer set search_path = public
stable
as $$
  select email from public.profiles where username = lower(trim(uname)) limit 1;
$$;

revoke all on function public.get_email_for_username(text) from public;
grant execute on function public.get_email_for_username(text) to anon, authenticated;
