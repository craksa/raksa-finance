-- Shop categories — per-user, same rules as finance categories.
-- Defaults are seeded by the app on first load; rows here are the source of
-- truth after that. Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.shop_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.shop_categories enable row level security;

drop policy if exists "Users manage own shop categories" on public.shop_categories;
create policy "Users manage own shop categories"
  on public.shop_categories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Admin (raksa) can read/manage every user's shop categories — keeps the user
-- dashboard's export + delete complete. Requires is_admin() from admin.sql.
drop policy if exists "Admin manages all rows" on public.shop_categories;
create policy "Admin manages all rows"
  on public.shop_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
