-- Custom categories table — run once in the Supabase SQL editor.
-- Default categories stay hardcoded in the app and are shared by all users;
-- rows in this table are private to the user who created them (enforced by RLS).

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null check (type in ('income', 'expense')),
  name       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, type, name)
);

alter table public.categories enable row level security;

create policy "Users manage own categories"
  on public.categories
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
