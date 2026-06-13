# raksa-finance — Project Context

## What this is
A personal finance + shop management web app built with React 18 + Supabase. Deployed to GitHub Pages at https://craksa.github.io/raksa-finance.

## Users
| Username | Email | Access |
|----------|-------|--------|
| raksa | raksask90@gmail.com | Finance + Shop |
| sreydy | raksa.chou99@gmail.com | Finance + Shop |
| dara | dara@gmail.com | Finance only |

Username login is supported via `resolveEmail()` in App.jsx — maps username → email, then calls Supabase auth. Shop access is restricted to `SHOP_ALLOWED` emails (raksa + sreydy).

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
  App.jsx          — Finance app (1150+ lines): auth, dashboard, transactions, categories
  ShopApp.jsx      — Shop manager: products, stock, sales, reports
  supabaseClient.js — Supabase client init (reads from .env)
  index.js         — React entry point
supabase/
  profiles.sql     — profiles table + RLS (already applied)
  categories.sql   — categories table + RLS (already applied)
  shop.sql         — shop_products, shop_sales, shop_restock tables + RLS (already applied)
public/
  index.html
```

## Supabase database tables
| Table | Purpose |
|-------|---------|
| `transactions` | Finance income/expense records |
| `categories` | Per-user custom income/expense categories |
| `profiles` | User profile data |
| `shop_products` | Product catalog (name_en, name_kh, cost_price, sell_price, stock, etc.) |
| `shop_sales` | Sale records (auto-decrements stock on insert) |
| `shop_restock` | Restock records (auto-increments stock on insert) |

All tables have Row Level Security — `user_id = auth.uid()`.

## App navigation
- `App()` has `appView` state: `"finance"` (default) or `"shop"`
- User menu (top-right dropdown) shows **🏪 Shop Manager** for allowed users
- ShopApp renders standalone; "← Finance" button returns to appView="finance"

## ShopApp tabs
1. **Products / ទំនិញ** — Add/edit/delete products; low-stock items highlighted with red left border
2. **Stock / ស្តុក** — Stock levels overview; low-stock alert panel at top
3. **Sales / លក់** — Record sales (deducts stock), today's revenue summary, delete sale (restores stock)
4. **Reports / របាយការណ៍** — Monthly revenue/cost/profit, top products, low-stock reminder

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
