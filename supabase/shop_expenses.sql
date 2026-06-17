-- ═══════════════════════════════════════════════════
-- Shop operating expenses (rent, electricity, salary, …)
-- Run this in your Supabase SQL Editor.
-- ═══════════════════════════════════════════════════
-- These are running costs of the shop, separate from product cost (COGS).
-- Used in Reports for net profit and the break-even sales estimate.

create table if not exists shop_expenses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  category      text not null default 'Other',
  amount        numeric(10,2) not null default 0,      -- USD
  date          date not null default current_date,
  note          text not null default '',
  created_at    timestamptz not null default now()
);

alter table shop_expenses enable row level security;

create policy "Users manage own expenses"
  on shop_expenses for all
  using (auth.uid() = user_id);
