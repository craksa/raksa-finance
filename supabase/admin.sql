-- ═══════════════════════════════════════════════════
-- User management / admin dashboard
-- Run this in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════
-- Adds access flags to profiles and lets an admin (raksa) read & manage
-- every user's profile and data. "disabled" is enforced in the app (the
-- user is signed out on load); admin RLS below lets the dashboard read all
-- data for CSV export and delete a user's data.

-- ── 1. Access flags on profiles ──
alter table public.profiles add column if not exists role        text    not null default 'user';   -- 'user' | 'admin'
alter table public.profiles add column if not exists can_finance boolean not null default true;
alter table public.profiles add column if not exists can_shop    boolean not null default false;
alter table public.profiles add column if not exists disabled    boolean not null default false;

-- ── 2. Seed existing accounts ──
update public.profiles set role = 'admin', can_finance = true, can_shop = true where email = 'raksask90@gmail.com';
update public.profiles set can_shop = true                                       where email = 'raksa.chou99@gmail.com';
-- dara@gmail.com keeps the defaults: finance only.

-- ── 3. Admin check (security definer = bypasses RLS, so no recursion) ──
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin' and disabled = false
  );
$$;
grant execute on function public.is_admin() to authenticated;

-- ── 4. profiles RLS: user reads own row; admin reads / updates / deletes all ──
drop policy if exists "Read own profile or admin"   on public.profiles;
create policy "Read own profile or admin"   on public.profiles for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Admin updates profiles"       on public.profiles;
create policy "Admin updates profiles"       on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin deletes profiles"       on public.profiles;
create policy "Admin deletes profiles"       on public.profiles for delete to authenticated
  using (public.is_admin());

-- ── 5. Admin can read & manage every user's data (for export + delete) ──
-- These are ADDED alongside the existing "own rows" policies (RLS is OR-ed).
do $$
declare t text;
begin
  foreach t in array array['transactions','categories','shop_products','shop_sales','shop_restock']
  loop
    execute format('drop policy if exists "Admin manages all rows" on public.%I;', t);
    execute format(
      'create policy "Admin manages all rows" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin());',
      t
    );
  end loop;
end $$;
