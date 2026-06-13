-- ═══════════════════════════════════════════════════
-- Shop Manager Tables
-- Run this in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- Products table
create table if not exists shop_products (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null,
  name_en        text not null,
  name_kh        text not null default '',
  category       text not null default 'Other',
  cost_price     numeric(10,2) not null default 0,
  sell_price     numeric(10,2) not null default 0,
  stock          int not null default 0,
  low_stock      int not null default 5,
  unit           text not null default 'pcs',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table shop_products enable row level security;

create policy "Users manage own products"
  on shop_products for all
  using (auth.uid() = user_id);

-- Sales table
create table if not exists shop_sales (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null,
  product_id     uuid references shop_products(id) on delete set null,
  product_name   text not null,
  qty            int not null default 1,
  sell_price     numeric(10,2) not null,
  cost_price     numeric(10,2) not null default 0,
  date           date not null default current_date,
  note           text not null default '',
  created_at     timestamptz not null default now()
);

alter table shop_sales enable row level security;

create policy "Users manage own sales"
  on shop_sales for all
  using (auth.uid() = user_id);

-- Restock table
create table if not exists shop_restock (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null,
  product_id     uuid references shop_products(id) on delete set null,
  product_name   text not null,
  qty            int not null,
  cost_per_unit  numeric(10,2) not null default 0,
  date           date not null default current_date,
  note           text not null default '',
  created_at     timestamptz not null default now()
);

alter table shop_restock enable row level security;

create policy "Users manage own restock"
  on shop_restock for all
  using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════
-- Box / pack pricing  (e.g. Cambodia beer: 1 box = 24 cans)
-- Safe to re-run — uses IF NOT EXISTS.
-- ═══════════════════════════════════════════════════
-- Products: optional pack. pack_size = 1 means "no pack" (sold only by the unit).
-- cost_price / sell_price stay PER BASE UNIT (per can). pack_* hold the box prices.
alter table shop_products add column if not exists pack_size       int           not null default 1;
alter table shop_products add column if not exists pack_unit       text          not null default 'box';
alter table shop_products add column if not exists pack_cost_price numeric(10,2) not null default 0;
alter table shop_products add column if not exists pack_sell_price numeric(10,2) not null default 0;

-- Sales: sale_unit = what was sold ('box' or the base unit); qty / sell_price / cost_price
-- are PER sale_unit; base_qty = total base units consumed (for stock math).
alter table shop_sales add column if not exists sale_unit text not null default '';
alter table shop_sales add column if not exists base_qty  int  not null default 0;
update shop_sales set base_qty = qty where base_qty = 0;
