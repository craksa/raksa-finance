import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const KHR_RATE = 4100;
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SHOP_CATS = [
  "Cleaning / សម្អាត",
  "Personal Care / ថែទាំខ្លួន",
  "Food & Snacks / អាហារ",
  "Drinks / ភេសជ្ជៈ",
  "Medicine / ថ្នាំ",
  "Household / ផ្ទះ",
  "Other / ផ្សេងៗ",
];
const UNITS = ["pcs","can","bottle","bag","pack","sachet","kg","g","roll","tube","bar"];
const PACK_UNITS = ["box","pack","carton","case","crate","dozen","tray"];
const EXPENSE_CATS = [
  "Rent / ជួលផ្ទះ",
  "Electricity / អគ្គិសនី",
  "Water / ទឹក",
  "Salary / ប្រាក់ខែ",
  "Transport / ដឹកជញ្ជូន",
  "Supplies / សម្ភារៈ",
  "Internet/Phone / អ៊ីនធឺណិត",
  "Other / ផ្សេងៗ",
];

function fmtUSD(n) { return "$" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function fmtKHR(n) { return "៛" + Math.round(n * KHR_RATE).toLocaleString(); }
function todayStr() { return new Date().toISOString().split("T")[0]; }
const pad2 = n => String(n).padStart(2, "0");
function nowTime() { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
// Combine a yyyy-mm-dd date and an HH:MM time (local) into an ISO timestamp.
function toTimestamp(date, time) {
  const t = /^\d{2}:\d{2}$/.test(time || "") ? time : "00:00";
  return new Date(`${date}T${t}`).toISOString();
}
// Local HH:MM from a row's created_at (falls back to now for old rows).
function timeOf(row) {
  const c = row && row.created_at ? new Date(row.created_at) : new Date();
  return `${pad2(c.getHours())}:${pad2(c.getMinutes())}`;
}
// Local yyyy-mm-dd from a row's created_at (for date inputs).
function dateOf(row) {
  const c = row && row.created_at ? new Date(row.created_at) : new Date();
  return `${c.getFullYear()}-${pad2(c.getMonth()+1)}-${pad2(c.getDate())}`;
}
// dd-Mon-yyyy hh:mm from a row's created_at (for display).
function fmtDT(row) {
  if (!row || !row.created_at) return "";
  const c = new Date(row.created_at);
  return `${pad2(c.getDate())}-${MONTHS_FULL[c.getMonth()].slice(0,3)}-${c.getFullYear()} ${pad2(c.getHours())}:${pad2(c.getMinutes())}`;
}

// ── Pack helpers ── (stock is always stored in base units; we display boxes + loose)
function hasPack(p) { return Number(p.pack_size) > 1; }
function packBoxes(p) { return Math.floor(p.stock / p.pack_size); }
function packLoose(p) { return p.stock % p.pack_size; }
function fmtStock(p) {
  if (!hasPack(p)) return `${p.stock} ${p.unit}`;
  const boxes = packBoxes(p), loose = packLoose(p), pu = p.pack_unit || "box";
  if (boxes && loose) return `${boxes} ${pu} + ${loose} ${p.unit}`;
  if (boxes)          return `${boxes} ${pu}`;
  return `${loose} ${p.unit}`;
}

const BLANK_PROD = { name_en:"", name_kh:"", category:SHOP_CATS[0], cost_price:"", sell_price:"", stock:"0", low_stock:"5", unit:"pcs", has_pack:false, pack_size:"24", pack_unit:"box", pack_cost_price:"", pack_sell_price:"", date:todayStr(), time:nowTime() };
const BLANK_SALE = { product_id:"", qty:"1", mode:"unit", date:todayStr(), time:nowTime(), note:"" };
const BLANK_RESTOCK = { qty:"", mode:"unit", cost_per_unit:"", date:todayStr(), note:"" };
const BLANK_EXCH = { kind:"item", product_id:"", qty:"1", mode:"unit", cash_value:"", commission:"", date:todayStr(), time:nowTime(), note:"" };
const BLANK_EXPENSE = { category:EXPENSE_CATS[0], amount:"", date:todayStr(), time:nowTime(), note:"" };

export default function ShopApp({ session, onBack, canShop = true }) {
  const [tab, setTab]             = useState("products");
  const [cur, setCur]             = useState("USD");
  const [products, setProducts]   = useState([]);
  const [sales, setSales]         = useState([]);
  const [exchanges, setExchanges] = useState([]);
  const [expenses, setExpenses]   = useState([]);
  const [shopCats, setShopCats]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState(null);
  const [search, setSearch]       = useState("");
  const [showCatMgr, setShowCatMgr] = useState(false);

  // Product form
  const [showProdForm, setShowProdForm] = useState(false);
  const [editProd, setEditProd]         = useState(null);
  const [prodForm, setProdForm]         = useState(BLANK_PROD);

  // Sale form
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [saleForm, setSaleForm]         = useState(BLANK_SALE);

  // Restock form
  const [showRestockForm, setShowRestockForm] = useState(false);
  const [restockFor, setRestockFor]           = useState(null);
  const [restockForm, setRestockForm]         = useState(BLANK_RESTOCK);

  // Gift / exchange form
  const [showExchForm, setShowExchForm] = useState(false);
  const [exchForm, setExchForm]         = useState(BLANK_EXCH);
  const [exchFilter, setExchFilter]     = useState("today"); // "today" | "all"

  // Expense form
  const [showExpForm, setShowExpForm]   = useState(false);
  const [expForm, setExpForm]           = useState(BLANK_EXPENSE);

  // Sales list filter: "today" | "month" | "range"
  const [salesMode, setSalesMode]   = useState("today");
  const [salesFrom, setSalesFrom]   = useState(todayStr());
  const [salesTo, setSalesTo]       = useState(todayStr());
  const [salesMonth, setSalesMonth] = useState(new Date().getMonth());
  const [salesYear, setSalesYear]   = useState(new Date().getFullYear());

  // Expense list filter: "today" | "month" | "range"
  const [expMode, setExpMode]   = useState("month");
  const [expFrom, setExpFrom]   = useState(todayStr());
  const [expTo, setExpTo]       = useState(todayStr());
  const [expMonth, setExpMonth] = useState(new Date().getMonth());
  const [expYear, setExpYear]   = useState(new Date().getFullYear());

  // Report period: "day" | "month" | "range"
  const [rptMode, setRptMode]   = useState("day");
  const [rptMonth, setRptMonth] = useState(new Date().getMonth());
  const [rptYear, setRptYear]   = useState(new Date().getFullYear());
  const [rptDay, setRptDay]     = useState(todayStr());
  const [rptFrom, setRptFrom]   = useState(todayStr());
  const [rptTo, setRptTo]       = useState(todayStr());

  const fmt = n => cur === "USD" ? fmtUSD(n) : fmtKHR(n);
  const uid = session.user.id;
  const showToast = (msg, color = "#2cb67d") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Access guard ──
  if (!canShop) {
    return (
      <div style={{ minHeight:"100vh", background:"#0f0e17", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace", textAlign:"center", padding:20 }}>
        <div style={{ fontSize:40, marginBottom:16 }}>⛔</div>
        <div style={{ fontSize:16, color:"#f25f4c", marginBottom:8 }}>Access Denied</div>
        <div style={{ fontSize:12, color:"#a7a9be", marginBottom:24 }}>This account does not have shop access.</div>
        <button onClick={onBack} style={{ padding:"10px 20px", background:"transparent", color:"#ff8906", border:"1px solid #ff8906", borderRadius:8, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>← Back to Finance</button>
      </div>
    );
  }

  // ── Load data ──
  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [pRes, sRes, cRes, eRes, xRes] = await Promise.all([
      supabase.from("shop_products").select("*").eq("user_id", uid).order("name_en"),
      supabase.from("shop_sales").select("*").eq("user_id", uid).order("date", { ascending:false }).order("created_at", { ascending:false }),
      supabase.from("shop_categories").select("*").eq("user_id", uid).order("name"),
      supabase.from("shop_exchanges").select("*").eq("user_id", uid).order("date", { ascending:false }).order("created_at", { ascending:false }),
      supabase.from("shop_expenses").select("*").eq("user_id", uid).order("date", { ascending:false }).order("created_at", { ascending:false }),
    ]);
    if (!pRes.error) setProducts(pRes.data || []);
    if (!sRes.error) setSales(sRes.data || []);
    if (!eRes.error) setExchanges(eRes.data || []);
    if (!xRes.error) setExpenses(xRes.data || []);
    if (!cRes.error) {
      let rows = cRes.data || [];
      // First load for this user: seed the default categories.
      if (rows.length === 0) {
        const { data: seeded } = await supabase.from("shop_categories")
          .insert(SHOP_CATS.map(name => ({ user_id: uid, name }))).select();
        rows = (seeded || []).sort((a,b) => a.name.localeCompare(b.name));
      }
      setShopCats(rows);
    }
    setLoading(false);
  }

  // This user's categories (defaults seeded on first load); falls back to the
  // built-in list until the fetch/seed completes.
  const catNames = shopCats.length ? shopCats.map(c => c.name) : SHOP_CATS;

  // ── Product CRUD ──
  function openAddProd() { setProdForm({ ...BLANK_PROD, category: catNames[0] || SHOP_CATS[0], date:todayStr(), time:nowTime() }); setEditProd(null); setShowProdForm(true); }
  function openEditProd(p) {
    const packed = hasPack(p);
    setProdForm({
      name_en:p.name_en, name_kh:p.name_kh||"", category:p.category,
      cost_price:String(p.cost_price), sell_price:String(p.sell_price),
      stock:String(p.stock), low_stock:String(p.low_stock), unit:p.unit,
      has_pack:packed,
      pack_size:String(packed ? p.pack_size : 24),
      pack_unit:p.pack_unit || "box",
      pack_cost_price:packed ? String(p.pack_cost_price) : "",
      pack_sell_price:packed ? String(p.pack_sell_price) : "",
      date:dateOf(p), time:timeOf(p),
    });
    setEditProd(p); setShowProdForm(true);
  }

  async function saveProd() {
    if (!prodForm.name_en.trim()) { showToast("Product name required", "#f25f4c"); return; }
    const packed   = prodForm.has_pack;
    const packSize = Math.max(1, parseInt(prodForm.pack_size) || 1);
    if (packed && packSize < 2)        { showToast("Pack size must be 2 or more", "#f25f4c"); return; }
    if (packed && !prodForm.pack_sell_price) { showToast("Box selling price required", "#f25f4c"); return; }
    if (!packed && !prodForm.sell_price)     { showToast("Selling price required", "#f25f4c"); return; }

    // Per-unit prices: for a pack, derive from the box price (box ÷ pack size).
    const boxCost = parseFloat(prodForm.pack_cost_price) || 0;
    const boxSell = parseFloat(prodForm.pack_sell_price) || 0;
    const unitCost = packed ? boxCost / packSize : (parseFloat(prodForm.cost_price) || 0);
    const unitSell = packed ? boxSell / packSize : (parseFloat(prodForm.sell_price) || 0);

    const payload = {
      user_id:    uid,
      name_en:    prodForm.name_en.trim(),
      name_kh:    prodForm.name_kh.trim(),
      category:   prodForm.category,
      cost_price: Math.round(unitCost * 100) / 100,
      sell_price: Math.round(unitSell * 100) / 100,
      stock:      parseInt(prodForm.stock) || 0,
      low_stock:  parseInt(prodForm.low_stock) || 5,
      unit:       prodForm.unit,
      pack_size:       packed ? packSize : 1,
      pack_unit:       prodForm.pack_unit || "box",
      pack_cost_price: packed ? boxCost : 0,
      pack_sell_price: packed ? boxSell : 0,
      created_at: toTimestamp(prodForm.date, prodForm.time),
      updated_at: new Date().toISOString(),
    };
    if (editProd) {
      const { error } = await supabase.from("shop_products").update(payload).eq("id", editProd.id);
      if (error) { showToast("Failed to save", "#f25f4c"); return; }
      setProducts(prev => prev.map(p => p.id === editProd.id ? { ...p, ...payload } : p));
      showToast("Product updated ✓");
    } else {
      const { data, error } = await supabase.from("shop_products").insert(payload).select().single();
      if (error) { showToast("Failed to add", "#f25f4c"); return; }
      setProducts(prev => [...prev, data].sort((a,b) => a.name_en.localeCompare(b.name_en)));
      showToast("Product added ✓");
    }
    setShowProdForm(false);
  }

  async function deleteProd(p) {
    if (!window.confirm(`Delete "${p.name_en}"?`)) return;
    const { error } = await supabase.from("shop_products").delete().eq("id", p.id);
    if (error) { showToast("Failed to delete", "#f25f4c"); return; }
    setProducts(prev => prev.filter(x => x.id !== p.id));
    showToast("Deleted ✓");
  }

  // ── Record Sale ──
  async function recordSale() {
    if (!saleForm.product_id) { showToast("Select a product", "#f25f4c"); return; }
    const qty = parseInt(saleForm.qty) || 1;
    if (qty < 1) { showToast("Qty must be at least 1", "#f25f4c"); return; }
    const prod = products.find(p => p.id === saleForm.product_id);
    if (!prod) return;
    const regDate = dateOf(prod);   // product registration date (from created_at)
    if (saleForm.date < regDate) { showToast(`Can't sell before product was added (${regDate})`, "#f25f4c"); return; }
    const isBox     = hasPack(prod) && saleForm.mode === "box";
    const saleUnit  = isBox ? (prod.pack_unit || "box") : prod.unit;
    const baseQty   = isBox ? qty * prod.pack_size : qty;          // base units consumed
    const unitSell  = isBox ? prod.pack_sell_price : prod.sell_price;
    const unitCost  = isBox ? prod.pack_cost_price : prod.cost_price;
    if (prod.stock < baseQty) { showToast(`Only ${fmtStock(prod)} in stock!`, "#f25f4c"); return; }

    const { data: sd, error } = await supabase.from("shop_sales").insert({
      user_id:      uid,
      product_id:   prod.id,
      product_name: prod.name_en + (prod.name_kh ? ` / ${prod.name_kh}` : ""),
      qty,
      sale_unit:    saleUnit,
      base_qty:     baseQty,
      sell_price:   unitSell,
      cost_price:   unitCost,
      date:         saleForm.date,
      created_at:   toTimestamp(saleForm.date, saleForm.time),
      note:         saleForm.note,
    }).select().single();
    if (error) { showToast("Failed to record sale", "#f25f4c"); return; }

    const newStock = prod.stock - baseQty;
    await supabase.from("shop_products").update({ stock:newStock, updated_at:new Date().toISOString() }).eq("id", prod.id);
    setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, stock:newStock } : p));
    setSales(prev => [sd, ...prev]);
    setSaleForm(BLANK_SALE);
    setShowSaleForm(false);
    showToast(`Sale recorded ✓ — ${qty} ${saleUnit} × ${prod.name_en}`);
  }

  async function deleteSale(s) {
    if (!window.confirm("Delete this sale?")) return;
    const { error } = await supabase.from("shop_sales").delete().eq("id", s.id);
    if (error) { showToast("Failed", "#f25f4c"); return; }
    // Restore stock
    const prod = products.find(p => p.id === s.product_id);
    if (prod) {
      const newStock = prod.stock + (s.base_qty || s.qty);
      await supabase.from("shop_products").update({ stock:newStock }).eq("id", prod.id);
      setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, stock:newStock } : p));
    }
    setSales(prev => prev.filter(x => x.id !== s.id));
    showToast("Deleted ✓");
  }

  // ── Gifts / Exchange ──
  function openExch() { setExchForm({ ...BLANK_EXCH, date:todayStr(), time:nowTime() }); setShowExchForm(true); }

  async function recordExchange() {
    const created_at = toTimestamp(exchForm.date, exchForm.time);
    if (exchForm.kind === "cash") {
      const entered = parseFloat(exchForm.cash_value) || 0;
      if (entered <= 0) { showToast("Enter an exchange amount", "#f25f4c"); return; }
      const usd = cur === "KHR" ? entered / KHR_RATE : entered;   // store value in USD
      const { data: ed, error } = await supabase.from("shop_exchanges").insert({
        user_id:      uid,
        kind:         "cash",
        product_name: "",
        qty:          0,
        sale_unit:    "",
        base_qty:     0,
        cost_price:   0,
        cash_value:   usd,
        date:         exchForm.date,
        created_at,
        note:         exchForm.note,
      }).select().single();
      if (error) { showToast("Failed to record exchange", "#f25f4c"); return; }
      setExchanges(prev => [ed, ...prev]);
      setExchForm(BLANK_EXCH);
      setShowExchForm(false);
      showToast(`Exchange recorded ✓ — ${fmt(usd)}`);
      return;
    }

    // Item gift — deducts stock
    const prod = products.find(p => p.id === exchForm.product_id);
    if (!prod) { showToast("Select a product", "#f25f4c"); return; }
    const regDate = dateOf(prod);   // product registration date (from created_at)
    if (exchForm.date < regDate) { showToast(`Can't give before product was added (${regDate})`, "#f25f4c"); return; }
    const qty = parseInt(exchForm.qty) || 0;
    if (qty < 1) { showToast("Enter a quantity", "#f25f4c"); return; }
    const isBox    = hasPack(prod) && exchForm.mode === "box";
    const saleUnit = isBox ? (prod.pack_unit || "box") : prod.unit;
    const baseQty  = isBox ? qty * prod.pack_size : qty;
    const unitCost = isBox ? prod.pack_cost_price : prod.cost_price;
    if (prod.stock < baseQty) { showToast(`Only ${fmtStock(prod)} in stock!`, "#f25f4c"); return; }
    const commEntered = parseFloat(exchForm.commission) || 0;
    const commission  = cur === "KHR" ? commEntered / KHR_RATE : commEntered;   // store in USD

    const { data: ed, error } = await supabase.from("shop_exchanges").insert({
      user_id:      uid,
      kind:         "item",
      product_id:   prod.id,
      product_name: prod.name_en + (prod.name_kh ? ` / ${prod.name_kh}` : ""),
      qty,
      sale_unit:    saleUnit,
      base_qty:     baseQty,
      cost_price:   unitCost,
      cash_value:   0,
      commission,
      date:         exchForm.date,
      created_at,
      note:         exchForm.note,
    }).select().single();
    if (error) { showToast("Failed to record exchange", "#f25f4c"); return; }

    const newStock = prod.stock - baseQty;
    await supabase.from("shop_products").update({ stock:newStock, updated_at:new Date().toISOString() }).eq("id", prod.id);
    setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, stock:newStock } : p));
    setExchanges(prev => [ed, ...prev]);
    setExchForm(BLANK_EXCH);
    setShowExchForm(false);
    showToast(`Exchange recorded ✓ — ${qty} ${saleUnit} × ${prod.name_en}`);
  }

  async function deleteExchange(e) {
    if (!window.confirm("Delete this exchange?")) return;
    const { error } = await supabase.from("shop_exchanges").delete().eq("id", e.id);
    if (error) { showToast("Failed", "#f25f4c"); return; }
    // Restore stock for item gifts
    if (e.kind === "item") {
      const prod = products.find(p => p.id === e.product_id);
      if (prod) {
        const newStock = prod.stock + (e.base_qty || e.qty);
        await supabase.from("shop_products").update({ stock:newStock }).eq("id", prod.id);
        setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, stock:newStock } : p));
      }
    }
    setExchanges(prev => prev.filter(x => x.id !== e.id));
    showToast("Deleted ✓");
  }

  // ── Expenses ──
  function openExp() { setExpForm({ ...BLANK_EXPENSE, date:todayStr(), time:nowTime() }); setShowExpForm(true); }

  async function recordExpense() {
    const entered = parseFloat(expForm.amount) || 0;
    if (entered <= 0) { showToast("Enter an amount", "#f25f4c"); return; }
    const usd = cur === "KHR" ? entered / KHR_RATE : entered;   // store in USD
    const { data: xd, error } = await supabase.from("shop_expenses").insert({
      user_id:   uid,
      category:  expForm.category,
      amount:    usd,
      date:      expForm.date,
      created_at: toTimestamp(expForm.date, expForm.time),
      note:      expForm.note,
    }).select().single();
    if (error) { showToast("Failed to record expense", "#f25f4c"); return; }
    setExpenses(prev => [xd, ...prev]);
    setExpForm(BLANK_EXPENSE);
    setShowExpForm(false);
    showToast(`Expense recorded ✓ — ${fmt(usd)}`);
  }

  async function deleteExpense(x) {
    if (!window.confirm("Delete this expense?")) return;
    const { error } = await supabase.from("shop_expenses").delete().eq("id", x.id);
    if (error) { showToast("Failed", "#f25f4c"); return; }
    setExpenses(prev => prev.filter(e => e.id !== x.id));
    showToast("Deleted ✓");
  }

  // ── Restock ──
  function openRestock(p) { setRestockFor(p); setRestockForm({ ...BLANK_RESTOCK, mode: hasPack(p) ? "box" : "unit", date:todayStr() }); setShowRestockForm(true); }

  async function recordRestock() {
    const qty = parseInt(restockForm.qty) || 0;
    if (qty < 1) { showToast("Enter quantity", "#f25f4c"); return; }
    if (!restockFor) return;

    const isBox   = hasPack(restockFor) && restockForm.mode === "box";
    const baseQty = isBox ? qty * restockFor.pack_size : qty;     // base units added
    const enteredCost = parseFloat(restockForm.cost_per_unit);
    // Store cost per base unit; if a box cost was entered, divide it across the pack.
    const costPerUnit = !isNaN(enteredCost)
      ? (isBox ? enteredCost / restockFor.pack_size : enteredCost)
      : restockFor.cost_price;

    const { error } = await supabase.from("shop_restock").insert({
      user_id:      uid,
      product_id:   restockFor.id,
      product_name: restockFor.name_en,
      qty:          baseQty,
      cost_per_unit: Math.round(costPerUnit * 100) / 100,
      date:         restockForm.date,
      note:         restockForm.note,
    });
    if (error) { showToast("Failed", "#f25f4c"); return; }

    const newStock = restockFor.stock + baseQty;
    await supabase.from("shop_products").update({ stock:newStock, updated_at:new Date().toISOString() }).eq("id", restockFor.id);
    setProducts(prev => prev.map(p => p.id === restockFor.id ? { ...p, stock:newStock } : p));
    setShowRestockForm(false);
    showToast(`Restocked ${qty} ${isBox ? (restockFor.pack_unit||"box") : restockFor.unit} × ${restockFor.name_en} ✓`);
  }

  // ── Derived data ──
  const lowStock     = products.filter(p => p.stock <= p.low_stock);
  const filteredProds = products.filter(p =>
    p.name_en.toLowerCase().includes(search.toLowerCase()) ||
    p.name_kh.includes(search) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  // Report period — date columns are "yyyy-mm-dd" strings, so string compare works for ranges.
  const inPeriod = (row) => {
    if (rptMode === "day")   return row.date === rptDay;
    if (rptMode === "range") return row.date >= rptFrom && row.date <= rptTo;
    const d = new Date(row.date); return d.getMonth() === rptMonth && d.getFullYear() === rptYear;
  };
  // Cost (loss) of an exchange: item = unit cost × qty; cash = the cash value.
  const giftCost   = (e) => e.kind === "cash" ? Number(e.cash_value) : e.cost_price * e.qty;
  // Commission earned (item promos only) — counts as profit.
  const commOf     = (e) => Number(e.commission) || 0;

  const rptSales   = sales.filter(inPeriod);
  const rptExch    = exchanges.filter(inPeriod);
  const rptExpRows = expenses.filter(inPeriod);
  const rptRevenue = rptSales.reduce((a,s) => a + s.sell_price * s.qty, 0);
  const rptCost    = rptSales.reduce((a,s) => a + s.cost_price * s.qty, 0);
  const rptGift    = rptExch.reduce((a,e) => a + giftCost(e), 0);
  const rptComm    = rptExch.reduce((a,e) => a + commOf(e), 0);
  const rptProfit  = rptRevenue - rptCost - rptGift + rptComm;            // gross profit (before operating expenses)
  const rptExpense = rptExpRows.reduce((a,x) => a + Number(x.amount), 0); // operating expenses
  const rptNet     = rptProfit - rptExpense;                             // net profit after expenses
  // Gross margin ratio = how much profit each $1 of sales generates.
  const rptMargin  = rptRevenue > 0 ? rptProfit / rptRevenue : 0;
  // Break-even: sales revenue needed to cover the operating expenses at this margin.
  const rptBreakEven = rptMargin > 0 ? rptExpense / rptMargin : null;
  const rptLabel   = rptMode === "day"   ? rptDay
                   : rptMode === "range" ? `${rptFrom} → ${rptTo}`
                   :                       `${MONTHS_FULL[rptMonth]} ${rptYear}`;

  const nowD = new Date();
  // Filter rows by a tab's Today / Month / Range selection. Month uses the tab's
  // own month/year so the user can navigate to other months.
  const byPeriod = (rows, p) => rows.filter(r =>
    p.mode === "today" ? r.date === todayStr()
    : p.mode === "range" ? (p.from && p.to && r.date >= p.from && r.date <= p.to)
    : (() => { const d = new Date(r.date); return d.getMonth() === p.month && d.getFullYear() === p.year; })());
  const periodLabel = (p) =>
    p.mode === "today" ? "Today / ថ្ងៃនេះ"
    : p.mode === "range" ? (p.from && p.to ? `${p.from} → ${p.to}` : "Pick dates")
    : `${MONTHS_FULL[p.month]} ${p.year}`;
  // Today / Month / Range segmented filter (shared by Sales & Expense tabs).
  const renderPeriodFilter = (p) => (
    <>
      <div style={{ display:"flex", gap:8, marginBottom: p.mode === "today" ? 14 : 10 }}>
        {[
          { id:"today", label:"Today / ថ្ងៃនេះ" },
          { id:"month", label:"Month / ខែ" },
          { id:"range", label:"Range / ចន្លោះ" },
        ].map(o => (
          <button key={o.id} className={`sh-btn ${p.mode === o.id ? "sh-primary" : "sh-ghost"}`}
            style={{ flex:1, fontSize:11, padding:"8px 4px" }}
            onClick={() => p.setMode(o.id)}>{o.label}</button>
        ))}
      </div>
      {p.mode === "month" && (
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <button className="sh-btn sh-ghost" style={{ padding:"6px 14px", fontSize:18 }}
            onClick={() => { if (p.month === 0) { p.setMonth(11); p.setYear(y => y-1); } else p.setMonth(m => m-1); }}>‹</button>
          <div style={{ flex:1, textAlign:"center", fontFamily:"Tahoma,sans-serif", fontWeight:700, fontSize:15 }}>
            {MONTHS_FULL[p.month]} {p.year}
          </div>
          <button className="sh-btn sh-ghost" style={{ padding:"6px 14px", fontSize:18 }}
            onClick={() => { if (p.month === 11) { p.setMonth(0); p.setYear(y => y+1); } else p.setMonth(m => m+1); }}>›</button>
        </div>
      )}
      {p.mode === "range" && (
        <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center" }}>
          <input className="sh-inp" type="date" value={p.from} max={p.to || todayStr()} onChange={e => p.setFrom(e.target.value)} style={{ flex:1 }}/>
          <span style={{ color:"#a7a9be", fontSize:12 }}>→</span>
          <input className="sh-inp" type="date" value={p.to} min={p.from} max={todayStr()} onChange={e => p.setTo(e.target.value)} style={{ flex:1 }}/>
        </div>
      )}
    </>
  );
  // Bundle each tab's period state for the helpers above.
  const salesPeriod = { mode:salesMode, setMode:setSalesMode, from:salesFrom, setFrom:setSalesFrom, to:salesTo, setTo:setSalesTo, month:salesMonth, setMonth:setSalesMonth, year:salesYear, setYear:setSalesYear };
  const expPeriod   = { mode:expMode,   setMode:setExpMode,   from:expFrom,   setFrom:setExpFrom,   to:expTo,   setTo:setExpTo,   month:expMonth,   setMonth:setExpMonth,   year:expYear,   setYear:setExpYear };

  const todayExch     = exchanges.filter(e => e.date === todayStr());
  const todayGiftCost = todayExch.reduce((a,e) => a + giftCost(e), 0);
  const todayComm     = todayExch.reduce((a,e) => a + commOf(e), 0);

  const sortByDateTime = (a,b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || (new Date(b.created_at||0) - new Date(a.created_at||0));

  // Sales tab — filtered view + totals
  const salesInView    = byPeriod(sales, salesPeriod);
  const salesViewRev    = salesInView.reduce((a,s) => a + s.sell_price * s.qty, 0);
  const salesViewProfit = salesInView.reduce((a,s) => a + (s.sell_price - s.cost_price) * s.qty, 0);
  const visibleSales    = salesInView.slice().sort(sortByDateTime);

  // Expense tab — filtered view + total
  const expInView    = byPeriod(expenses, expPeriod);
  const expViewTotal = expInView.reduce((a,x) => a + Number(x.amount), 0);
  const visibleExp   = expInView.slice().sort(sortByDateTime);

  // Gifts tab list filter
  const visibleExch  = (exchFilter === "today" ? todayExch : exchanges).slice().sort(sortByDateTime);

  // Top products for report
  const topProds = (() => {
    const map = {};
    rptSales.forEach(s => {
      if (!map[s.product_name]) map[s.product_name] = { qty:0, revenue:0, profit:0 };
      map[s.product_name].qty     += (s.base_qty || s.qty);
      map[s.product_name].revenue += s.sell_price * s.qty;
      map[s.product_name].profit  += (s.sell_price - s.cost_price) * s.qty;
    });
    return Object.entries(map).sort((a,b) => b[1].revenue - a[1].revenue);
  })();

  // ── Styles ──
  const TABS = [
    { id:"products", label:"Products / ទំនិញ" },
    { id:"stock",    label:"Stock / ស្តុក" },
    { id:"sales",    label:"Sales / លក់" },
    { id:"gifts",    label:"Exchange / រង្វាន់" },
    { id:"expense",  label:"Expense / ចំណាយ" },
    { id:"reports",  label:"Reports / របាយការណ៍" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#0f0e17", fontFamily:"'DM Mono','Courier New',monospace", color:"#fffffe", overflowX:"hidden", maxWidth:"100vw" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0f0e17}::-webkit-scrollbar-thumb{background:#ff8906;border-radius:2px}
        .sh-btn{cursor:pointer;border:none;border-radius:6px;font-family:inherit;font-size:13px;font-weight:500;padding:10px 18px;transition:all .15s}
        .sh-primary{background:#ff8906;color:#0f0e17}.sh-primary:hover{background:#ffaa44}
        .sh-ghost{background:transparent;color:#a7a9be;border:1px solid #2e2d3d}.sh-ghost:hover{border-color:#ff8906;color:#ff8906}
        .sh-danger{background:transparent;color:#f25f4c;border:1px solid #f25f4c22;font-size:11px;padding:5px 10px;border-radius:6px;cursor:pointer;font-family:inherit;transition:all .15s}.sh-danger:hover{background:#f25f4c22}
        .sh-inp{background:#12111f;border:1px solid #2e2d3d;border-radius:6px;color:#fffffe;font-family:inherit;font-size:13px;padding:10px 14px;width:100%;outline:none;transition:border .15s}
        .sh-inp:focus{border-color:#ff8906} select.sh-inp option{background:#1a1929}
        input[type=date].sh-inp{text-align:left;-webkit-appearance:none;appearance:none}
        .sh-card{background:#1a1929;border:1px solid #2e2d3d;border-radius:12px;padding:14px 16px;margin-bottom:10px}
        .sh-tab{cursor:pointer;padding:8px 14px;border-radius:6px;font-size:12px;color:#a7a9be;transition:all .15s;border:none;background:transparent;font-family:inherit;white-space:nowrap}
        .sh-tab.active{background:#ff8906;color:#0f0e17;font-weight:500}
        .sh-overlay{position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px}
        .sh-modal{background:#1a1929;border:1px solid #2e2d3d;border-radius:16px;padding:24px;width:calc(100vw - 32px);max-width:460px;max-height:92vh;overflow-y:auto}
        .sh-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);padding:10px 22px;border-radius:8px;font-size:13px;font-weight:500;z-index:200;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.4);animation:sh-fadeup .25s ease}
        @keyframes sh-fadeup{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        .sh-row{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #1e1d2e}
        .sh-row:last-child{border-bottom:none}
        .sh-lbl{font-size:11px;color:#a7a9be;display:block;margin-bottom:4px}
        .dt-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        @media(max-width:480px){
          .sh-modal{border-radius:20px 20px 0 0;max-height:92vh;max-width:100%;width:100%}
          .sh-overlay{align-items:flex-end;padding:0}
          .sh-inp{min-height:44px}
          .sh-tab{padding:8px 10px;font-size:11px}
          .dt-grid{grid-template-columns:1fr}
        }
      `}</style>

      {toast && <div className="sh-toast" style={{ background:toast.color, color:"#fff" }}>{toast.msg}</div>}

      {/* ── Header ── */}
      <div style={{ background:"#12111f", borderBottom:"1px solid #2e2d3d", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
        <div>
          <div style={{ fontFamily:"Tahoma,sans-serif", fontSize:"clamp(15px,4vw,20px)", fontWeight:800, color:"#ff8906" }}>
            Shop Manager
          </div>
          <div style={{ fontSize:10, color:"#a7a9be", marginTop:2 }}>
            {products.length} products ·{" "}
            {lowStock.length > 0
              ? <span style={{ color:"#f25f4c" }}>{lowStock.length} low stock ⚠</span>
              : <span style={{ color:"#2cb67d" }}>All stocked ✓</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:8, flexShrink:0 }}>
          <button className="sh-btn sh-ghost" style={{ padding:"6px 12px", fontSize:12 }} onClick={() => setCur(c => c === "USD" ? "KHR" : "USD")}>
            {cur === "USD" ? "$ USD" : "៛ KHR"}
          </button>
          <button className="sh-btn sh-ghost" style={{ padding:"6px 12px", fontSize:12 }} onClick={onBack}>
            ← Finance
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ background:"#12111f", borderBottom:"1px solid #2e2d3d", padding:"10px 20px", display:"flex", gap:6, overflowX:"auto" }}>
        {TABS.map(t => (
          <button key={t.id} className={`sh-tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding:"16px 20px 100px" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:50, color:"#a7a9be", fontSize:13 }}>Loading...</div>
        ) : (
          <>

            {/* ══════════ PRODUCTS ══════════ */}
            {tab === "products" && (
              <div>
                <div style={{ display:"flex", gap:10, marginBottom:14 }}>
                  <input className="sh-inp" placeholder="Search / ស្វែងរក..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex:1 }}/>
                  <button className="sh-btn sh-ghost" onClick={() => setShowCatMgr(true)} style={{ flexShrink:0 }} title="Manage categories">⚙</button>
                  <button className="sh-btn sh-primary" onClick={openAddProd} style={{ flexShrink:0 }}>+ Add</button>
                </div>

                {filteredProds.length === 0 && (
                  <div style={{ textAlign:"center", color:"#a7a9be", padding:40, fontSize:13 }}>
                    {search ? "No products match." : "No products yet — add your first one!"}
                  </div>
                )}

                {filteredProds.map(p => (
                  <div key={p.id} className="sh-card" style={{ borderLeft: p.stock <= p.low_stock ? "3px solid #f25f4c" : "3px solid transparent" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:14, marginBottom:2 }}>{p.name_en}</div>
                        {p.name_kh && <div style={{ fontSize:12, color:"#a7a9be", marginBottom:4 }}>{p.name_kh}</div>}
                        <div style={{ fontSize:11, color:"#a7a9be", marginBottom:4 }}>
                          {p.category}{hasPack(p) && <span style={{ color:"#ff8906" }}> · 1 {p.pack_unit||"box"} = {p.pack_size} {p.unit}</span>}
                        </div>
                        {p.created_at && <div style={{ fontSize:10, color:"#a7a9be", marginBottom:8 }}>🕒 {fmtDT(p)}</div>}
                        {hasPack(p) ? (
                          <div style={{ display:"flex", flexDirection:"column", gap:3, fontSize:12 }}>
                            <span>Per {p.pack_unit||"box"}: <b style={{ color:"#2cb67d" }}>{fmt(p.pack_sell_price)}</b> <span style={{ color:"#a7a9be" }}>(cost {fmt(p.pack_cost_price)})</span></span>
                            <span style={{ color:"#a7a9be" }}>Per {p.unit}: <b style={{ color:"#2cb67d" }}>{fmt(p.sell_price)}</b> · margin/{p.unit} <b style={{ color:"#ff8906" }}>{fmt(p.sell_price - p.cost_price)}</b></span>
                          </div>
                        ) : (
                          <div style={{ display:"flex", gap:14, flexWrap:"wrap", fontSize:12 }}>
                            <span>Cost: <b style={{ color:"#f25f4c" }}>{fmt(p.cost_price)}</b></span>
                            <span>Sell: <b style={{ color:"#2cb67d" }}>{fmt(p.sell_price)}</b></span>
                            <span>Margin: <b style={{ color:"#ff8906" }}>{fmt(p.sell_price - p.cost_price)}</b></span>
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        {hasPack(p) ? (
                          <>
                            <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:22, color: p.stock <= p.low_stock ? "#f25f4c" : "#fffffe" }}>{packBoxes(p)}<span style={{ fontSize:11, fontWeight:400, color:"#a7a9be" }}> {p.pack_unit||"box"}</span></div>
                            {packLoose(p) > 0 && <div style={{ fontSize:11, color:"#ff8906" }}>+ {packLoose(p)} {p.unit}</div>}
                            <div style={{ fontSize:10, color:"#a7a9be", marginTop:2 }}>{p.stock} {p.unit} total</div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:22, color: p.stock === 0 ? "#f25f4c" : p.stock <= p.low_stock ? "#f25f4c" : "#fffffe" }}>{p.stock}</div>
                            <div style={{ fontSize:10, color:"#a7a9be" }}>{p.unit}</div>
                          </>
                        )}
                        {p.stock <= p.low_stock && <div style={{ fontSize:10, color:"#f25f4c", marginTop:2 }}>Low stock!</div>}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:8, marginTop:12 }}>
                      <button className="sh-btn sh-primary" style={{ flex:1, padding:"7px 10px", fontSize:12 }} onClick={() => openRestock(p)}>+ Stock</button>
                      <button className="sh-btn sh-ghost" style={{ flex:1, padding:"7px 10px", fontSize:12 }} onClick={() => openEditProd(p)}>✎ Edit</button>
                      <button className="sh-danger" onClick={() => deleteProd(p)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ══════════ STOCK ══════════ */}
            {tab === "stock" && (
              <div>
                {lowStock.length > 0 && (
                  <div style={{ background:"#f25f4c18", border:"1px solid #f25f4c44", borderRadius:12, padding:14, marginBottom:16 }}>
                    <div style={{ fontSize:13, color:"#f25f4c", fontWeight:600, marginBottom:10 }}>⚠ Low Stock / ស្តុកអស់ជិត</div>
                    {lowStock.map(p => (
                      <div key={p.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #f25f4c22" }}>
                        <div>
                          <div style={{ fontSize:13 }}>{p.name_en}</div>
                          {p.name_kh && <div style={{ fontSize:11, color:"#a7a9be" }}>{p.name_kh}</div>}
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <span style={{ fontSize:13, color:"#f25f4c", fontFamily:"Tahoma,sans-serif", fontWeight:800 }}>{fmtStock(p)}</span>
                          <button className="sh-btn sh-primary" style={{ padding:"5px 12px", fontSize:11 }} onClick={() => openRestock(p)}>+ Restock</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize:11, color:"#a7a9be", textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>All Stock ({products.length} products)</div>
                {products.map(p => (
                  <div key={p.id} className="sh-card" style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:10, borderLeft: p.stock <= p.low_stock ? "3px solid #f25f4c" : "3px solid #2e2d3d" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500 }}>
                        {p.name_en}
                        {p.name_kh && <span style={{ color:"#a7a9be", fontSize:11 }}> / {p.name_kh}</span>}
                      </div>
                      <div style={{ fontSize:11, color:"#a7a9be" }}>{p.category}</div>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      {hasPack(p) ? (
                        <>
                          <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:16, color: p.stock <= p.low_stock ? "#f25f4c" : "#fffffe" }}>{packBoxes(p)} <span style={{ fontSize:10, fontWeight:400, color:"#a7a9be" }}>{p.pack_unit||"box"}</span>{packLoose(p) > 0 && <span style={{ fontSize:11, color:"#ff8906" }}> +{packLoose(p)}</span>}</div>
                          <div style={{ fontSize:10, color:"#a7a9be" }}>{p.stock} {p.unit}</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:18, color: p.stock <= p.low_stock ? "#f25f4c" : "#fffffe" }}>{p.stock}</div>
                          <div style={{ fontSize:10, color:"#a7a9be" }}>{p.unit}</div>
                        </>
                      )}
                    </div>
                    <button className="sh-btn sh-ghost" style={{ padding:"5px 12px", fontSize:11, flexShrink:0 }} onClick={() => openRestock(p)}>+</button>
                  </div>
                ))}
                {products.length === 0 && <div style={{ textAlign:"center", color:"#a7a9be", padding:40, fontSize:13 }}>No products yet.</div>}
              </div>
            )}

            {/* ══════════ SALES ══════════ */}
            {tab === "sales" && (
              <div>
                {/* Period summary */}
                <div className="sh-card" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:11, color:"#a7a9be", marginBottom:4 }}>{periodLabel(salesPeriod)}</div>
                    <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:22, color:"#2cb67d" }}>{fmt(salesViewRev)}</div>
                    <div style={{ fontSize:11, color:"#ff8906", marginTop:2 }}>Profit: {fmt(salesViewProfit)} · {salesInView.length} sales</div>
                  </div>
                  <button className="sh-btn sh-primary" onClick={() => { setSaleForm({ ...BLANK_SALE, date:todayStr(), time:nowTime() }); setShowSaleForm(true); }}>
                    + Record Sale
                  </button>
                </div>

                {/* Filter: Today / Month / Range */}
                {renderPeriodFilter(salesPeriod)}

                {sales.length === 0 && <div style={{ textAlign:"center", color:"#a7a9be", padding:40, fontSize:13 }}>No sales recorded yet.</div>}
                {sales.length > 0 && visibleSales.length === 0 && <div style={{ textAlign:"center", color:"#a7a9be", padding:40, fontSize:13 }}>No sales for {periodLabel(salesPeriod)}.</div>}
                {visibleSales.slice(0, 100).map(s => {
                  const profit = (s.sell_price - s.cost_price) * s.qty;
                  return (
                    <div key={s.id} className="sh-card" style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.product_name}</div>
                        <div style={{ fontSize:11, color:"#a7a9be" }}>{s.date} {timeOf(s)} · {s.qty} {s.sale_unit || "unit"}{s.qty > 1 ? "s" : ""}{s.base_qty && s.base_qty !== s.qty ? ` (${s.base_qty})` : ""}</div>
                        {s.note && <div style={{ fontSize:11, color:"#a7a9be", fontStyle:"italic" }}>{s.note}</div>}
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        <div style={{ fontSize:13, color:"#2cb67d", fontWeight:600 }}>{fmt(s.sell_price * s.qty)}</div>
                        <div style={{ fontSize:11, color:"#ff8906" }}>+{fmt(profit)}</div>
                      </div>
                      <button className="sh-danger" onClick={() => deleteSale(s)}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ══════════ GIFTS / EXCHANGE ══════════ */}
            {tab === "gifts" && (
              <div>
                {/* Today summary */}
                <div className="sh-card" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:11, color:"#a7a9be", marginBottom:4 }}>Exchange today / រង្វាន់ថ្ងៃនេះ</div>
                    <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:22, color:"#ff8906" }}>{fmt(todayGiftCost)}</div>
                    <div style={{ fontSize:11, color:"#a7a9be", marginTop:2 }}>cost · {todayExch.length} exchanges{todayComm > 0 && <span style={{ color:"#2cb67d" }}> · +{fmt(todayComm)} comm</span>}</div>
                  </div>
                  <button className="sh-btn sh-primary" onClick={openExch}>+ Record Exchange</button>
                </div>

                {/* Filter: Today / All */}
                <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                  {[
                    { id:"today", label:`Today / ថ្ងៃនេះ (${todayExch.length})` },
                    { id:"all",   label:`All / ទាំងអស់ (${exchanges.length})` },
                  ].map(f => (
                    <button key={f.id}
                      className={`sh-btn ${exchFilter === f.id ? "sh-primary" : "sh-ghost"}`}
                      style={{ flex:1, fontSize:12, padding:"8px 6px" }}
                      onClick={() => setExchFilter(f.id)}>{f.label}</button>
                  ))}
                </div>

                {exchanges.length === 0 && <div style={{ textAlign:"center", color:"#a7a9be", padding:40, fontSize:13 }}>No exchanges recorded yet.</div>}
                {exchanges.length > 0 && visibleExch.length === 0 && <div style={{ textAlign:"center", color:"#a7a9be", padding:40, fontSize:13 }}>No exchange today / គ្មានរង្វាន់ថ្ងៃនេះ។</div>}
                {visibleExch.slice(0, 100).map(e => (
                  <div key={e.id} className="sh-card" style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ fontSize:18, flexShrink:0 }}>{e.kind === "cash" ? "💵" : "🎁"}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {e.kind === "cash" ? "Cash / រង្វាន់សាច់ប្រាក់" : e.product_name}
                      </div>
                      <div style={{ fontSize:11, color:"#a7a9be" }}>
                        {e.date} {timeOf(e)}{e.kind === "item" ? ` · ${e.qty} ${e.sale_unit || "unit"}${e.qty > 1 ? "s" : ""}${e.base_qty && e.base_qty !== e.qty ? ` (${e.base_qty})` : ""}` : ""}
                      </div>
                      {e.note && <div style={{ fontSize:11, color:"#a7a9be", fontStyle:"italic" }}>{e.note}</div>}
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontSize:11, color:"#f25f4c" }}>−{fmt(giftCost(e))} <span style={{ color:"#a7a9be" }}>cost</span></div>
                      {commOf(e) > 0 && <div style={{ fontSize:11, color:"#2cb67d" }}>+{fmt(commOf(e))} <span style={{ color:"#a7a9be" }}>comm</span></div>}
                    </div>
                    <button className="sh-danger" onClick={() => deleteExchange(e)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* ══════════ EXPENSE ══════════ */}
            {tab === "expense" && (
              <div>
                {/* Period summary */}
                <div className="sh-card" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:11, color:"#a7a9be", marginBottom:4 }}>{periodLabel(expPeriod)}</div>
                    <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:22, color:"#f25f4c" }}>{fmt(expViewTotal)}</div>
                    <div style={{ fontSize:11, color:"#a7a9be", marginTop:2 }}>{expInView.length} expenses</div>
                  </div>
                  <button className="sh-btn sh-primary" onClick={openExp}>+ Add Expense</button>
                </div>

                {/* Filter: Today / Month / Range */}
                {renderPeriodFilter(expPeriod)}

                {expenses.length === 0 && <div style={{ textAlign:"center", color:"#a7a9be", padding:40, fontSize:13 }}>No expenses recorded yet.</div>}
                {expenses.length > 0 && visibleExp.length === 0 && <div style={{ textAlign:"center", color:"#a7a9be", padding:40, fontSize:13 }}>No expenses for {periodLabel(expPeriod)}.</div>}
                {visibleExp.slice(0, 100).map(x => (
                  <div key={x.id} className="sh-card" style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{x.category}</div>
                      <div style={{ fontSize:11, color:"#a7a9be" }}>{x.date} {timeOf(x)}</div>
                      {x.note && <div style={{ fontSize:11, color:"#a7a9be", fontStyle:"italic" }}>{x.note}</div>}
                    </div>
                    <div style={{ fontSize:13, color:"#f25f4c", fontWeight:600, flexShrink:0 }}>−{fmt(x.amount)}</div>
                    <button className="sh-danger" onClick={() => deleteExpense(x)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* ══════════ REPORTS ══════════ */}
            {tab === "reports" && (
              <div>
                {/* Period mode: Day / Month / Range */}
                <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                  {[
                    { id:"day",   label:"Day / ថ្ងៃ" },
                    { id:"month", label:"Month / ខែ" },
                    { id:"range", label:"Range / ចន្លោះ" },
                  ].map(m => (
                    <button key={m.id}
                      className={`sh-btn ${rptMode === m.id ? "sh-primary" : "sh-ghost"}`}
                      style={{ flex:1, fontSize:12, padding:"8px 6px" }}
                      onClick={() => setRptMode(m.id)}>{m.label}</button>
                  ))}
                </div>

                {/* Period picker */}
                {rptMode === "day" && (
                  <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"center" }}>
                    <input className="sh-inp" type="date" value={rptDay} max={todayStr()} onChange={e => setRptDay(e.target.value)} style={{ flex:1 }}/>
                    <button className="sh-btn sh-ghost" style={{ fontSize:12, padding:"8px 12px", whiteSpace:"nowrap" }} onClick={() => setRptDay(todayStr())}>Today</button>
                  </div>
                )}
                {rptMode === "month" && (
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                    <button className="sh-btn sh-ghost" style={{ padding:"6px 14px", fontSize:18 }}
                      onClick={() => { if (rptMonth === 0) { setRptMonth(11); setRptYear(y => y-1); } else setRptMonth(m => m-1); }}>‹</button>
                    <div style={{ flex:1, textAlign:"center", fontFamily:"Tahoma,sans-serif", fontWeight:700, fontSize:15 }}>
                      {MONTHS_FULL[rptMonth]} {rptYear}
                    </div>
                    <button className="sh-btn sh-ghost" style={{ padding:"6px 14px", fontSize:18 }}
                      onClick={() => { if (rptMonth === 11) { setRptMonth(0); setRptYear(y => y+1); } else setRptMonth(m => m+1); }}>›</button>
                  </div>
                )}
                {rptMode === "range" && (
                  <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"center" }}>
                    <input className="sh-inp" type="date" value={rptFrom} max={rptTo} onChange={e => setRptFrom(e.target.value)} style={{ flex:1 }}/>
                    <span style={{ color:"#a7a9be", fontSize:12 }}>→</span>
                    <input className="sh-inp" type="date" value={rptTo} min={rptFrom} max={todayStr()} onChange={e => setRptTo(e.target.value)} style={{ flex:1 }}/>
                  </div>
                )}

                {/* Period label */}
                <div style={{ fontSize:12, color:"#ff8906", marginBottom:12, fontFamily:"Tahoma,sans-serif", fontWeight:700 }}>
                  {rptLabel}
                </div>

                {/* Summary cards */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:14 }}>
                  {[
                    { label:"Revenue\nចំណូល",  val:rptRevenue, color:"#2cb67d" },
                    { label:"Cost\nដើមទុន",    val:rptCost,    color:"#f25f4c" },
                    { label:"Profit\nចំណេញ",  val:rptProfit,  color:"#ff8906" },
                  ].map(c => (
                    <div key={c.label} className="sh-card" style={{ textAlign:"center", padding:"12px 6px", marginBottom:0 }}>
                      <div style={{ fontSize:9, color:"#a7a9be", marginBottom:6, whiteSpace:"pre-line", lineHeight:1.5 }}>{c.label}</div>
                      <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:"clamp(11px,3.5vw,15px)", color:c.color }}>{fmt(c.val)}</div>
                    </div>
                  ))}
                </div>

                <div className="sh-card" style={{ marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ fontSize:11, color:"#a7a9be", marginBottom:4 }}>Total sales / ចំនួនដង</div>
                      <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:22 }}>{rptSales.length}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:11, color:"#a7a9be", marginBottom:4 }}>Avg revenue / sale</div>
                      <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:22 }}>{fmt(rptSales.length ? rptRevenue / rptSales.length : 0)}</div>
                    </div>
                  </div>
                  {rptExch.length > 0 && (
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:12, paddingTop:12, borderTop:"1px solid #2e2d3d" }}>
                      <div style={{ fontSize:11, color:"#a7a9be" }}>🎁 Exchange given / រង្វាន់ ({rptExch.length})</div>
                      <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:16, color:"#f25f4c" }}>−{fmt(rptGift)}</div>
                    </div>
                  )}
                  {rptComm > 0 && (
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10 }}>
                      <div style={{ fontSize:11, color:"#a7a9be" }}>💰 Commission / កម្រៃ</div>
                      <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:16, color:"#2cb67d" }}>+{fmt(rptComm)}</div>
                    </div>
                  )}
                </div>

                {/* ── Profit & Expense analysis ── */}
                <div style={{ fontSize:11, color:"#a7a9be", textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>
                  Profit &amp; Expense / ប្រាក់ចំណេញ និងចំណាយ
                </div>
                <div className="sh-card" style={{ marginBottom:14 }}>
                  {[
                    { label:"Gross profit / ចំណេញដុល",      val:rptProfit,   color:"#ff8906", sign:"" },
                    { label:"Operating expense / ចំណាយ",   val:rptExpense,  color:"#f25f4c", sign:"−" },
                  ].map(r => (
                    <div key={r.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0" }}>
                      <div style={{ fontSize:12, color:"#a7a9be" }}>{r.label}</div>
                      <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:16, color:r.color }}>{r.sign}{fmt(r.val)}</div>
                    </div>
                  ))}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8, paddingTop:10, borderTop:"1px solid #2e2d3d" }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>Net profit / ចំណេញសុទ្ធ</div>
                    <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:20, color: rptNet >= 0 ? "#2cb67d" : "#f25f4c" }}>{rptNet < 0 ? "−" : ""}{fmt(Math.abs(rptNet))}</div>
                  </div>
                  <div style={{ fontSize:10, color:"#a7a9be", marginTop:4 }}>Profit margin: {(rptMargin * 100).toFixed(1)}% of sales</div>
                </div>

                {/* ── Break-even estimate ── */}
                <div style={{ background:"#ff890618", border:"1px solid #ff890644", borderRadius:12, padding:14, marginBottom:14 }}>
                  <div style={{ fontSize:12, color:"#ff8906", fontWeight:600, marginBottom:8 }}>🎯 Sales needed to cover expenses / គោលដៅលក់</div>
                  {rptExpense === 0 ? (
                    <div style={{ fontSize:12, color:"#a7a9be" }}>No expenses recorded for {rptLabel}.</div>
                  ) : rptBreakEven === null ? (
                    <div style={{ fontSize:12, color:"#a7a9be" }}>Record some sales first so we can estimate the margin and break-even sales.</div>
                  ) : (
                    <>
                      <div style={{ fontSize:13, lineHeight:1.7 }}>
                        To cover <b style={{ color:"#f25f4c" }}>{fmt(rptExpense)}</b> of expenses at a <b>{(rptMargin * 100).toFixed(1)}%</b> margin, you need to sell about{" "}
                        <b style={{ color:"#ff8906", fontFamily:"Tahoma,sans-serif", fontSize:16 }}>{fmt(rptBreakEven)}</b>.
                      </div>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10, paddingTop:10, borderTop:"1px solid #ff890633", fontSize:12 }}>
                        <span style={{ color:"#a7a9be" }}>Actual sales: <b style={{ color:"#2cb67d" }}>{fmt(rptRevenue)}</b></span>
                        {rptRevenue >= rptBreakEven
                          ? <span style={{ color:"#2cb67d", fontWeight:600 }}>✓ Above target by {fmt(rptRevenue - rptBreakEven)}</span>
                          : <span style={{ color:"#f25f4c", fontWeight:600 }}>↑ {fmt(rptBreakEven - rptRevenue)} more to break even</span>}
                      </div>
                    </>
                  )}
                </div>

                {/* Top products */}
                {topProds.length > 0 && (
                  <>
                    <div style={{ fontSize:11, color:"#a7a9be", textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>
                      Top Products / ទំនិញដែលលក់ដាច់
                    </div>
                    {topProds.map(([name, d], i) => (
                      <div key={name} className="sh-card" style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:18, color:"#2e2d3d", width:24, flexShrink:0 }}>#{i+1}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{name}</div>
                          <div style={{ fontSize:11, color:"#a7a9be" }}>{d.qty} units sold</div>
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <div style={{ fontSize:13, color:"#2cb67d", fontWeight:600 }}>{fmt(d.revenue)}</div>
                          <div style={{ fontSize:11, color:"#ff8906" }}>+{fmt(d.profit)} profit</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {rptSales.length === 0 && (
                  <div style={{ textAlign:"center", color:"#a7a9be", padding:40, fontSize:13 }}>
                    No sales for {rptLabel}.
                  </div>
                )}

                {/* Low stock reminder */}
                {lowStock.length > 0 && (
                  <div style={{ background:"#f25f4c18", border:"1px solid #f25f4c33", borderRadius:12, padding:14, marginTop:16 }}>
                    <div style={{ fontSize:12, color:"#f25f4c", fontWeight:600, marginBottom:8 }}>⚠ Needs restocking / ត្រូវបញ្ចូលស្តុក</div>
                    {lowStock.map(p => (
                      <div key={p.id} style={{ fontSize:12, color:"#a7a9be", padding:"4px 0", display:"flex", justifyContent:"space-between" }}>
                        <span>{p.name_en}</span>
                        <span style={{ color:"#f25f4c" }}>{fmtStock(p)} left</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </>
        )}
      </div>

      {/* ══ PRODUCT FORM MODAL ══ */}
      {showProdForm && (
        <div className="sh-overlay">
          <div className="sh-modal">
            <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:16, marginBottom:20 }}>
              {editProd ? "Edit Product" : "Add Product / បន្ថែមទំនិញ"}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div>
                <label className="sh-lbl">Product name (English) *</label>
                <input className="sh-inp" value={prodForm.name_en} onChange={e => setProdForm(f => ({...f, name_en:e.target.value}))} placeholder="e.g. Dove Soap"/>
              </div>
              <div>
                <label className="sh-lbl">ឈ្មោះ (Khmer / ខ្មែរ)</label>
                <input className="sh-inp" value={prodForm.name_kh} onChange={e => setProdForm(f => ({...f, name_kh:e.target.value}))} placeholder="e.g. សាប៊ូ Dove"/>
              </div>
              <div>
                <label className="sh-lbl">Category / ប្រភេទ</label>
                <select className="sh-inp" value={prodForm.category} onChange={e => setProdForm(f => ({...f, category:e.target.value}))}>
                  {(catNames.includes(prodForm.category) ? catNames : [prodForm.category, ...catNames]).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {/* Sold by box toggle */}
              <button type="button"
                onClick={() => setProdForm(f => ({...f, has_pack:!f.has_pack}))}
                style={{ display:"flex", alignItems:"center", gap:10, background:"#12111f", border:`1px solid ${prodForm.has_pack ? "#ff8906" : "#2e2d3d"}`, borderRadius:8, padding:"10px 14px", cursor:"pointer", fontFamily:"inherit", textAlign:"left", width:"100%" }}>
                <span style={{ width:18, height:18, borderRadius:4, border:`2px solid ${prodForm.has_pack ? "#ff8906" : "#a7a9be"}`, background:prodForm.has_pack ? "#ff8906" : "transparent", color:"#0f0e17", fontSize:12, lineHeight:"14px", textAlign:"center", flexShrink:0 }}>{prodForm.has_pack ? "✓" : ""}</span>
                <span style={{ fontSize:12, color:"#fffffe" }}>Sold by the box / pack <span style={{ color:"#a7a9be" }}>(e.g. beer: 1 box = 24 cans)</span></span>
              </button>

              {prodForm.has_pack ? (() => {
                const ps   = Math.max(1, parseInt(prodForm.pack_size) || 1);
                const bSell = parseFloat(prodForm.pack_sell_price) || 0;
                const bCost = parseFloat(prodForm.pack_cost_price) || 0;
                const stock = parseInt(prodForm.stock) || 0;
                const boxes = Math.floor(stock / ps), loose = stock % ps;
                return (
                  <>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                      <div>
                        <label className="sh-lbl">Pack size *</label>
                        <input className="sh-inp" type="number" min="2" value={prodForm.pack_size} onChange={e => setProdForm(f => ({...f, pack_size:e.target.value}))} placeholder="24"/>
                      </div>
                      <div>
                        <label className="sh-lbl">Pack name</label>
                        <select className="sh-inp" value={prodForm.pack_unit} onChange={e => setProdForm(f => ({...f, pack_unit:e.target.value}))}>
                          {PACK_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="sh-lbl">Each / ឯកតា</label>
                        <select className="sh-inp" value={prodForm.unit} onChange={e => setProdForm(f => ({...f, unit:e.target.value}))}>
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                      <div>
                        <label className="sh-lbl">Box cost (USD) / ដើមទុនមួយ{prodForm.pack_unit}</label>
                        <input className="sh-inp" type="number" min="0" step="0.01" value={prodForm.pack_cost_price} onChange={e => setProdForm(f => ({...f, pack_cost_price:e.target.value}))} placeholder="0.00"/>
                      </div>
                      <div>
                        <label className="sh-lbl">Box sell (USD) / តម្លៃលក់ *</label>
                        <input className="sh-inp" type="number" min="0" step="0.01" value={prodForm.pack_sell_price} onChange={e => setProdForm(f => ({...f, pack_sell_price:e.target.value}))} placeholder="0.00"/>
                      </div>
                    </div>
                    {(bSell > 0 || bCost > 0) && (
                      <div style={{ background:"#ff890618", border:"1px solid #ff890633", borderRadius:8, padding:"8px 12px", fontSize:12, lineHeight:1.6 }}>
                        Per {prodForm.unit} (auto = box ÷ {ps}): cost <b style={{ color:"#f25f4c" }}>{fmtUSD(bCost/ps)}</b> · sell <b style={{ color:"#2cb67d" }}>{fmtUSD(bSell/ps)}</b> · margin <b style={{ color:"#ff8906" }}>{fmtUSD((bSell-bCost)/ps)}</b>
                      </div>
                    )}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                      <div>
                        <label className="sh-lbl">Stock ({prodForm.pack_unit})</label>
                        <input className="sh-inp" type="number" min="0" value={boxes} onChange={e => setProdForm(f => ({...f, stock:String((parseInt(e.target.value)||0)*ps + loose)}))} placeholder="0"/>
                      </div>
                      <div>
                        <label className="sh-lbl">+ loose ({prodForm.unit})</label>
                        <input className="sh-inp" type="number" min="0" value={loose} onChange={e => setProdForm(f => ({...f, stock:String(boxes*ps + (parseInt(e.target.value)||0))}))} placeholder="0"/>
                      </div>
                      <div>
                        <label className="sh-lbl">Low alert ({prodForm.unit})</label>
                        <input className="sh-inp" type="number" min="0" value={prodForm.low_stock} onChange={e => setProdForm(f => ({...f, low_stock:e.target.value}))} placeholder="5"/>
                      </div>
                    </div>
                    <div style={{ fontSize:11, color:"#a7a9be" }}>= {stock} {prodForm.unit} total in stock</div>
                  </>
                );
              })() : (
                <>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div>
                      <label className="sh-lbl">Cost price (USD) / ដើមទុន</label>
                      <input className="sh-inp" type="number" min="0" step="0.01" value={prodForm.cost_price} onChange={e => setProdForm(f => ({...f, cost_price:e.target.value}))} placeholder="0.00"/>
                    </div>
                    <div>
                      <label className="sh-lbl">Sell price (USD) / តម្លៃលក់ *</label>
                      <input className="sh-inp" type="number" min="0" step="0.01" value={prodForm.sell_price} onChange={e => setProdForm(f => ({...f, sell_price:e.target.value}))} placeholder="0.00"/>
                    </div>
                  </div>
                  {prodForm.cost_price && prodForm.sell_price && (
                    <div style={{ background:"#ff890618", border:"1px solid #ff890633", borderRadius:8, padding:"8px 12px", fontSize:12 }}>
                      Margin: <b style={{ color:"#ff8906" }}>{fmtUSD(parseFloat(prodForm.sell_price||0) - parseFloat(prodForm.cost_price||0))}</b> per {prodForm.unit}
                    </div>
                  )}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                    <div>
                      <label className="sh-lbl">Stock / ស្តុក</label>
                      <input className="sh-inp" type="number" min="0" value={prodForm.stock} onChange={e => setProdForm(f => ({...f, stock:e.target.value}))} placeholder="0"/>
                    </div>
                    <div>
                      <label className="sh-lbl">Low alert</label>
                      <input className="sh-inp" type="number" min="0" value={prodForm.low_stock} onChange={e => setProdForm(f => ({...f, low_stock:e.target.value}))} placeholder="5"/>
                    </div>
                    <div>
                      <label className="sh-lbl">Unit / ឯកតា</label>
                      <select className="sh-inp" value={prodForm.unit} onChange={e => setProdForm(f => ({...f, unit:e.target.value}))}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}
              <div className="dt-grid">
                <div>
                  <label className="sh-lbl">Date added / កាលបរិច្ឆេទ</label>
                  <input className="sh-inp" type="date" value={prodForm.date} onChange={e => setProdForm(f => ({...f, date:e.target.value}))}/>
                </div>
                <div>
                  <label className="sh-lbl">Time / ម៉ោង</label>
                  <input className="sh-inp" type="time" value={prodForm.time} onChange={e => setProdForm(f => ({...f, time:e.target.value}))}/>
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:20 }}>
              <button className="sh-btn sh-ghost" style={{ flex:1 }} onClick={() => setShowProdForm(false)}>Cancel</button>
              <button className="sh-btn sh-primary" style={{ flex:2 }} onClick={saveProd}>{editProd ? "Save Changes" : "Add Product ✓"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SALE FORM MODAL ══ */}
      {showSaleForm && (
        <div className="sh-overlay">
          <div className="sh-modal">
            <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:16, marginBottom:20 }}>Record Sale / កត់ត្រាការលក់</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div>
                <label className="sh-lbl">Product / ទំនិញ *</label>
                <select className="sh-inp" value={saleForm.product_id} onChange={e => {
                  const np = products.find(x => x.id === e.target.value);
                  setSaleForm(f => ({...f, product_id:e.target.value, mode: np && hasPack(np) ? "box" : "unit"}));
                }}>
                  <option value="">Select product...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name_en}{p.name_kh ? ` / ${p.name_kh}` : ""} — Stock: {fmtStock(p)}</option>
                  ))}
                </select>
              </div>
              {saleForm.product_id && (() => {
                const p = products.find(x => x.id === saleForm.product_id);
                return p ? (
                  <div style={{ background:"#12111f", borderRadius:8, padding:"10px 14px", display:"flex", gap:16, fontSize:12, flexWrap:"wrap" }}>
                    {hasPack(p)
                      ? <span>Price: <b style={{ color:"#2cb67d" }}>{fmt(p.pack_sell_price)}</b>/{p.pack_unit||"box"} · <b style={{ color:"#2cb67d" }}>{fmt(p.sell_price)}</b>/{p.unit}</span>
                      : <span>Price: <b style={{ color:"#2cb67d" }}>{fmt(p.sell_price)}</b> · Margin: <b style={{ color:"#ff8906" }}>{fmt(p.sell_price - p.cost_price)}</b></span>}
                    <span>Stock: <b style={{ color: p.stock <= p.low_stock ? "#f25f4c" : "#fffffe" }}>{fmtStock(p)}</b></span>
                  </div>
                ) : null;
              })()}
              {saleForm.product_id && (() => {
                const p = products.find(x => x.id === saleForm.product_id);
                if (!p || !hasPack(p)) return null;
                return (
                  <div>
                    <label className="sh-lbl">Sell by / លក់ជា</label>
                    <div style={{ display:"flex", gap:8 }}>
                      {[{ id:"box", lbl:`${p.pack_unit||"box"} (${p.pack_size} ${p.unit})` }, { id:"unit", lbl:p.unit }].map(o => (
                        <button key={o.id} type="button" onClick={() => setSaleForm(f => ({...f, mode:o.id}))}
                          style={{ flex:1, padding:"9px 8px", borderRadius:6, cursor:"pointer", fontFamily:"inherit", fontSize:12, border:`1px solid ${saleForm.mode===o.id ? "#ff8906" : "#2e2d3d"}`, background:saleForm.mode===o.id ? "#ff8906" : "transparent", color:saleForm.mode===o.id ? "#0f0e17" : "#a7a9be", fontWeight:saleForm.mode===o.id ? 600 : 400 }}>
                          {o.lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="dt-grid">
                <div>
                  {(() => {
                    const p = products.find(x => x.id === saleForm.product_id);
                    const u = p && hasPack(p) && saleForm.mode === "box" ? (p.pack_unit||"box") : (p ? p.unit : "");
                    return <label className="sh-lbl">Qty / ចំនួន{u ? ` (${u})` : ""}</label>;
                  })()}
                  <input className="sh-inp" type="number" min="1" value={saleForm.qty} onChange={e => setSaleForm(f => ({...f, qty:e.target.value}))}/>
                </div>
                <div>
                  <label className="sh-lbl">Date / កាលបរិច្ឆេទ</label>
                  {(() => {
                    const sp = products.find(x => x.id === saleForm.product_id);
                    return <input className="sh-inp" type="date" value={saleForm.date} min={sp ? dateOf(sp) : undefined} onChange={e => setSaleForm(f => ({...f, date:e.target.value}))}/>;
                  })()}
                </div>
                <div>
                  <label className="sh-lbl">Time / ម៉ោង</label>
                  <input className="sh-inp" type="time" value={saleForm.time} onChange={e => setSaleForm(f => ({...f, time:e.target.value}))}/>
                </div>
              </div>
              <div>
                <label className="sh-lbl">Note / កំណត់ចំណាំ (optional)</label>
                <input className="sh-inp" value={saleForm.note} onChange={e => setSaleForm(f => ({...f, note:e.target.value}))} placeholder="e.g. credit, bulk, etc."/>
              </div>
              {saleForm.product_id && parseInt(saleForm.qty) > 0 && (() => {
                const p = products.find(x => x.id === saleForm.product_id);
                const qty = parseInt(saleForm.qty) || 0;
                if (!p || qty < 1) return null;
                const isBox = hasPack(p) && saleForm.mode === "box";
                const unitSell = isBox ? p.pack_sell_price : p.sell_price;
                const unitCost = isBox ? p.pack_cost_price : p.cost_price;
                const baseQty = isBox ? qty * p.pack_size : qty;
                const short = baseQty > p.stock;
                return (
                  <div style={{ background:short ? "#f25f4c18" : "#2cb67d18", border:`1px solid ${short ? "#f25f4c44" : "#2cb67d33"}`, borderRadius:8, padding:"10px 14px", fontSize:12 }}>
                    Total: <b style={{ color:"#2cb67d" }}>{fmt(unitSell * qty)}</b>
                    {" · "}Profit: <b style={{ color:"#ff8906" }}>{fmt((unitSell - unitCost) * qty)}</b>
                    {isBox && <span style={{ color:"#a7a9be" }}>{" · "}deducts {baseQty} {p.unit}</span>}
                    {short && <div style={{ color:"#f25f4c", marginTop:4 }}>⚠ Only {fmtStock(p)} in stock</div>}
                  </div>
                );
              })()}
            </div>
            <div style={{ display:"flex", gap:10, marginTop:20 }}>
              <button className="sh-btn sh-ghost" style={{ flex:1 }} onClick={() => setShowSaleForm(false)}>Cancel</button>
              <button className="sh-btn sh-primary" style={{ flex:2 }} onClick={recordSale}>Record Sale ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ GIFT / EXCHANGE FORM MODAL ══ */}
      {showExchForm && (
        <div className="sh-overlay">
          <div className="sh-modal">
            <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:16, marginBottom:6 }}>Record Exchange / កត់ត្រារង្វាន់</div>
            <div style={{ fontSize:11, color:"#a7a9be", marginBottom:18 }}>Items or cash given to customers. Item exchanges deduct stock.</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {/* Kind toggle */}
              <div>
                <label className="sh-lbl">Exchange type / ប្រភេទ</label>
                <div style={{ display:"flex", gap:8 }}>
                  {[{ id:"item", lbl:"🎁 Free item" }, { id:"cash", lbl:"💵 Cash" }].map(o => (
                    <button key={o.id} type="button" onClick={() => setExchForm(f => ({...f, kind:o.id}))}
                      style={{ flex:1, padding:"9px 8px", borderRadius:6, cursor:"pointer", fontFamily:"inherit", fontSize:12, border:`1px solid ${exchForm.kind===o.id ? "#ff8906" : "#2e2d3d"}`, background:exchForm.kind===o.id ? "#ff8906" : "transparent", color:exchForm.kind===o.id ? "#0f0e17" : "#a7a9be", fontWeight:exchForm.kind===o.id ? 600 : 400 }}>
                      {o.lbl}
                    </button>
                  ))}
                </div>
              </div>

              {exchForm.kind === "item" && (
                <>
                  <div>
                    <label className="sh-lbl">Product / ទំនិញ *</label>
                    <select className="sh-inp" value={exchForm.product_id} onChange={e => {
                      const np = products.find(x => x.id === e.target.value);
                      setExchForm(f => ({...f, product_id:e.target.value, mode: np && hasPack(np) ? "box" : "unit"}));
                    }}>
                      <option value="">Select product...</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name_en}{p.name_kh ? ` / ${p.name_kh}` : ""} — Stock: {fmtStock(p)}</option>
                      ))}
                    </select>
                  </div>
                  {exchForm.product_id && (() => {
                    const p = products.find(x => x.id === exchForm.product_id);
                    if (!p || !hasPack(p)) return null;
                    return (
                      <div>
                        <label className="sh-lbl">Give by / អោយជា</label>
                        <div style={{ display:"flex", gap:8 }}>
                          {[{ id:"box", lbl:`${p.pack_unit||"box"} (${p.pack_size} ${p.unit})` }, { id:"unit", lbl:p.unit }].map(o => (
                            <button key={o.id} type="button" onClick={() => setExchForm(f => ({...f, mode:o.id}))}
                              style={{ flex:1, padding:"9px 8px", borderRadius:6, cursor:"pointer", fontFamily:"inherit", fontSize:12, border:`1px solid ${exchForm.mode===o.id ? "#ff8906" : "#2e2d3d"}`, background:exchForm.mode===o.id ? "#ff8906" : "transparent", color:exchForm.mode===o.id ? "#0f0e17" : "#a7a9be", fontWeight:exchForm.mode===o.id ? 600 : 400 }}>
                              {o.lbl}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  <div>
                    <label className="sh-lbl">Commission / កម្រៃ ({cur}) <span style={{ opacity:0.6 }}>(profit, optional)</span></label>
                    <input className="sh-inp" type="number" min="0" step="any" value={exchForm.commission}
                      onChange={e => setExchForm(f => ({...f, commission:e.target.value}))}
                      placeholder={cur === "KHR" ? "e.g. 500" : "e.g. 0.10"}/>
                  </div>
                </>
              )}

              {exchForm.kind === "cash" && (
                <div>
                  <label className="sh-lbl">Amount / ចំនួនទឹកប្រាក់ ({cur}) *</label>
                  <input className="sh-inp" type="number" min="0" step="any" value={exchForm.cash_value}
                    onChange={e => setExchForm(f => ({...f, cash_value:e.target.value}))}
                    placeholder={cur === "KHR" ? "e.g. 1000" : "e.g. 0.25"}/>
                </div>
              )}

              <div className="dt-grid">
                {exchForm.kind === "item" && (
                  <div>
                    {(() => {
                      const p = products.find(x => x.id === exchForm.product_id);
                      const u = p && hasPack(p) && exchForm.mode === "box" ? (p.pack_unit||"box") : (p ? p.unit : "");
                      return <label className="sh-lbl">Qty / ចំនួន{u ? ` (${u})` : ""}</label>;
                    })()}
                    <input className="sh-inp" type="number" min="1" value={exchForm.qty} onChange={e => setExchForm(f => ({...f, qty:e.target.value}))}/>
                  </div>
                )}
                <div>
                  <label className="sh-lbl">Date / កាលបរិច្ឆេទ</label>
                  {(() => {
                    const ep = products.find(x => x.id === exchForm.product_id);
                    return <input className="sh-inp" type="date" value={exchForm.date} min={exchForm.kind === "item" && ep ? dateOf(ep) : undefined} onChange={e => setExchForm(f => ({...f, date:e.target.value}))}/>;
                  })()}
                </div>
                <div>
                  <label className="sh-lbl">Time / ម៉ោង</label>
                  <input className="sh-inp" type="time" value={exchForm.time} onChange={e => setExchForm(f => ({...f, time:e.target.value}))}/>
                </div>
              </div>

              <div>
                <label className="sh-lbl">Note / កំណត់ចំណាំ (optional)</label>
                <input className="sh-inp" value={exchForm.note} onChange={e => setExchForm(f => ({...f, note:e.target.value}))} placeholder="e.g. promo, loyal customer"/>
              </div>

              {/* Cost preview */}
              {exchForm.kind === "item" && exchForm.product_id && parseInt(exchForm.qty) > 0 && (() => {
                const p = products.find(x => x.id === exchForm.product_id);
                const qty = parseInt(exchForm.qty) || 0;
                if (!p || qty < 1) return null;
                const isBox = hasPack(p) && exchForm.mode === "box";
                const unitCost = isBox ? p.pack_cost_price : p.cost_price;
                const baseQty = isBox ? qty * p.pack_size : qty;
                const short = baseQty > p.stock;
                const cost = unitCost * qty;
                const commEntered = parseFloat(exchForm.commission) || 0;
                const commUsd = cur === "KHR" ? commEntered / KHR_RATE : commEntered;
                const net = commUsd - cost;
                return (
                  <div style={{ background:short ? "#f25f4c18" : "#ff890618", border:`1px solid ${short ? "#f25f4c44" : "#ff890633"}`, borderRadius:8, padding:"10px 14px", fontSize:12, lineHeight:1.7 }}>
                    Cost: <b style={{ color:"#f25f4c" }}>−{fmt(cost)}</b>
                    {commUsd > 0 && <> · Commission: <b style={{ color:"#2cb67d" }}>+{fmt(commUsd)}</b> · Net: <b style={{ color: net >= 0 ? "#2cb67d" : "#f25f4c" }}>{net >= 0 ? "+" : "−"}{fmt(Math.abs(net))}</b></>}
                    <div style={{ color:"#a7a9be" }}>deducts {baseQty} {p.unit}</div>
                    {short && <div style={{ color:"#f25f4c", marginTop:4 }}>⚠ Only {fmtStock(p)} in stock</div>}
                  </div>
                );
              })()}
            </div>
            <div style={{ display:"flex", gap:10, marginTop:20 }}>
              <button className="sh-btn sh-ghost" style={{ flex:1 }} onClick={() => setShowExchForm(false)}>Cancel</button>
              <button className="sh-btn sh-primary" style={{ flex:2 }} onClick={recordExchange}>Record Exchange ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ EXPENSE FORM MODAL ══ */}
      {showExpForm && (
        <div className="sh-overlay">
          <div className="sh-modal">
            <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:16, marginBottom:6 }}>Add Expense / បន្ថែមចំណាយ</div>
            <div style={{ fontSize:11, color:"#a7a9be", marginBottom:18 }}>Running costs of the shop (rent, electricity, salary, …).</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div>
                <label className="sh-lbl">Category / ប្រភេទ</label>
                <select className="sh-inp" value={expForm.category} onChange={e => setExpForm(f => ({...f, category:e.target.value}))}>
                  {EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="sh-lbl">Amount / ចំនួនទឹកប្រាក់ ({cur}) *</label>
                <input className="sh-inp" type="number" min="0" step="any" value={expForm.amount}
                  onChange={e => setExpForm(f => ({...f, amount:e.target.value}))}
                  placeholder={cur === "KHR" ? "e.g. 200000" : "e.g. 50.00"}/>
              </div>
              <div className="dt-grid">
                <div>
                  <label className="sh-lbl">Date / កាលបរិច្ឆេទ</label>
                  <input className="sh-inp" type="date" value={expForm.date} onChange={e => setExpForm(f => ({...f, date:e.target.value}))}/>
                </div>
                <div>
                  <label className="sh-lbl">Time / ម៉ោង</label>
                  <input className="sh-inp" type="time" value={expForm.time} onChange={e => setExpForm(f => ({...f, time:e.target.value}))}/>
                </div>
              </div>
              <div>
                <label className="sh-lbl">Note / កំណត់ចំណាំ (optional)</label>
                <input className="sh-inp" value={expForm.note} onChange={e => setExpForm(f => ({...f, note:e.target.value}))} placeholder="e.g. June rent"/>
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:20 }}>
              <button className="sh-btn sh-ghost" style={{ flex:1 }} onClick={() => setShowExpForm(false)}>Cancel</button>
              <button className="sh-btn sh-primary" style={{ flex:2 }} onClick={recordExpense}>Add Expense ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ RESTOCK FORM MODAL ══ */}
      {showRestockForm && restockFor && (
        <div className="sh-overlay">
          <div className="sh-modal">
            <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:16, marginBottom:4 }}>Restock / បញ្ចូលស្តុក</div>
            <div style={{ fontSize:12, color:"#a7a9be", marginBottom:20 }}>
              {restockFor.name_en}{restockFor.name_kh ? ` / ${restockFor.name_kh}` : ""}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {hasPack(restockFor) && (
                <div>
                  <label className="sh-lbl">Add by / បន្ថែមជា</label>
                  <div style={{ display:"flex", gap:8 }}>
                    {[{ id:"box", lbl:`${restockFor.pack_unit||"box"} (${restockFor.pack_size} ${restockFor.unit})` }, { id:"unit", lbl:restockFor.unit }].map(o => (
                      <button key={o.id} type="button" onClick={() => setRestockForm(f => ({...f, mode:o.id}))}
                        style={{ flex:1, padding:"9px 8px", borderRadius:6, cursor:"pointer", fontFamily:"inherit", fontSize:12, border:`1px solid ${restockForm.mode===o.id ? "#ff8906" : "#2e2d3d"}`, background:restockForm.mode===o.id ? "#ff8906" : "transparent", color:restockForm.mode===o.id ? "#0f0e17" : "#a7a9be", fontWeight:restockForm.mode===o.id ? 600 : 400 }}>
                        {o.lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(() => {
                const isBox = hasPack(restockFor) && restockForm.mode === "box";
                const addUnit = isBox ? (restockFor.pack_unit||"box") : restockFor.unit;
                const baseQty = (parseInt(restockForm.qty) || 0) * (isBox ? restockFor.pack_size : 1);
                const costPlaceholder = isBox ? (restockFor.pack_cost_price || "0.00") : (restockFor.cost_price || "0.00");
                const after = restockFor.stock + baseQty;
                return (
                  <>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                      <div>
                        <label className="sh-lbl">Qty to add ({addUnit}) *</label>
                        <input className="sh-inp" type="number" min="1" value={restockForm.qty} onChange={e => setRestockForm(f => ({...f, qty:e.target.value}))} placeholder="e.g. 10"/>
                      </div>
                      <div>
                        <label className="sh-lbl">Cost/{addUnit} (USD)</label>
                        <input className="sh-inp" type="number" min="0" step="0.01" value={restockForm.cost_per_unit} onChange={e => setRestockForm(f => ({...f, cost_per_unit:e.target.value}))} placeholder={String(costPlaceholder)}/>
                      </div>
                    </div>
                    <div>
                      <label className="sh-lbl">Date / កាលបរិច្ឆេទ</label>
                      <input className="sh-inp" type="date" value={restockForm.date} onChange={e => setRestockForm(f => ({...f, date:e.target.value}))}/>
                    </div>
                    <div>
                      <label className="sh-lbl">Note / កំណត់ចំណាំ (optional)</label>
                      <input className="sh-inp" value={restockForm.note} onChange={e => setRestockForm(f => ({...f, note:e.target.value}))} placeholder="e.g. from Phsar Thmey"/>
                    </div>
                    <div style={{ background:"#12111f", borderRadius:8, padding:"10px 14px", fontSize:12 }}>
                      Current: <b>{fmtStock(restockFor)}</b>
                      {" → "}
                      After: <b style={{ color:"#2cb67d" }}>{fmtStock({ ...restockFor, stock:after })}</b>
                      {restockForm.qty && restockForm.cost_per_unit && (
                        <span style={{ color:"#a7a9be" }}>
                          {" · "}Total cost: <b style={{ color:"#f25f4c" }}>{fmtUSD((parseFloat(restockForm.cost_per_unit) || 0) * (parseInt(restockForm.qty) || 0))}</b>
                        </span>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
            <div style={{ display:"flex", gap:10, marginTop:20 }}>
              <button className="sh-btn sh-ghost" style={{ flex:1 }} onClick={() => setShowRestockForm(false)}>Cancel</button>
              <button className="sh-btn sh-primary" style={{ flex:2 }} onClick={recordRestock}>Add Stock ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CATEGORY MANAGER MODAL ══ */}
      {showCatMgr && (
        <ShopCategoryManager
          uid={uid}
          shopCats={shopCats}
          setShopCats={setShopCats}
          products={products}
          setProducts={setProducts}
          showToast={showToast}
          onClose={() => setShowCatMgr(false)}
        />
      )}
    </div>
  );
}

// ── Shop category manager (same rules as finance: seed defaults, rename keeps
//    products in sync, delete blocked while a product uses the category) ──
function ShopCategoryManager({ uid, shopCats, setShopCats, products, setProducts, showToast, onClose }) {
  const [newName, setNewName]     = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName]   = useState("");
  const [error, setError]         = useState("");
  const [busy, setBusy]           = useState(false);

  const names = shopCats.map(c => c.name);
  const inUse = name => products.some(p => p.category === name);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) { setError("Enter a category name"); return; }
    if (names.some(n => n.toLowerCase() === name.toLowerCase())) { setError("Category already exists"); return; }
    setBusy(true); setError("");
    const { data, error } = await supabase.from("shop_categories").insert({ user_id: uid, name }).select().single();
    setBusy(false);
    if (error) { setError("Failed to add category"); return; }
    setShopCats(p => [...p, data].sort((a,b) => a.name.localeCompare(b.name)));
    setNewName("");
    showToast("Category added ✓");
  }

  async function handleRename(cat) {
    const name = editName.trim();
    if (!name) { setError("Enter a category name"); return; }
    if (name === cat.name) { setEditingId(null); return; }
    if (names.some(n => n.toLowerCase() === name.toLowerCase())) { setError("Category already exists"); return; }
    setBusy(true); setError("");
    const { error } = await supabase.from("shop_categories").update({ name }).eq("id", cat.id);
    if (error) { setBusy(false); setError("Failed to rename category"); return; }
    // Keep existing products pointing at the renamed category
    const { error: pErr } = await supabase.from("shop_products").update({ category: name }).eq("user_id", uid).eq("category", cat.name);
    setBusy(false);
    if (pErr) { setError("Renamed, but failed to update its products"); return; }
    setShopCats(p => p.map(c => c.id === cat.id ? { ...c, name } : c));
    setProducts(p => p.map(pr => pr.category === cat.name ? { ...pr, category: name } : pr));
    setEditingId(null);
    showToast("Category renamed ✓");
  }

  async function handleDelete(cat) {
    if (inUse(cat.name)) { setError(`"${cat.name}" is used by products and can't be deleted`); return; }
    setBusy(true); setError("");
    const { error } = await supabase.from("shop_categories").delete().eq("id", cat.id);
    setBusy(false);
    if (error) { setError("Failed to delete category"); return; }
    setShopCats(p => p.filter(c => c.id !== cat.id));
    showToast("Category deleted ✓");
  }

  return (
    <div className="sh-overlay">
      <div className="sh-modal">
        <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:16, marginBottom:6 }}>Manage Categories</div>
        <div style={{ fontSize:12, color:"#a7a9be", marginBottom:16 }}>ប្រភេទទំនិញ</div>
        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          <input className="sh-inp" placeholder="New category name" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} style={{ flex:1 }}/>
          <button className="sh-btn sh-primary" style={{ flexShrink:0 }} onClick={handleAdd} disabled={busy}>+ Add</button>
        </div>
        {error && <div style={{ color:"#f25f4c", fontSize:12, textAlign:"center", marginBottom:10 }}>{error}</div>}
        <div style={{ maxHeight:320, overflowY:"auto" }}>
          {shopCats.map(cat => (
            <div key={cat.id} className="sh-row">
              {editingId === cat.id ? (
                <>
                  <input className="sh-inp" style={{ flex:1, minWidth:0 }} value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleRename(cat)} autoFocus/>
                  <button className="sh-btn sh-ghost" style={{ padding:"6px 10px" }} onClick={() => handleRename(cat)} disabled={busy}>✓</button>
                  <button className="sh-btn sh-ghost" style={{ padding:"6px 10px" }} onClick={() => { setEditingId(null); setError(""); }}>✕</button>
                </>
              ) : (
                <>
                  <div style={{ flex:1, fontSize:13, minWidth:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{cat.name}</div>
                  {inUse(cat.name) && <span style={{ fontSize:10, color:"#ff8906", flexShrink:0 }}>in use</span>}
                  <button className="sh-btn sh-ghost" style={{ padding:"6px 10px" }} onClick={() => { setEditingId(cat.id); setEditName(cat.name); setError(""); }}>✎</button>
                  <button className="sh-danger" onClick={() => handleDelete(cat)} disabled={busy} style={{ opacity: inUse(cat.name) ? 0.4 : 1 }}>✕</button>
                </>
              )}
            </div>
          ))}
          {shopCats.length === 0 && <div style={{ textAlign:"center", color:"#a7a9be", padding:"14px 0", fontSize:12 }}>No categories yet</div>}
        </div>
        <div style={{ display:"flex", marginTop:20 }}>
          <button className="sh-btn sh-ghost" style={{ flex:1 }} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
