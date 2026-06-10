import { useState, useEffect, useRef } from "react";

const CATEGORIES = {
  income: ["Salary", "Freelance", "Bonus", "Investment", "Other Income"],
  expense: ["Food & Dining", "Transport", "Utilities", "Shopping", "Health", "Entertainment", "Rent", "Savings", "Investment","Other"],
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const now = new Date();

// ── Users & their own JSONBin IDs ──
// Each user has a separate bin so data is fully isolated
const USERS = {
  raksa: {
    password: "Cambodia!12",
    binId: "6a2697fbf5f4af5e29ca84e1", // existing bin
    displayName: "Raksa",
  },
  sreydy: {
    password: "Cambodia!12",
    binId: "6a284518da38895dfea18d22",
    displayName: "Sreydy",
  },
  dara: {
    password: "Cambodia!12",
    binId: "6a28e111da38895dfea44c6b",
    displayName: "Dara",
  },
};
const API_KEY = "$2a$10$tTp7PjjPVO1QFDTjVhHCruEJCsak1ermn74S9RSJEjfESYTUOk9hy";

async function loadBin(binId) {
  const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
    headers: { "X-Master-Key": API_KEY, "X-Bin-Meta": "false" }
  });
  if (!res.ok) throw new Error("Load failed");
  const json = await res.json();
  const transactions = Array.isArray(json) ? json : (json.transactions || []);
  const lastModified = Array.isArray(json) ? 0 : (json.lastModified || 0);
  return { transactions, lastModified };
}

async function saveBin(binId, transactions, keepalive = false) {
  const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Master-Key": API_KEY },
    body: JSON.stringify({ transactions, lastModified: Date.now() }),
    keepalive,
  });
  if (!res.ok) throw new Error("Save failed");
}

function fmtUSD(n) { return "$" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,","); }
function fmtKHR(n) { return "៛" + Math.round(n*4100).toLocaleString(); }

// ── Login Screen ──
function LoginScreen({ onLogin, error }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  return (
    <div style={{minHeight:"100vh",background:"#0f0e17",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'DM Mono','Courier New',monospace"}}>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{fontFamily:"'Syne',sans-serif",fontSize:36,fontWeight:800,color:"#ff8906",letterSpacing:-1}}>Incomes and Expenses</div>
          <div style={{fontSize:12,color:"#a7a9be",marginTop:6}}>Finance Tracker · Phnom Penh</div>
        </div>
        <div style={{background:"#1a1929",border:"1px solid #2e2d3d",borderRadius:16,padding:28}}>
          <div style={{fontSize:14,fontWeight:500,marginBottom:20,color:"#fffffe"}}>Sign In</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <input
              style={{background:"#12111f",border:"1px solid #2e2d3d",borderRadius:6,color:"#fffffe",fontFamily:"inherit",fontSize:13,padding:"10px 14px",outline:"none",width:"100%",boxSizing:"border-box"}}
              placeholder="Username"
              value={username}
              onChange={e=>setUsername(e.target.value.toLowerCase())}
              onKeyDown={e=>e.key==="Enter"&&onLogin(username,password)}
              autoCapitalize="none"
            />
            <div style={{position:"relative"}}>
              <input
                style={{background:"#12111f",border:"1px solid #2e2d3d",borderRadius:6,color:"#fffffe",fontFamily:"inherit",fontSize:13,padding:"10px 40px 10px 14px",outline:"none",width:"100%",boxSizing:"border-box"}}
                type={showPw?"text":"password"}
                placeholder="Password"
                value={password}
                onChange={e=>setPassword(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&onLogin(username,password)}
              />
              <button onClick={()=>setShowPw(s=>!s)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#a7a9be",cursor:"pointer",fontSize:13}}>
                {showPw?"Hide":"Show"}
              </button>
            </div>
            {error&&<div style={{color:"#f25f4c",fontSize:12,textAlign:"center"}}>{error}</div>}
            <button
              onClick={()=>onLogin(username,password)}
              style={{background:"#ff8906",color:"#0f0e17",border:"none",borderRadius:6,padding:"12px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer",marginTop:4}}
            >
              Sign In
            </button>
          </div>
        </div>
        <div style={{textAlign:"center",fontSize:11,color:"#a7a9be",marginTop:20}}>
          Personal finance tracker · Private & secure
        </div>
      </div>
    </div>
  );
}

// ── Main App ──
export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("raksa_user")) || null; } catch(e) { return null; }
  });
  const [loginError, setLoginError] = useState("");

  function handleLogin(username, password) {
    const user = USERS[username.toLowerCase()];
    if (!user) { setLoginError("User not found"); return; }
    if (user.password !== password) { setLoginError("Incorrect password"); return; }
    const session = { username: username.toLowerCase(), displayName: user.displayName, binId: user.binId };
    sessionStorage.setItem("raksa_user", JSON.stringify(session));
    setCurrentUser(session);
    setLoginError("");
  }

  function handleLogout() {
    sessionStorage.removeItem("raksa_user");
    setCurrentUser(null);
  }

  if (!currentUser) return <LoginScreen onLogin={handleLogin} error={loginError} />;
  return <Dashboard user={currentUser} onLogout={handleLogout} />;
}

// ── Dashboard ──
function Dashboard({ user, onLogout }) {
  const LOCAL_KEY = `raksa_txn_${user.username}`;

  const [transactions, setTransactions] = useState(() => {
    try { const c = localStorage.getItem(LOCAL_KEY); return c ? JSON.parse(c) : []; } catch(e) { return []; }
  });
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [currency, setCurrency] = useState("USD");
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [form, setForm] = useState({ type:"income", category:"", amount:"", note:"", date:now.toISOString().split("T")[0] });
  const [editId, setEditId] = useState(null);
  const [syncStatus, setSyncStatus] = useState("loading");
  const [toast, setToast] = useState(null);
  const isFirst = useRef(true);
  const saveTimer = useRef(null);
  const latestTxn = useRef(transactions);
  const lastSavedJson = useRef(JSON.stringify(transactions));

  const fmt = n => currency === "USD" ? fmtUSD(n) : fmtKHR(n);
  const showToast = (msg, color="#2cb67d") => { setToast({msg,color}); setTimeout(()=>setToast(null),3000); };

  useEffect(() => { latestTxn.current = transactions; }, [transactions]);

  // Load from JSONBin on mount — cloud wins when its timestamp is newer
  useEffect(() => {
    (async () => {
      setSyncStatus("loading");
      try {
        const { transactions: cloudTxn, lastModified: cloudTs } = await loadBin(user.binId);
        const localTs = Number(localStorage.getItem(LOCAL_KEY + "_ts") || 0);
        if (cloudTs >= localTs) {
          setTransactions(cloudTxn);
          localStorage.setItem(LOCAL_KEY, JSON.stringify(cloudTxn));
          localStorage.setItem(LOCAL_KEY + "_ts", String(cloudTs));
          lastSavedJson.current = JSON.stringify(cloudTxn); // prevent redundant re-upload
        }
        setSyncStatus("synced");
      } catch(e) { setSyncStatus("offline"); }
    })();
  }, []);

  // Save on change — debounced 8s; flush immediately on tab close
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    const newJson = JSON.stringify(transactions);
    if (newJson === lastSavedJson.current) return;
    lastSavedJson.current = newJson;
    try { localStorage.setItem(LOCAL_KEY, newJson); } catch(e){}
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSyncStatus("saving");
      try {
        await saveBin(user.binId, latestTxn.current);
        localStorage.setItem(LOCAL_KEY + "_ts", String(Date.now()));
        setSyncStatus("synced");
        showToast("Saved ✓");
      } catch(e) {
        setSyncStatus("offline");
        showToast("Saved locally (cloud failed)", "#ff8906");
      }
    }, 8000);
  }, [transactions]);

  // Flush any pending cloud save when the tab closes
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveBin(user.binId, latestTxn.current, true);
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  // ── Monthly ──
  const filtered = transactions.filter(t => { const d=new Date(t.date); return d.getMonth()===selectedMonth&&d.getFullYear()===selectedYear; });
  const totalIncome  = filtered.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const totalExpense = filtered.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const balance = totalIncome-totalExpense;
  const catTotals = CATEGORIES.expense.map(cat=>({cat,total:filtered.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+t.amount,0)})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);

  // ── Yearly ──
  const yTx = transactions.filter(t=>new Date(t.date).getFullYear()===selectedYear);
  const yInc = yTx.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const yExp = yTx.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const yBal = yInc-yExp;
  const mData = MONTHS.map((m,i)=>{ const mx=yTx.filter(t=>new Date(t.date).getMonth()===i); const inc=mx.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0); const exp=mx.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0); return {month:m,income:inc,expense:exp,balance:inc-exp,count:mx.length}; });
  const maxBar = Math.max(...mData.map(m=>Math.max(m.income,m.expense)),1);
  const yCatTotals = CATEGORIES.expense.map(cat=>({cat,total:yTx.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+t.amount,0)})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);
  const activeMo = mData.filter(m=>m.income>0||m.expense>0);
  const bestMo  = activeMo.length ? activeMo.reduce((a,b)=>b.balance>a.balance?b:a,activeMo[0]) : null;
  const worstMo = activeMo.length ? activeMo.reduce((a,b)=>b.balance<a.balance?b:a,activeMo[0]) : null;

  function handleSubmit() {
    if (!form.category||!form.amount||!form.date) return;
    const entry = {...form,amount:parseFloat(form.amount),id:editId||Date.now()};
    if (editId) { setTransactions(p=>p.map(t=>t.id===editId?entry:t)); setEditId(null); }
    else { setTransactions(p=>[entry,...p]); }
    setForm({type:"income",category:"",amount:"",note:"",date:now.toISOString().split("T")[0]});
    setShowForm(false);
  }
  function handleEdit(t) { setForm({type:t.type,category:t.category,amount:String(t.amount),note:t.note||"",date:t.date}); setEditId(t.id); setShowForm(true); setActiveTab("dashboard"); }
  function handleDelete(id) { setTransactions(p=>p.filter(t=>t.id!==id)); }

  function exportCSV() {
    const h="Date,Type,Category,Amount (USD),Note";
    const rows=[...transactions].sort((a,b)=>new Date(a.date)-new Date(b.date)).map(t=>`${t.date},${t.type},${t.category},${t.amount},"${(t.note||"").replace(/"/g,'""')}"`);
    const blob=new Blob([[h,...rows].join("\n")],{type:"text/csv"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`${user.username}_finance_${selectedYear}.csv`; a.click(); URL.revokeObjectURL(url);
    showToast("CSV exported ✓");
  }

  function importCSV(e) {
    const file=e.target.files[0]; if(!file)return;
    const r=new FileReader(); r.onload=ev=>{
      try {
        const lines=ev.target.result.split("\n").slice(1).filter(l=>l.trim());
        const imp=lines.map(line=>{ const cols=[]; let cur="",inQ=false; for(let i=0;i<line.length;i++){if(line[i]==='"'){inQ=!inQ;continue;}if(line[i]===','&&!inQ){cols.push(cur);cur="";continue;}cur+=line[i];} cols.push(cur); const[date,type,category,amount,note]=cols.map(s=>s.trim()); return{date,type,category,amount:parseFloat(amount)||0,note:note||"",id:Date.now()+Math.random()}; }).filter(t=>t.date&&t.type&&t.category);
        setTransactions(p=>{ const k=new Set(p.map(t=>`${t.date}|${t.type}|${t.category}|${t.amount}`)); return [...p,...imp.filter(t=>!k.has(`${t.date}|${t.type}|${t.category}|${t.amount}`))]; });
        showToast(`Imported ${imp.length} transactions ✓`);
      } catch(_){ showToast("Import failed","#f25f4c"); }
    }; r.readAsText(file); e.target.value="";
  }

  const syncMap = {
    loading: { label:"Loading...", color:"#ff8906" },
    saving:  { label:"Saving...", color:"#ff8906" },
    synced:  { label:`☁️ Synced · ${transactions.length} transactions`, color:"#2cb67d" },
    offline: { label:"💾 Offline — data safe locally", color:"#a7a9be" },
  };
  const st = syncMap[syncStatus] || syncMap.synced;
  const tabs = [{id:"dashboard",label:"Overview"},{id:"report",label:"Monthly"},{id:"yearly",label:"Yearly"},{id:"all",label:"History"}];

  return (
    <div style={{minHeight:"100vh",background:"#0f0e17",fontFamily:"'DM Mono','Courier New',monospace",color:"#fffffe",overflowX:"hidden",width:"100%",maxWidth:"100vw",position:"relative"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0f0e17}::-webkit-scrollbar-thumb{background:#ff8906;border-radius:2px}
        .btn{cursor:pointer;border:none;border-radius:6px;font-family:inherit;font-size:13px;font-weight:500;padding:10px 18px;transition:all .15s}
        .btn-primary{background:#ff8906;color:#0f0e17}.btn-primary:hover{background:#ffaa44}
        .btn-ghost{background:transparent;color:#a7a9be;border:1px solid #2e2d3d}.btn-ghost:hover{border-color:#ff8906;color:#ff8906}
        .btn-danger{background:transparent;color:#f25f4c;border:1px solid #f25f4c22;font-size:11px;padding:5px 10px}.btn-danger:hover{background:#f25f4c22}
        .btn-edit{background:transparent;color:#a7a9be;border:1px solid #2e2d3d;font-size:11px;padding:5px 10px}.btn-edit:hover{border-color:#ff8906;color:#ff8906}
        .card{background:#1a1929;border:1px solid #2e2d3d;border-radius:12px;padding:20px;box-sizing:border-box;width:100%}
        .input{background:#12111f;border:1px solid #2e2d3d;border-radius:6px;color:#fffffe;font-family:inherit;font-size:13px;padding:10px 14px;width:100%;outline:none;transition:border .15s;box-sizing:border-box}
        .input:focus{border-color:#ff8906} select.input option{background:#1a1929}
        .tab{cursor:pointer;padding:8px 14px;border-radius:6px;font-size:12px;color:#a7a9be;transition:all .15s;border:none;background:transparent;font-family:inherit;white-space:nowrap}
        .tab.active{background:#ff8906;color:#0f0e17;font-weight:500}
        .bar-fill{border-radius:4px;transition:width .5s}
        .tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px}
        .tag-income{background:#2cb67d22;color:#2cb67d}.tag-expense{background:#f25f4c22;color:#f25f4c}
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px}
        .modal{background:#1a1929;border:1px solid #2e2d3d;border-radius:16px;padding:28px;width:calc(100% - 32px);max-width:440px;max-height:90vh;overflow-y:auto;box-sizing:border-box}
        .type-toggle{display:flex;background:#12111f;border-radius:8px;padding:4px;gap:4px}
        .type-btn{flex:1;padding:8px;border-radius:6px;border:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:500;transition:all .15s;min-width:0;box-sizing:border-box}
        .type-btn.income.active{background:#2cb67d;color:#fff}.type-btn.expense.active{background:#f25f4c;color:#fff}
        .type-btn:not(.active){background:transparent;color:#a7a9be}
        .stat-value{font-family:'Syne',sans-serif;font-weight:800}
        .nav-btn{background:transparent;border:1px solid #2e2d3d;color:#a7a9be;border-radius:6px;width:32px;height:32px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:all .15s}
        .nav-btn:hover{border-color:#ff8906;color:#ff8906}
        .row-item{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #1e1d2e}
        .row-item:last-child{border-bottom:none}
        .chart-bar-wrap{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:0}
        .yr-table{width:100%;border-collapse:collapse}
        .yr-table tr{border-bottom:1px solid #1e1d2e}
        .yr-table td,.yr-table th{padding:10px 8px;font-size:12px}
        .yr-table th{font-size:11px;color:#a7a9be;text-align:left;text-transform:uppercase;letter-spacing:.5px}
        .toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);padding:10px 22px;border-radius:8px;font-size:13px;font-weight:500;z-index:200;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.4);animation:fadeup .25s ease}
        @keyframes fadeup{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        .import-wrap{position:relative;overflow:hidden;flex:1}
        .import-wrap input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
        .pulse{animation:pulse 1.2s ease infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .header-title{font-family:'Syne',sans-serif;font-size:clamp(16px,4.5vw,20px);font-weight:800;color:#ff8906}
        .header-actions{display:flex;gap:8px;align-items:center}
        .header-wrap{background:#12111f;border-bottom:1px solid #2e2d3d;padding:14px 20px}
        .nav-wrap{padding:14px 20px;display:flex;flex-direction:column;gap:12px}
        .content-wrap{padding:0 20px 100px}
        .stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:100%}
        .stats-card{text-align:center;padding:14px}
        .stat-label{font-size:10px;color:#a7a9be;margin-bottom:6px}
        .currency-short{display:none}
        @media(max-width:600px){
          .header-actions{width:100%;justify-content:flex-end}
          .btn-danger{padding:9px 12px;font-size:12px}
          .btn-edit{padding:9px 12px;font-size:12px}
          .nav-btn{width:40px;height:40px;font-size:18px}
          .overlay{align-items:flex-end;padding:0}
          .modal{border-radius:20px 20px 0 0;max-height:92vh;max-width:100%;width:100%}
          .input{min-height:44px}
        }
        @media(max-width:480px){
          .header-wrap{padding:8px 12px}
          .nav-wrap{padding:8px 12px;gap:8px}
          .content-wrap{padding:0 12px 100px}
          .stats-grid{gap:6px}
          .stats-card{padding:10px 6px!important}
          .stat-value{font-size:13px!important}
          .stat-label{font-size:9px!important}
          .row-tag{display:none!important}
          .row-edit-btn{display:none!important}
          .row-amount{min-width:0!important;flex-shrink:0;font-size:12px!important}
          .row-item{gap:6px;padding:10px 0}
          .currency-full{display:none}
          .currency-short{display:inline}
          .btn-add{padding:6px 10px!important;font-size:12px!important}
          .btn-danger{width:28px!important;height:28px!important;padding:0!important;display:flex!important;align-items:center;justify-content:center;flex-shrink:0}
        }
      `}</style>

      {toast&&<div className="toast" style={{background:toast.color,color:"#fff"}}>{toast.msg}</div>}

      {/* Header */}
      <div className="header-wrap">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
          <div>
            <div className="header-title">Incomes and Expenses</div>
            <div style={{fontSize:10,color:st.color,marginTop:2}} className={syncStatus==="saving"||syncStatus==="loading"?"pulse":""}>
              {st.label}
            </div>
          </div>
          <div className="header-actions">
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:12,fontWeight:500,color:"#fffffe"}}>{user.displayName}</div>
              <button onClick={onLogout} style={{fontSize:10,color:"#a7a9be",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",padding:0}}>Sign out</button>
            </div>
            <button className="btn btn-ghost" style={{padding:"6px 12px",fontSize:12}} onClick={()=>setCurrency(c=>c==="USD"?"KHR":"USD")}>
              <span className="currency-full">{currency==="USD"?"$ USD":"៛ KHR"}</span>
              <span className="currency-short">{currency==="USD"?"$":"K"}</span>
            </button>
            <button className="btn btn-primary btn-add" onClick={()=>{setEditId(null);setForm({type:"income",category:"",amount:"",note:"",date:now.toISOString().split("T")[0]});setShowForm(true);}}>
              + Add
            </button>
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:10}}>
          <button className="btn btn-ghost" style={{flex:1,fontSize:11,padding:"7px 10px"}} onClick={exportCSV}>↓ Export CSV</button>
          <div className="import-wrap">
            <button className="btn btn-ghost" style={{width:"100%",fontSize:11,padding:"7px 10px"}}>↑ Import CSV</button>
            <input type="file" accept=".csv" onChange={importCSV}/>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="nav-wrap">
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button className="nav-btn" onClick={()=>{ if(activeTab==="yearly"){setSelectedYear(y=>y-1);return;} if(selectedMonth===0){setSelectedMonth(11);setSelectedYear(y=>y-1);}else setSelectedMonth(m=>m-1); }}>‹</button>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15,flex:1,textAlign:"center"}}>
            {activeTab==="yearly"?`Annual Report ${selectedYear}`:`${MONTHS_FULL[selectedMonth]} ${selectedYear}`}
          </span>
          <button className="nav-btn" onClick={()=>{ if(activeTab==="yearly"){setSelectedYear(y=>y+1);return;} if(selectedMonth===11){setSelectedMonth(0);setSelectedYear(y=>y+1);}else setSelectedMonth(m=>m+1); }}>›</button>
        </div>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          {tabs.map(t=><button key={t.id} className={`tab ${activeTab===t.id?"active":""}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>)}
        </div>
      </div>

      <div className="content-wrap">
        {activeTab==="dashboard"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div className="stats-grid">
              {[{label:"Income",value:totalIncome,color:"#2cb67d"},{label:"Expenses",value:totalExpense,color:"#f25f4c"},{label:"Balance",value:balance,color:balance>=0?"#ff8906":"#f25f4c"}].map(s=>(
                <div key={s.label} className="card stats-card">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value" style={{color:s.color,fontSize:14}}>{fmt(s.value)}</div>
                </div>
              ))}
            </div>
            {totalIncome>0&&<div className="card">
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10,fontSize:12,color:"#a7a9be"}}>
                <span>Expense Rate</span><span style={{color:totalExpense/totalIncome>0.8?"#f25f4c":"#2cb67d"}}>{Math.round((totalExpense/totalIncome)*100)}%</span>
              </div>
              <div style={{background:"#12111f",borderRadius:4,height:8}}>
                <div className="bar-fill" style={{width:`${Math.min(100,(totalExpense/totalIncome)*100)}%`,height:8,background:totalExpense/totalIncome>0.8?"#f25f4c":"#2cb67d"}}/>
              </div>
            </div>}
            <div className="card">
              <div style={{fontSize:12,color:"#a7a9be",marginBottom:14,textTransform:"uppercase",letterSpacing:1}}>Recent</div>
              {filtered.length===0?<div style={{textAlign:"center",color:"#a7a9be",padding:"24px 0",fontSize:13}}>No transactions this month</div>
                :filtered.slice(0,8).map(t=>(
                  <div key={t.id} className="row-item">
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.category}</div>
                      <div style={{fontSize:11,color:"#a7a9be"}}>{t.note||t.date}</div>
                    </div>
                    <span className={`tag tag-${t.type} row-tag`}>{t.type}</span>
                    <div className="row-amount" style={{fontWeight:500,color:t.type==="income"?"#2cb67d":"#f25f4c",fontSize:12,minWidth:70,textAlign:"right"}}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</div>
                    <button className="btn-edit btn row-edit-btn" onClick={()=>handleEdit(t)}>✎</button>
                    <button className="btn-danger btn" onClick={()=>handleDelete(t.id)}>✕</button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {activeTab==="report"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div className="card">
              <div style={{fontSize:12,color:"#a7a9be",marginBottom:14,textTransform:"uppercase",letterSpacing:1}}>Expense by Category</div>
              {catTotals.length===0?<div style={{textAlign:"center",color:"#a7a9be",padding:"24px 0",fontSize:13}}>No expense data</div>
                :catTotals.map(c=>(<div key={c.cat} style={{marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:5}}><span>{c.cat}</span><span style={{color:"#f25f4c"}}>{fmt(c.total)}</span></div>
                  <div style={{background:"#12111f",borderRadius:4,height:6}}><div className="bar-fill" style={{width:`${totalExpense?(c.total/totalExpense)*100:0}%`,height:6,background:"#f25f4c"}}/></div>
                </div>))}
            </div>
            <div className="card">
              <div style={{fontSize:12,color:"#a7a9be",marginBottom:14,textTransform:"uppercase",letterSpacing:1}}>Income Sources</div>
              {CATEGORIES.income.map(cat=>{ const total=filtered.filter(t=>t.type==="income"&&t.category===cat).reduce((s,t)=>s+t.amount,0); if(!total)return null; return <div key={cat} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #1e1d2e",fontSize:13}}><span>{cat}</span><span style={{color:"#2cb67d",fontWeight:500}}>{fmt(total)}</span></div>; })}
              {filtered.filter(t=>t.type==="income").length===0&&<div style={{textAlign:"center",color:"#a7a9be",padding:"24px 0",fontSize:13}}>No income data</div>}
            </div>
            <div className="card" style={{borderColor:"#ff890622",background:"#ff890608"}}>
              <div style={{fontSize:12,color:"#ff8906",marginBottom:14,textTransform:"uppercase",letterSpacing:1}}>Monthly Summary</div>
              {[{label:"Total Income",val:fmt(totalIncome),c:"#2cb67d"},{label:"Total Expenses",val:fmt(totalExpense),c:"#f25f4c"},{label:"Net Balance",val:fmt(balance),c:balance>=0?"#ff8906":"#f25f4c"},{label:"Savings Rate",val:totalIncome>0?`${Math.round(((totalIncome-totalExpense)/totalIncome)*100)}%`:"—",c:"#a7a9be"},{label:"Transactions",val:filtered.length,c:"#a7a9be"}].map(r=>(
                <div key={r.label} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #2e2d3d",fontSize:13}}>
                  <span style={{color:"#a7a9be"}}>{r.label}</span><span style={{color:r.c,fontWeight:500}}>{r.val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab==="yearly"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[{label:"Total Income",value:yInc,color:"#2cb67d"},{label:"Total Expenses",value:yExp,color:"#f25f4c"},{label:"Net Savings",value:yBal,color:yBal>=0?"#ff8906":"#f25f4c"},{label:"Avg Monthly Save",value:activeMo.length?yBal/activeMo.length:0,color:"#a7a9be"}].map(s=>(
                <div key={s.label} className="card" style={{textAlign:"center"}}>
                  <div style={{fontSize:11,color:"#a7a9be",marginBottom:6}}>{s.label}</div>
                  <div className="stat-value" style={{color:s.color,fontSize:15}}>{fmt(s.value)}</div>
                </div>
              ))}
            </div>
            {yInc>0&&<div className="card">
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10,fontSize:12,color:"#a7a9be"}}>
                <span>Annual Expense Rate</span><span style={{color:yExp/yInc>0.8?"#f25f4c":"#2cb67d"}}>{Math.round((yExp/yInc)*100)}% spent</span>
              </div>
              <div style={{background:"#12111f",borderRadius:4,height:10,display:"flex",overflow:"hidden"}}>
                <div style={{height:"100%",background:"#2cb67d",width:`${Math.min(100,(yInc-yExp)/yInc*100)}%`,transition:"width .5s"}}/>
                <div style={{height:"100%",background:"#f25f4c",width:`${Math.min(100,yExp/yInc*100)}%`,transition:"width .5s"}}/>
              </div>
              <div style={{display:"flex",gap:16,marginTop:8,fontSize:11}}><span style={{color:"#2cb67d"}}>■ Savings</span><span style={{color:"#f25f4c"}}>■ Expenses</span></div>
            </div>}
            <div className="card">
              <div style={{fontSize:12,color:"#a7a9be",marginBottom:16,textTransform:"uppercase",letterSpacing:1}}>Month-by-Month {selectedYear}</div>
              <div style={{display:"flex",gap:4,alignItems:"flex-end",height:110}}>
                {mData.map((m,i)=>(<div key={i} className="chart-bar-wrap">
                  <div style={{display:"flex",gap:2,alignItems:"flex-end",height:88}}>
                    <div style={{width:9,borderRadius:"2px 2px 0 0",background:"#2cb67d",height:`${m.income?(m.income/maxBar)*88:0}px`,minHeight:m.income?2:0}}/>
                    <div style={{width:9,borderRadius:"2px 2px 0 0",background:"#f25f4c",height:`${m.expense?(m.expense/maxBar)*88:0}px`,minHeight:m.expense?2:0}}/>
                  </div>
                  <div style={{fontSize:8,color:"#a7a9be",textAlign:"center"}}>{m.month}</div>
                </div>))}
              </div>
              <div style={{display:"flex",gap:16,marginTop:10,fontSize:11}}><span style={{color:"#2cb67d"}}>■ Income</span><span style={{color:"#f25f4c"}}>■ Expense</span></div>
            </div>
            <div className="card" style={{overflowX:"auto"}}>
              <div style={{fontSize:12,color:"#a7a9be",marginBottom:14,textTransform:"uppercase",letterSpacing:1}}>Monthly Breakdown</div>
              <table className="yr-table">
                <thead><tr><th>Month</th><th style={{textAlign:"right"}}>Income</th><th style={{textAlign:"right"}}>Expense</th><th style={{textAlign:"right"}}>Balance</th></tr></thead>
                <tbody>
                  {mData.map((m,i)=>(<tr key={i} style={{opacity:m.count===0?0.3:1,cursor:m.count>0?"pointer":"default"}} onClick={()=>{if(m.count>0){setSelectedMonth(i);setActiveTab("dashboard");}}}>
                    <td style={{color:i===now.getMonth()&&selectedYear===now.getFullYear()?"#ff8906":"#fffffe"}}>{MONTHS_FULL[i]}</td>
                    <td style={{textAlign:"right",color:"#2cb67d"}}>{m.income>0?fmt(m.income):"—"}</td>
                    <td style={{textAlign:"right",color:"#f25f4c"}}>{m.expense>0?fmt(m.expense):"—"}</td>
                    <td style={{textAlign:"right",color:m.balance>0?"#2cb67d":m.balance<0?"#f25f4c":"#a7a9be",fontWeight:500}}>{m.count>0?(m.balance>=0?"+":"")+fmt(m.balance):"—"}</td>
                  </tr>))}
                  <tr style={{borderTop:"2px solid #ff890644"}}>
                    <td style={{color:"#ff8906",fontWeight:700,paddingTop:12}}>TOTAL</td>
                    <td style={{textAlign:"right",color:"#2cb67d",fontWeight:600,paddingTop:12}}>{fmt(yInc)}</td>
                    <td style={{textAlign:"right",color:"#f25f4c",fontWeight:600,paddingTop:12}}>{fmt(yExp)}</td>
                    <td style={{textAlign:"right",color:yBal>=0?"#ff8906":"#f25f4c",fontWeight:700,paddingTop:12}}>{(yBal>=0?"+":"")+fmt(yBal)}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{fontSize:11,color:"#a7a9be",marginTop:10}}>💡 Tap a month row to see its details</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div className="card" style={{borderColor:"#2cb67d22",background:"#2cb67d08"}}>
                <div style={{fontSize:10,color:"#2cb67d",marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>Best Month</div>
                {bestMo?<><div className="stat-value" style={{fontSize:15,color:"#2cb67d"}}>{bestMo.month}</div><div style={{fontSize:11,color:"#a7a9be",marginTop:4}}>{fmt(bestMo.balance)}</div></>:<div style={{fontSize:12,color:"#a7a9be"}}>No data</div>}
              </div>
              <div className="card" style={{borderColor:"#f25f4c22",background:"#f25f4c08"}}>
                <div style={{fontSize:10,color:"#f25f4c",marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>Hardest Month</div>
                {worstMo?<><div className="stat-value" style={{fontSize:15,color:"#f25f4c"}}>{worstMo.month}</div><div style={{fontSize:11,color:"#a7a9be",marginTop:4}}>{fmt(Math.abs(worstMo.balance))}</div></>:<div style={{fontSize:12,color:"#a7a9be"}}>No data</div>}
              </div>
            </div>
            <div className="card" style={{borderColor:"#ff890622",background:"#ff890608"}}>
              <div style={{fontSize:12,color:"#ff8906",marginBottom:14,textTransform:"uppercase",letterSpacing:1}}>Annual Summary {selectedYear}</div>
              {[{label:"Total Income",val:fmt(yInc),c:"#2cb67d"},{label:"Total Expenses",val:fmt(yExp),c:"#f25f4c"},{label:"Net Savings",val:fmt(yBal),c:yBal>=0?"#ff8906":"#f25f4c"},{label:"Savings Rate",val:yInc>0?`${Math.round(((yInc-yExp)/yInc)*100)}%`:"—",c:"#a7a9be"},{label:"Avg Monthly Income",val:activeMo.length?fmt(yInc/activeMo.length):"—",c:"#a7a9be"},{label:"Avg Monthly Expense",val:activeMo.length?fmt(yExp/activeMo.length):"—",c:"#a7a9be"},{label:"Active Months",val:`${activeMo.length} / 12`,c:"#a7a9be"},{label:"Total Transactions",val:yTx.length,c:"#a7a9be"}].map(r=>(
                <div key={r.label} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #2e2d3d",fontSize:13}}>
                  <span style={{color:"#a7a9be"}}>{r.label}</span><span style={{color:r.c,fontWeight:500}}>{r.val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab==="all"&&(
          <div className="card">
            <div style={{fontSize:12,color:"#a7a9be",marginBottom:14,textTransform:"uppercase",letterSpacing:1}}>
              {MONTHS_FULL[selectedMonth]} {selectedYear} · {filtered.length} transactions
            </div>
            {filtered.length===0?<div style={{textAlign:"center",color:"#a7a9be",padding:"24px 0",fontSize:13}}>No transactions this month</div>
              :[...filtered].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(t=>(
                <div key={t.id} className="row-item">
                  <div style={{minWidth:40,fontSize:11,color:"#a7a9be"}}>{t.date.slice(5)}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500}}>{t.category}</div>
                    {t.note&&<div style={{fontSize:11,color:"#a7a9be"}}>{t.note}</div>}
                  </div>
                  <span className={`tag tag-${t.type} row-tag`}>{t.type}</span>
                  <div className="row-amount" style={{fontWeight:500,color:t.type==="income"?"#2cb67d":"#f25f4c",fontSize:12,minWidth:70,textAlign:"right"}}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</div>
                  <button className="btn-edit btn row-edit-btn" onClick={()=>handleEdit(t)}>✎</button>
                  <button className="btn-danger btn" onClick={()=>handleDelete(t.id)}>✕</button>
                </div>
              ))}
          </div>
        )}
      </div>

      {showForm&&(
        <div className="overlay" onClick={e=>e.target===e.currentTarget&&setShowForm(false)}>
          <div className="modal">
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:800,marginBottom:20}}>{editId?"Edit Transaction":"New Transaction"}</div>
            <div className="type-toggle" style={{marginBottom:16}}>
              {["income","expense"].map(type=>(<button key={type} className={`type-btn ${type} ${form.type===type?"active":""}`} onClick={()=>setForm(f=>({...f,type,category:""}))}>
                {type.charAt(0).toUpperCase()+type.slice(1)}
              </button>))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <select className="input" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                <option value="">Select category</option>
                {CATEGORIES[form.type].map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <input className="input" type="number" placeholder="Amount (USD)" min="0" step="0.01" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/>
              <input className="input" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{textAlign:"left"}}/>
              <input className="input" type="text" placeholder="Note (optional)" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>
            </div>
            <div style={{display:"flex",gap:10,marginTop:20}}>
              <button className="btn btn-ghost" style={{flex:1,minWidth:0}} onClick={()=>{setShowForm(false);setEditId(null);}}>Cancel</button>
              <button className="btn btn-primary" style={{flex:2,minWidth:0}} onClick={handleSubmit}>{editId?"Save Changes":"Add Transaction"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
