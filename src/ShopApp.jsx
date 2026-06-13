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

function fmtUSD(n) { return "$" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function fmtKHR(n) { return "៛" + Math.round(n * KHR_RATE).toLocaleString(); }
function todayStr() { return new Date().toISOString().split("T")[0]; }

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

const BLANK_PROD = { name_en:"", name_kh:"", category:SHOP_CATS[0], cost_price:"", sell_price:"", stock:"0", low_stock:"5", unit:"pcs", has_pack:false, pack_size:"24", pack_unit:"box", pack_cost_price:"", pack_sell_price:"" };
const BLANK_SALE = { product_id:"", qty:"1", mode:"unit", date:todayStr(), note:"" };
const BLANK_RESTOCK = { qty:"", mode:"unit", cost_per_unit:"", date:todayStr(), note:"" };

export default function ShopApp({ session, onBack, canShop = true }) {
  const [tab, setTab]             = useState("products");
  const [cur, setCur]             = useState("USD");
  const [products, setProducts]   = useState([]);
  const [sales, setSales]         = useState([]);
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

  // Report month
  const [rptMonth, setRptMonth] = useState(new Date().getMonth());
  const [rptYear, setRptYear]   = useState(new Date().getFullYear());

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
    const [pRes, sRes, cRes] = await Promise.all([
      supabase.from("shop_products").select("*").eq("user_id", uid).order("name_en"),
      supabase.from("shop_sales").select("*").eq("user_id", uid).order("date", { ascending:false }).order("created_at", { ascending:false }),
      supabase.from("shop_categories").select("*").eq("user_id", uid).order("name"),
    ]);
    if (!pRes.error) setProducts(pRes.data || []);
    if (!sRes.error) setSales(sRes.data || []);
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
  function openAddProd() { setProdForm({ ...BLANK_PROD, category: catNames[0] || SHOP_CATS[0] }); setEditProd(null); setShowProdForm(true); }
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

  const rptSales   = sales.filter(s => { const d = new Date(s.date); return d.getMonth() === rptMonth && d.getFullYear() === rptYear; });
  const rptRevenue = rptSales.reduce((a,s) => a + s.sell_price * s.qty, 0);
  const rptCost    = rptSales.reduce((a,s) => a + s.cost_price * s.qty, 0);
  const rptProfit  = rptRevenue - rptCost;

  const todaySales   = sales.filter(s => s.date === todayStr());
  const todayRevenue = todaySales.reduce((a,s) => a + s.sell_price * s.qty, 0);
  const todayProfit  = todaySales.reduce((a,s) => a + (s.sell_price - s.cost_price) * s.qty, 0);

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
        @media(max-width:480px){
          .sh-modal{border-radius:20px 20px 0 0;max-height:92vh;max-width:100%;width:100%}
          .sh-overlay{align-items:flex-end;padding:0}
          .sh-inp{min-height:44px}
          .sh-tab{padding:8px 10px;font-size:11px}
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
                        <div style={{ fontSize:11, color:"#a7a9be", marginBottom:8 }}>
                          {p.category}{hasPack(p) && <span style={{ color:"#ff8906" }}> · 1 {p.pack_unit||"box"} = {p.pack_size} {p.unit}</span>}
                        </div>
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
                {/* Today summary */}
                <div className="sh-card" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:11, color:"#a7a9be", marginBottom:4 }}>Today / ថ្ងៃនេះ</div>
                    <div style={{ fontFamily:"Tahoma,sans-serif", fontWeight:800, fontSize:22, color:"#2cb67d" }}>{fmt(todayRevenue)}</div>
                    <div style={{ fontSize:11, color:"#ff8906", marginTop:2 }}>Profit: {fmt(todayProfit)} · {todaySales.length} sales</div>
                  </div>
                  <button className="sh-btn sh-primary" onClick={() => { setSaleForm({ ...BLANK_SALE, date:todayStr() }); setShowSaleForm(true); }}>
                    + Record Sale
                  </button>
                </div>

                {sales.length === 0 && <div style={{ textAlign:"center", color:"#a7a9be", padding:40, fontSize:13 }}>No sales recorded yet.</div>}
                {sales.slice(0, 60).map(s => {
                  const profit = (s.sell_price - s.cost_price) * s.qty;
                  return (
                    <div key={s.id} className="sh-card" style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.product_name}</div>
                        <div style={{ fontSize:11, color:"#a7a9be" }}>{s.date} · {s.qty} {s.sale_unit || "unit"}{s.qty > 1 ? "s" : ""}{s.base_qty && s.base_qty !== s.qty ? ` (${s.base_qty})` : ""}</div>
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

            {/* ══════════ REPORTS ══════════ */}
            {tab === "reports" && (
              <div>
                {/* Month navigator */}
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                  <button className="sh-btn sh-ghost" style={{ padding:"6px 14px", fontSize:18 }}
                    onClick={() => { if (rptMonth === 0) { setRptMonth(11); setRptYear(y => y-1); } else setRptMonth(m => m-1); }}>‹</button>
                  <div style={{ flex:1, textAlign:"center", fontFamily:"Tahoma,sans-serif", fontWeight:700, fontSize:15 }}>
                    {MONTHS_FULL[rptMonth]} {rptYear}
                  </div>
                  <button className="sh-btn sh-ghost" style={{ padding:"6px 14px", fontSize:18 }}
                    onClick={() => { if (rptMonth === 11) { setRptMonth(0); setRptYear(y => y+1); } else setRptMonth(m => m+1); }}>›</button>
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
                    No sales in {MONTHS_FULL[rptMonth]} {rptYear}.
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
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
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
                  <input className="sh-inp" type="date" value={saleForm.date} onChange={e => setSaleForm(f => ({...f, date:e.target.value}))}/>
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
