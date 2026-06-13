# raksa-finance — Project Context

## What this is
A personal finance + shop management web app built with React 18 + Supabase. Deployed to GitHub Pages at https://craksa.github.io/raksa-finance.

## Users & access control
Access is **data-driven via the `profiles` table** (NOT a hardcoded list anymore — the old `SHOP_ALLOWED` array was removed). Each profile has flags: `role` (`'user'`|`'admin'`), `can_finance`, `can_shop`, `disabled`.

| Username | Email | role | Access |
|----------|-------|------|--------|
| raksa | raksask90@gmail.com | admin | Finance + Shop + Users |
| sreydy | raksa.chou99@gmail.com | user | Finance + Shop |
| dara | dara@gmail.com | user | Finance only |

- Username login via `resolveEmail()` in App.jsx — maps username → email, then calls Supabase auth.
- New users self-sign-up and land with `can_finance=true`, `can_shop=false`. The admin grants Shop/Admin from the Users dashboard.
- On load, App.jsx fetches the signed-in user's profile flags; a `disabled` user is signed out immediately. Routing gates on `can_finance` / `can_shop` / `role`.
- `is_admin()` (SQL, security-definer) backs admin-only RLS. Admin can read/manage every user's rows on all per-user tables (for the Users dashboard export/delete).

## Tech stack
- React 18 (Create React App, single-page)
- Supabase (auth + PostgreSQL database)
- GitHub Pages (`npm run deploy` via gh-pages)
- No UI library — all styles are inline or CSS-in-JS via `<style>` tags

## Design system
- Background: `#0f0e17`
- Card background: `#1a1929`
- Border: `#2e2d3d`
- Accent / primary: `#ff8906` (orange)
- Income / success: `#2cb67d` (green)
- Expense / danger: `#f25f4c` (red)
- Muted text: `#a7a9be`
- Font: `DM Mono` (monospace) for body, `Tahoma` for headings/numbers
- KHR exchange rate: 1 USD = 4,100 KHR

## File structure
```
src/
  App.jsx          — Finance app: auth, dashboard, transactions, categories; top-level routing + profile/access gating
  ShopApp.jsx      — Shop manager: products (box/pack pricing), stock, sales, reports, categories
  AdminApp.jsx     — User management dashboard (admin only)
  supabaseClient.js — Supabase client init (reads from .env)
  index.js         — React entry point
supabase/
  profiles.sql        — profiles table + RLS + username login RPC (applied)
  categories.sql      — finance categories table + RLS (applied)
  shop.sql            — shop_products/sales/restock + box/pack pricing columns (applied)
  shop_categories.sql — per-user shop categories + RLS (applied)
  admin.sql           — profiles access flags, is_admin(), admin RLS (applied)
public/
  index.html
```

## Supabase database tables
| Table | Purpose |
|-------|---------|
| `transactions` | Finance income/expense records |
| `categories` | Per-user custom income/expense categories |
| `profiles` | User profile + access flags (`username`, `email`, `role`, `can_finance`, `can_shop`, `disabled`) |
| `shop_products` | Product catalog; per-unit `cost_price`/`sell_price`/`stock` + optional pack (`pack_size`, `pack_unit`, `pack_cost_price`, `pack_sell_price`) |
| `shop_sales` | Sale records; `qty`/`sell_price`/`cost_price` are per `sale_unit`, `base_qty` = base units sold |
| `shop_restock` | Restock records |
| `shop_categories` | Per-user shop product categories |

All per-user tables have RLS (`user_id = auth.uid()`), plus an `is_admin()` policy so the admin can read/manage every user's rows.

## App navigation
- `App()` has `appView` state: `"finance"` | `"shop"` | `"admin"`. Persisted in `localStorage` (`rf_appView`) so a refresh stays on the same view; access is re-checked on render.
- User menu (top-right dropdown): **👥 Users** for admins, **🏪 Shop Manager** for `can_shop` users.
- ShopApp / AdminApp render standalone; "← Finance" returns to appView="finance".
- Modals do NOT close on outside click (only via Save/Cancel) — intentional, to avoid losing form input.

## ShopApp tabs
1. **Products / ទំនិញ** — Add/edit/delete products; low-stock = red left border. Products can optionally be sold by the box/pack (enter the box price; per-unit auto-derived; stock stored in base units, shown as "boxes + loose"). **⚙** button manages categories.
2. **Stock / ស្តុក** — Stock levels overview; low-stock alert panel at top
3. **Sales / លក់** — Record sales (box/unit toggle for packs; deducts stock), today's revenue, delete sale (restores stock)
4. **Reports / របាយការណ៍** — Monthly revenue/cost/profit, top products, low-stock reminder

## User management (AdminApp, admin only)
- Lists all profiles; per user toggle Finance / Shop / Admin / Disabled (self-protected against lockout).
- **Disabled** locks an account out instantly (reversible) — the user is signed out on next load. There is no hard delete (would require a service-role Edge Function, intentionally not used); use Disable instead.
- Categories (both finance & shop): seeded with defaults on first load; rename keeps records in sync; delete blocked while in use.

## Shop business context
Owner: Raksa, Phnom Penh, Cambodia. Small home convenience store (អាជីវកម្មលក់ចាប់ហួយ) selling cleaning supplies, personal care products, food/snacks, drinks, household items.

## Currency
Both USD and KHR supported. Toggle button in header. KHR = USD × 4100.

## Key conventions
- All Supabase calls use `session.user.id` as `user_id` — never trust client-side data for ownership
- Stock updates happen in the app (not DB triggers): sale → decrease stock, delete sale → restore stock, restock → increase stock
- Toast notifications: green `#2cb67d` for success, red `#f25f4c` for errors, auto-dismiss 3s
- Mobile-first: modals slide up from bottom on small screens (`border-radius: 20px 20px 0 0`)

## Commands
```bash
npm start          # local dev server → http://localhost:3000
npm run build      # production build
npm run deploy     # build + push to GitHub Pages
```

## Environment variables (.env)
```
REACT_APP_SUPABASE_URL=https://sibsuveqlxvatufbaeio.supabase.co
REACT_APP_SUPABASE_ANON_KEY=sb_publishable_pam9draqk454P08J0tJs9w_tUGhwRWR
```
