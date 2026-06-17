-- ═══════════════════════════════════════════════════
-- Shop Gifts / Exchanges (promotional giveaways to customers)
-- Run this in your Supabase SQL Editor.
-- ═══════════════════════════════════════════════════
-- Each row is something given free to a customer:
--   kind = 'item'  → a product given away (deducts stock). cost_price is per
--                    sale_unit; base_qty = base units removed from stock.
--   kind = 'cash'  → a cash gift / discount (e.g. 1000 riels). No product,
--                    no stock change. cash_value holds the value in USD.
-- The gift's cost counts as a loss in Reports (revenue stays $0).

create table if not exists shop_exchanges (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  kind          text not null default 'item',          -- 'item' | 'cash'
  product_id    uuid references shop_products(id) on delete set null,
  product_name  text not null default '',
  qty           int not null default 0,                -- in sale_unit
  sale_unit     text not null default '',              -- '' for cash
  base_qty      int not null default 0,                -- base units (for stock)
  cost_price    numeric(10,2) not null default 0,      -- per sale_unit (item cost/loss)
  cash_value    numeric(10,2) not null default 0,      -- USD value for cash gifts
  commission    numeric(10,2) not null default 0,      -- USD commission earned (item promos) — counts as profit
  date          date not null default current_date,
  note          text not null default '',
  created_at    timestamptz not null default now()
);

alter table shop_exchanges enable row level security;

create policy "Users manage own exchanges"
  on shop_exchanges for all
  using (auth.uid() = user_id);

-- Safe to re-run if the table already exists from an earlier version.
alter table shop_exchanges add column if not exists commission numeric(10,2) not null default 0;
