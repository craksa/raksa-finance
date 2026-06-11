import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

// Seeded into each user's account on first load; after that the DB is the source of truth
const CATEGORIES = {
  income: ["Salary", "Freelance", "Bonus", "Investment", "Other Income"],
  expense: ["Food & Dining", "Transport", "Utilities", "Shopping", "Health", "Entertainment", "Rent", "Savings", "Investment", "Other"],
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const now = new Date();

// Existing users: username → email (for backward-compat username login)
const USERNAME_MAP = {
  raksa:  { email: "raksask90@gmail.com",    display: "Raksa" },
  dara:   { email: "dara@gmail.com",         display: "Dara" },
  sreydy: { email: "raksa.chou99@gmail.com", display: "Sreydy" },
};

function fmtUSD(n) { return "$" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function fmtKHR(n) { return "៛" + Math.round(n * 4100).toLocaleString(); }

// dd-Mon-yyyy hh:mm — day comes from the user-picked `date`, time from
// `created_at` (when the entry was recorded; the date column stores no time).
function fmtDateTime(t) {
  const d = t.date;
  const day = `${d.slice(8,10)}-${MONTHS[parseInt(d.slice(5,7),10)-1]}-${d.slice(0,4)}`;
  if (!t.created_at) return day;
  const c = new Date(t.created_at);
  return `${day} ${String(c.getHours()).padStart(2,"0")}:${String(c.getMinutes()).padStart(2,"0")}`;
}

function getDisplayName(session) {
  const meta = session?.user?.user_metadata?.username;
  if (meta) return meta.charAt(0).toUpperCase() + meta.slice(1);
  const email = session?.user?.email || "";
  const match = Object.entries(USERNAME_MAP).find(([, v]) => v.email === email);
  return match ? match[1].display : email.split("@")[0];
}

// Resolve login input (username or email) to an email address
async function resolveEmail(input) {
  const v = input.trim().toLowerCase();
  if (v.includes("@")) return v;
  if (USERNAME_MAP[v]) return USERNAME_MAP[v].email;
  const { data } = await supabase.rpc("get_email_for_username", { uname: v });
  return data || null;
}

// ── Shared auth shell ──
function AuthShell({ children, subtitle }) {
  return (
    <div style={{minHeight:"100vh",background:"#0f0e17",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'DM Mono','Courier New',monospace"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0}`}</style>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{fontFamily:"Tahoma,sans-serif",fontSize:36,fontWeight:800,color:"#ff8906",letterSpacing:-1}}>Incomes and Expenses</div>
          <div style={{fontSize:12,color:"#a7a9be",marginTop:6}}>{subtitle||"Finance Tracker · Phnom Penh"}</div>
        </div>
        {children}
        <div style={{textAlign:"center",fontSize:11,color:"#a7a9be",marginTop:20}}>Personal finance tracker · Private & secure</div>
      </div>
    </div>
  );
}

const authInp = {background:"#12111f",border:"1px solid #2e2d3d",borderRadius:6,color:"#fffffe",fontFamily:"'DM Mono','Courier New',monospace",fontSize:13,padding:"10px 14px",outline:"none",width:"100%",boxSizing:"border-box"};

// ── Login Screen ──
function LoginScreen({ onSwitch }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!login || !password) { setError("Please fill in all fields"); return; }
    setLoading(true); setError("");
    const email = await resolveEmail(login);
    if (!email) { setLoading(false); setError("Username not found — try your email address"); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
  }

  return (
    <AuthShell>
      <div style={{background:"#1a1929",border:"1px solid #2e2d3d",borderRadius:16,padding:28}}>
        <div style={{fontSize:14,fontWeight:500,marginBottom:20,color:"#fffffe"}}>Sign In</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <input style={authInp} placeholder="Username or Email" value={login} onChange={e=>setLogin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} autoCapitalize="none" autoComplete="username"/>
          <div style={{position:"relative"}}>
            <input style={{...authInp,padding:"10px 40px 10px 14px"}} type={showPw?"text":"password"} placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} autoComplete="current-password"/>
            <button onClick={()=>setShowPw(s=>!s)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#a7a9be",cursor:"pointer",fontSize:13}}>{showPw?"Hide":"Show"}</button>
          </div>
          {error&&<div style={{color:"#f25f4c",fontSize:12,textAlign:"center"}}>{error}</div>}
          <button onClick={handleLogin} disabled={loading} style={{background:"#ff8906",color:"#0f0e17",border:"none",borderRadius:6,padding:"12px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer",marginTop:4,opacity:loading?0.7:1}}>
            {loading?"Signing in...":"Sign In"}
          </button>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
            <button onClick={()=>onSwitch("forgot")} style={{background:"none",border:"none",color:"#a7a9be",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Forgot password?</button>
            <button onClick={()=>onSwitch("signup")} style={{background:"none",border:"none",color:"#ff8906",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Create account →</button>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}

// ── Sign Up Screen ──
function SignupScreen({ onSwitch }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    const uname = username.trim().toLowerCase();
    const mail  = email.trim().toLowerCase();
    if (!uname || !mail || !password) { setError("Please fill in all fields"); return; }
    if (!/^[a-z0-9_]+$/.test(uname))  { setError("Username: letters, numbers and _ only"); return; }
    if (USERNAME_MAP[uname])           { setError("Username already taken"); return; }
    if (password !== confirm)          { setError("Passwords do not match"); return; }
    if (password.length < 6)           { setError("Password must be at least 6 characters"); return; }
    setLoading(true); setError("");
    const { data: taken } = await supabase.rpc("get_email_for_username", { uname });
    if (taken) { setLoading(false); setError("Username already taken"); return; }
    const { error } = await supabase.auth.signUp({
      email: mail,
      password,
      options: {
        data: { username: uname },
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    });
    setLoading(false);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already in use")) {
        setError("Email already registered — try signing in");
      } else {
        setError(error.message);
      }
      return;
    }
    setSuccess(true);
  }

  if (success) return (
    <AuthShell subtitle="Account created!">
      <div style={{background:"#1a1929",border:"1px solid #2e2d3d",borderRadius:16,padding:28,textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:16}}>✉️</div>
        <div style={{color:"#2cb67d",fontWeight:500,marginBottom:8}}>Check your email</div>
        <div style={{color:"#a7a9be",fontSize:12,marginBottom:4}}>We sent a confirmation link to <strong style={{color:"#fffffe"}}>{email}</strong>.</div>
        <div style={{color:"#a7a9be",fontSize:12,marginBottom:20}}>After confirming, sign in with your <strong style={{color:"#fffffe"}}>email address</strong>.</div>
        <button onClick={()=>onSwitch("login")} style={{background:"none",border:"1px solid #2e2d3d",borderRadius:6,color:"#a7a9be",fontSize:13,cursor:"pointer",fontFamily:"inherit",padding:"10px 20px"}}>← Back to Sign In</button>
      </div>
    </AuthShell>
  );

  return (
    <AuthShell subtitle="Create your account">
      <div style={{background:"#1a1929",border:"1px solid #2e2d3d",borderRadius:16,padding:28}}>
        <div style={{fontSize:14,fontWeight:500,marginBottom:20,color:"#fffffe"}}>Create Account</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <input style={authInp} placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} autoCapitalize="none" autoComplete="username"/>
          <input style={authInp} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} autoCapitalize="none" autoComplete="email"/>
          <div style={{position:"relative"}}>
            <input style={{...authInp,padding:"10px 40px 10px 14px"}} type={showPw?"text":"password"} placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/>
            <button onClick={()=>setShowPw(s=>!s)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#a7a9be",cursor:"pointer",fontSize:13}}>{showPw?"Hide":"Show"}</button>
          </div>
          <input style={authInp} type="password" placeholder="Confirm password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/>
          {error&&<div style={{color:"#f25f4c",fontSize:12,textAlign:"center"}}>{error}</div>}
          <button onClick={handleSignup} disabled={loading} style={{background:"#ff8906",color:"#0f0e17",border:"none",borderRadius:6,padding:"12px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer",marginTop:4,opacity:loading?0.7:1}}>
            {loading?"Creating account...":"Create Account"}
          </button>
          <div style={{textAlign:"center",marginTop:4}}>
            <button onClick={()=>onSwitch("login")} style={{background:"none",border:"none",color:"#a7a9be",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>← Back to Sign In</button>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}

// ── Forgot Password Screen ──
function ForgotPasswordScreen({ onSwitch }) {
  const [login, setLogin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    if (!login) { setError("Please enter your username or email"); return; }
    setLoading(true); setError("");
    const email = await resolveEmail(login);
    if (!email) { setLoading(false); setError("Username not found — try your email address"); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSuccess(true);
  }

  if (success) return (
    <AuthShell subtitle="Check your email">
      <div style={{background:"#1a1929",border:"1px solid #2e2d3d",borderRadius:16,padding:28,textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:16}}>✉️</div>
        <div style={{color:"#2cb67d",fontWeight:500,marginBottom:8}}>Reset email sent</div>
        <div style={{color:"#a7a9be",fontSize:12,marginBottom:20}}>Check your email for password reset instructions.</div>
        <button onClick={()=>onSwitch("login")} style={{background:"none",border:"1px solid #2e2d3d",borderRadius:6,color:"#a7a9be",fontSize:13,cursor:"pointer",fontFamily:"inherit",padding:"10px 20px"}}>← Back to Sign In</button>
      </div>
    </AuthShell>
  );

  return (
    <AuthShell subtitle="Reset your password">
      <div style={{background:"#1a1929",border:"1px solid #2e2d3d",borderRadius:16,padding:28}}>
        <div style={{fontSize:14,fontWeight:500,marginBottom:8,color:"#fffffe"}}>Forgot Password</div>
        <div style={{fontSize:12,color:"#a7a9be",marginBottom:20}}>Enter your username or email to get a reset link.</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <input style={authInp} placeholder="Username or Email" value={login} onChange={e=>setLogin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleReset()} autoCapitalize="none"/>
          {error&&<div style={{color:"#f25f4c",fontSize:12,textAlign:"center"}}>{error}</div>}
          <button onClick={handleReset} disabled={loading} style={{background:"#ff8906",color:"#0f0e17",border:"none",borderRadius:6,padding:"12px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer",marginTop:4,opacity:loading?0.7:1}}>
            {loading?"Sending...":"Send Reset Email"}
          </button>
          <div style={{textAlign:"center",marginTop:4}}>
            <button onClick={()=>onSwitch("login")} style={{background:"none",border:"none",color:"#a7a9be",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>← Back to Sign In</button>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}

// ── Reset Password Form (used on full-screen recovery page) ──
function ResetPasswordForm({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleChange() {
    if (!password)               { setError("Please enter a new password"); return; }
    if (password.length < 6)     { setError("Password must be at least 6 characters"); return; }
    if (password !== confirm)    { setError("Passwords do not match"); return; }
    setLoading(true); setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    onDone();
  }

  return (
    <>
      <div style={{fontFamily:"Tahoma,sans-serif",fontSize:18,fontWeight:800,marginBottom:8,color:"#fffffe"}}>Set New Password</div>
      <div style={{fontSize:12,color:"#ff8906",marginBottom:20}}>Choose a new password for your account.</div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{position:"relative"}}>
          <input style={{...authInp,padding:"10px 40px 10px 14px"}} type={showPw?"text":"password"} placeholder="New password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/>
          <button onClick={()=>setShowPw(s=>!s)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#a7a9be",cursor:"pointer",fontSize:13}}>{showPw?"Hide":"Show"}</button>
        </div>
        <input style={authInp} type="password" placeholder="Confirm new password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/>
        {error&&<div style={{color:"#f25f4c",fontSize:12,textAlign:"center"}}>{error}</div>}
        <button onClick={handleChange} disabled={loading} style={{background:"#ff8906",color:"#0f0e17",border:"none",borderRadius:6,padding:"12px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer",marginTop:4,opacity:loading?0.7:1}}>
          {loading?"Saving...":"Update Password"}
        </button>
      </div>
    </>
  );
}

// ── Change Password Modal (used inside Profile modal) ──
function ChangePasswordModal({ onDone, onClose }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleChange() {
    if (!password)            { setError("Please enter a new password"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters"); return; }
    setLoading(true); setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    onDone();
  }

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div style={{fontFamily:"Tahoma,sans-serif",fontSize:18,fontWeight:800,marginBottom:20}}>Change Password</div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{position:"relative"}}>
            <input style={{background:"#12111f",border:"1px solid #2e2d3d",borderRadius:6,color:"#fffffe",fontFamily:"inherit",fontSize:13,padding:"10px 40px 10px 14px",width:"100%",outline:"none",boxSizing:"border-box"}} type={showPw?"text":"password"} placeholder="New password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/>
            <button onClick={()=>setShowPw(s=>!s)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#a7a9be",cursor:"pointer",fontSize:13}}>{showPw?"Hide":"Show"}</button>
          </div>
          <input style={{background:"#12111f",border:"1px solid #2e2d3d",borderRadius:6,color:"#fffffe",fontFamily:"inherit",fontSize:13,padding:"10px 14px",width:"100%",outline:"none",boxSizing:"border-box"}} type="password" placeholder="Confirm new password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/>
          {error&&<div style={{color:"#f25f4c",fontSize:12,textAlign:"center"}}>{error}</div>}
        </div>
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button className="btn btn-ghost" style={{flex:1,minWidth:0}} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{flex:2,minWidth:0}} onClick={handleChange} disabled={loading}>{loading?"Saving...":"Update Password"}</button>
        </div>
      </div>
    </div>
  );
}

// ── User Profile Modal ──
function UserProfileModal({ session, onClose, showToast }) {
  const [displayName, setDisplayName] = useState(session.user.user_metadata?.username || "");
  const [email, setEmail]             = useState(session.user.email || "");
  const [newPw, setNewPw]             = useState("");
  const [confirmPw, setConfirmPw]     = useState("");
  const [showPw, setShowPw]           = useState(false);
  const [showPwSection, setShowPwSection] = useState(false);
  const [error, setError]             = useState("");
  const [saving, setSaving]           = useState(false);

  async function handleSave() {
    setError("");
    const updates = {};
    const trimName  = displayName.trim();
    const trimEmail = email.trim().toLowerCase();

    if (!trimName) { setError("Display name cannot be empty"); return; }

    if (trimName !== (session.user.user_metadata?.username || "")) {
      updates.data = { username: trimName };
    }
    if (trimEmail !== session.user.email) {
      if (!trimEmail.includes("@")) { setError("Enter a valid email address"); return; }
      updates.email = trimEmail;
    }
    if (newPw) {
      if (newPw.length < 6)   { setError("Password must be at least 6 characters"); return; }
      if (newPw !== confirmPw) { setError("Passwords do not match"); return; }
      updates.password = newPw;
    }

    if (Object.keys(updates).length === 0) { onClose(); return; }

    setSaving(true);
    const { error } = await supabase.auth.updateUser(updates);
    setSaving(false);
    if (error) { setError(error.message); return; }

    const notes = [];
    if (updates.data)     notes.push("Name updated");
    if (updates.email)    notes.push("Verification sent to new email");
    if (updates.password) notes.push("Password changed");
    showToast(notes.join(" · ") + " ✓");
    onClose();
  }

  const mInp = {background:"#12111f",border:"1px solid #2e2d3d",borderRadius:6,color:"#fffffe",fontFamily:"inherit",fontSize:13,padding:"10px 14px",width:"100%",outline:"none",boxSizing:"border-box"};

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div style={{fontFamily:"Tahoma,sans-serif",fontSize:18,fontWeight:800,marginBottom:20}}>Account Settings</div>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Display name */}
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:11,color:"#a7a9be",paddingLeft:2}}>Display Name</label>
            <input style={mInp} value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Your name" autoComplete="nickname"/>
          </div>

          {/* Email */}
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:11,color:"#a7a9be",paddingLeft:2}}>Email</label>
            <input style={mInp} type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/>
            {email.trim().toLowerCase() !== session.user.email &&
              <div style={{fontSize:11,color:"#ff8906",paddingLeft:2}}>A verification link will be sent to the new address</div>}
          </div>

          {/* Password section (collapsible) */}
          <div style={{borderTop:"1px solid #2e2d3d",paddingTop:14}}>
            <button
              onClick={()=>{setShowPwSection(s=>!s);setNewPw("");setConfirmPw("");}}
              style={{background:"none",border:"none",color:"#a7a9be",fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:0}}
            >
              {showPwSection?"▲ Hide password change":"▼ Change password"}
            </button>
            {showPwSection&&(
              <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:12}}>
                <div style={{position:"relative"}}>
                  <input style={{...mInp,paddingRight:50}} type={showPw?"text":"password"} placeholder="New password" value={newPw} onChange={e=>setNewPw(e.target.value)} autoComplete="new-password"/>
                  <button onClick={()=>setShowPw(s=>!s)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#a7a9be",cursor:"pointer",fontSize:13}}>{showPw?"Hide":"Show"}</button>
                </div>
                <input style={mInp} type="password" placeholder="Confirm new password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} autoComplete="new-password"/>
              </div>
            )}
          </div>

          {error&&<div style={{color:"#f25f4c",fontSize:12,textAlign:"center"}}>{error}</div>}
        </div>

        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button className="btn btn-ghost" style={{flex:1,minWidth:0}} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{flex:2,minWidth:0}} onClick={handleSave} disabled={saving}>{saving?"Saving...":"Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Category Manager Modal ──
function CategoryManagerModal({ session, customCats, setCustomCats, transactions, setTransactions, showToast, onClose }) {
  const [type, setType]           = useState("expense");
  const [newName, setNewName]     = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName]   = useState("");
  const [error, setError]         = useState("");
  const [busy, setBusy]           = useState(false);

  const customs  = customCats.filter(c => c.type === type);
  const allNames = customs.map(c => c.name);
  const inUse = name => transactions.some(t => t.type === type && t.category === name);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) { setError("Enter a category name"); return; }
    if (allNames.some(n => n.toLowerCase() === name.toLowerCase())) { setError("Category already exists"); return; }
    setBusy(true); setError("");
    const { data, error } = await supabase.from("categories")
      .insert({ user_id: session.user.id, type, name })
      .select().single();
    setBusy(false);
    if (error) { setError("Failed to add category"); return; }
    setCustomCats(p => [...p, data].sort((a,b) => a.name.localeCompare(b.name)));
    setNewName("");
    showToast("Category added ✓");
  }

  async function handleRename(cat) {
    const name = editName.trim();
    if (!name) { setError("Enter a category name"); return; }
    if (name === cat.name) { setEditingId(null); return; }
    if (allNames.some(n => n.toLowerCase() === name.toLowerCase())) { setError("Category already exists"); return; }
    setBusy(true); setError("");
    const { error } = await supabase.from("categories").update({ name }).eq("id", cat.id);
    if (error) { setBusy(false); setError("Failed to rename category"); return; }
    // Keep existing transactions pointing at the renamed category
    const { error: txErr } = await supabase.from("transactions")
      .update({ category: name })
      .eq("user_id", session.user.id).eq("type", type).eq("category", cat.name);
    setBusy(false);
    if (txErr) { setError("Renamed, but failed to update its transactions"); return; }
    setCustomCats(p => p.map(c => c.id === cat.id ? { ...c, name } : c));
    setTransactions(p => p.map(t => t.type === type && t.category === cat.name ? { ...t, category: name } : t));
    setEditingId(null);
    showToast("Category renamed ✓");
  }

  async function handleDelete(cat) {
    if (inUse(cat.name)) { setError(`"${cat.name}" is used by transactions and can't be deleted`); return; }
    setBusy(true); setError("");
    const { error } = await supabase.from("categories").delete().eq("id", cat.id);
    setBusy(false);
    if (error) { setError("Failed to delete category"); return; }
    setCustomCats(p => p.filter(c => c.id !== cat.id));
    showToast("Category deleted ✓");
  }

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div style={{fontFamily:"Tahoma,sans-serif",fontSize:18,fontWeight:800,marginBottom:20}}>Manage Categories</div>
        <div className="type-toggle" style={{marginBottom:16}}>
          {["income","expense"].map(t=>(
            <button key={t} className={`type-btn ${t} ${type===t?"active":""}`} onClick={()=>{setType(t);setEditingId(null);setError("");}}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <input className="input" placeholder="New category name" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdd()}/>
          <button className="btn btn-primary" style={{flexShrink:0}} onClick={handleAdd} disabled={busy}>+ Add</button>
        </div>
        {error&&<div style={{color:"#f25f4c",fontSize:12,textAlign:"center",marginBottom:10}}>{error}</div>}
        <div style={{maxHeight:300,overflowY:"auto"}}>
          {customs.map(cat=>(
            <div key={cat.id} className="row-item">
              {editingId===cat.id ? (
                <>
                  <input className="input" style={{flex:1,minWidth:0}} value={editName} onChange={e=>setEditName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleRename(cat)} autoFocus/>
                  <button className="btn-edit btn" onClick={()=>handleRename(cat)} disabled={busy}>✓</button>
                  <button className="btn-edit btn" onClick={()=>{setEditingId(null);setError("");}}>✕</button>
                </>
              ) : (
                <>
                  <div style={{flex:1,fontSize:13,minWidth:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{cat.name}</div>
                  {inUse(cat.name)&&<span style={{fontSize:10,color:"#ff8906",flexShrink:0}}>in use</span>}
                  <button className="btn-edit btn" onClick={()=>{setEditingId(cat.id);setEditName(cat.name);setError("");}}>✎</button>
                  <button className="btn-danger btn" onClick={()=>handleDelete(cat)} disabled={busy} style={{opacity:inUse(cat.name)?0.4:1}}>✕</button>
                </>
              )}
            </div>
          ))}
          {customs.length===0&&<div style={{textAlign:"center",color:"#a7a9be",padding:"14px 0",fontSize:12}}>No {type} categories yet</div>}
        </div>
        <div style={{display:"flex",marginTop:20}}>
          <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──
export default function App() {
  const [session, setSession] = useState(null);
  const [authView, setAuthView] = useState("loading");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === "PASSWORD_RECOVERY") {
        setAuthView("recovery");
      } else if (event === "INITIAL_SESSION") {
        setAuthView(session ? null : "login");
      } else if (event === "SIGNED_IN") {
        setAuthView(prev => prev === "recovery" ? "recovery" : null);
      } else if (event === "SIGNED_OUT") {
        setAuthView("login");
      }
      // USER_UPDATED: setSession(session) above already refreshes the display name
    });
    return () => subscription.unsubscribe();
  }, []);

  if (authView === "loading") return (
    <div style={{minHeight:"100vh",background:"#0f0e17",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Mono','Courier New',monospace",color:"#a7a9be",fontSize:13}}>
      Loading...
    </div>
  );
  if (authView === "login")  return <LoginScreen  onSwitch={setAuthView}/>;
  if (authView === "signup") return <SignupScreen  onSwitch={setAuthView}/>;
  if (authView === "forgot") return <ForgotPasswordScreen onSwitch={setAuthView}/>;
  if (!session) return <LoginScreen onSwitch={setAuthView}/>;

  if (authView === "recovery") return (
    <AuthShell subtitle="Set your new password">
      <div style={{background:"#1a1929",border:"1px solid #2e2d3d",borderRadius:16,padding:28}}>
        <ResetPasswordForm onDone={() => setAuthView(null)} />
      </div>
    </AuthShell>
  );

  return (
    <Dashboard
      session={session}
      onLogout={() => supabase.auth.signOut()}
    />
  );
}

// ── Dashboard ──
function Dashboard({ session, onLogout }) {
  const [transactions, setTransactions]         = useState([]);
  const [selectedMonth, setSelectedMonth]       = useState(now.getMonth());
  const [selectedYear, setSelectedYear]         = useState(now.getFullYear());
  const [currency, setCurrency]                 = useState("USD");
  const [showForm, setShowForm]                 = useState(false);
  const [showChangePw, setShowChangePw]         = useState(false);
  const [showProfile, setShowProfile]           = useState(false);
  const [showCatManager, setShowCatManager]     = useState(false);
  const [customCats, setCustomCats]             = useState([]);
  const [activeTab, setActiveTab]               = useState("dashboard");
  const [form, setForm] = useState({ type:"income", category:"", amount:"", note:"", date:now.toISOString().split("T")[0] });
  const [editId, setEditId]                     = useState(null);
  const [page, setPage]                         = useState(1);
  const [syncStatus, setSyncStatus]             = useState("loading");
  const [toast, setToast]                       = useState(null);
  const [showMigrationBanner, setShowMigrationBanner] = useState(false);
  const [showUserMenu, setShowUserMenu]         = useState(false);

  const fmt = n => currency === "USD" ? fmtUSD(n) : fmtKHR(n);
  const showToast = (msg, color="#2cb67d") => { setToast({msg,color}); setTimeout(()=>setToast(null),3000); };

  useEffect(() => {
    (async () => {
      setSyncStatus("loading");
      const [txRes, catRes] = await Promise.all([
        supabase.from("transactions").select("*").eq("user_id", session.user.id).order("date", { ascending: false }),
        supabase.from("categories").select("*").eq("user_id", session.user.id).order("name"),
      ]);
      if (txRes.error) { setSyncStatus("error"); showToast("Failed to load transactions", "#f25f4c"); return; }
      if (!catRes.error) {
        let rows = catRes.data || [];
        // First load for this user (incl. new signups): seed the default categories
        if (rows.length === 0) {
          const seed = [
            ...CATEGORIES.income.map(name  => ({ user_id: session.user.id, type: "income",  name })),
            ...CATEGORIES.expense.map(name => ({ user_id: session.user.id, type: "expense", name })),
          ];
          const { data: seeded } = await supabase.from("categories").insert(seed).select();
          rows = (seeded || []).sort((a,b) => a.name.localeCompare(b.name));
        }
        setCustomCats(rows);
      }
      const txns = txRes.data || [];
      setTransactions(txns);
      setSyncStatus("synced");
      if (txns.length === 0) setShowMigrationBanner(true);
    })();
  }, []);

  useEffect(() => { setPage(1); }, [selectedMonth, selectedYear]);

  // This user's categories (defaults are seeded per-user on first load).
  // Falls back to the built-in list until the fetch/seed completes.
  const cats = customCats.length ? {
    income:  customCats.filter(c=>c.type==="income").map(c=>c.name),
    expense: customCats.filter(c=>c.type==="expense").map(c=>c.name),
  } : CATEGORIES;

  // ── Monthly ──
  const filtered = transactions.filter(t => { const d=new Date(t.date); return d.getMonth()===selectedMonth&&d.getFullYear()===selectedYear; });
  const totalIncome  = filtered.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0);
  const totalExpense = filtered.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0);
  const balance = totalIncome-totalExpense;
  const TX_PER_PAGE = 10;
  const totalTxPages = Math.max(1, Math.ceil(filtered.length / TX_PER_PAGE));
  const txPage = Math.min(page, totalTxPages);
  const catTotals = cats.expense.map(cat=>({cat,total:filtered.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+Number(t.amount),0)})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);

  // ── Yearly ──
  const yTx = transactions.filter(t=>new Date(t.date).getFullYear()===selectedYear);
  const yInc = yTx.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0);
  const yExp = yTx.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0);
  const yBal = yInc-yExp;
  const mData = MONTHS.map((m,i)=>{ const mx=yTx.filter(t=>new Date(t.date).getMonth()===i); const inc=mx.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0); const exp=mx.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0); return {month:m,income:inc,expense:exp,balance:inc-exp,count:mx.length}; });
  const maxBar = Math.max(...mData.map(m=>Math.max(m.income,m.expense)),1);
  const activeMo = mData.filter(m=>m.income>0||m.expense>0);
  const bestMo  = activeMo.length ? activeMo.reduce((a,b)=>b.balance>a.balance?b:a,activeMo[0]) : null;
  const worstMo = activeMo.length ? activeMo.reduce((a,b)=>b.balance<a.balance?b:a,activeMo[0]) : null;

  async function handleSubmit() {
    if (!form.category) { showToast("Please select a category","#f25f4c"); return; }
    if (!form.amount)   { showToast("Please enter an amount","#f25f4c");  return; }
    if (!form.date)     { showToast("Please pick a date","#f25f4c");      return; }
    const id = editId;
    setSyncStatus("saving");
    if (id) {
      const { error } = await supabase.from("transactions")
        .update({ type:form.type, category:form.category, amount:parseFloat(form.amount), note:form.note||"", date:form.date })
        .eq("id", id);
      if (error) { showToast("Failed to save","#f25f4c"); setSyncStatus("error"); return; }
      setTransactions(p=>p.map(t=>t.id===id?{...t,type:form.type,category:form.category,amount:parseFloat(form.amount),note:form.note||"",date:form.date}:t));
      setEditId(null);
    } else {
      const { data, error } = await supabase.from("transactions")
        .insert({ user_id:session.user.id, type:form.type, category:form.category, amount:parseFloat(form.amount), note:form.note||"", date:form.date })
        .select().single();
      if (error) { showToast("Failed to add","#f25f4c"); setSyncStatus("error"); return; }
      setTransactions(p=>[data,...p]);
      setShowMigrationBanner(false);
    }
    setForm({type:"income",category:"",amount:"",note:"",date:now.toISOString().split("T")[0]});
    setShowForm(false);
    showToast(id?"Updated ✓":"Added ✓");
    setSyncStatus("synced");
  }

  function handleEdit(t) {
    setForm({type:t.type,category:t.category,amount:String(t.amount),note:t.note||"",date:t.date});
    setEditId(t.id); setShowForm(true); setActiveTab("dashboard");
  }

  async function handleDelete(id) {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) { showToast("Failed to delete","#f25f4c"); return; }
    setTransactions(p=>p.filter(t=>t.id!==id));
    showToast("Deleted ✓");
  }

  function exportCSV() {
    const h="Date,Type,Category,Amount (USD),Note";
    const rows=[...transactions].sort((a,b)=>new Date(a.date)-new Date(b.date)).map(t=>`${t.date},${t.type},${t.category},${t.amount},"${(t.note||"").replace(/"/g,'""')}"`);
    const blob=new Blob([[h,...rows].join("\n")],{type:"text/csv"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`finance_${selectedYear}.csv`; a.click(); URL.revokeObjectURL(url);
    showToast("CSV exported ✓");
  }

  async function importCSV(e) {
    const file=e.target.files[0]; if(!file)return;
    const r=new FileReader(); r.onload=async ev=>{
      try {
        const lines=ev.target.result.split("\n").slice(1).filter(l=>l.trim());
        const imp=lines.map(line=>{
          const cols=[]; let cur="",inQ=false;
          for(let i=0;i<line.length;i++){if(line[i]==='"'){inQ=!inQ;continue;}if(line[i]===','&&!inQ){cols.push(cur);cur="";continue;}cur+=line[i];}
          cols.push(cur);
          const[date,type,category,amount,note]=cols.map(s=>s.trim());
          return{date,type,category,amount:parseFloat(amount)||0,note:note||""};
        }).filter(t=>t.date&&t.type&&t.category);
        if(imp.length===0){showToast("No valid rows found","#f25f4c");return;}
        const existing=new Set(transactions.map(t=>`${t.date}|${t.type}|${t.category}|${t.amount}`));
        const newRows=imp.filter(t=>!existing.has(`${t.date}|${t.type}|${t.category}|${t.amount}`)).map(t=>({...t,user_id:session.user.id}));
        if(newRows.length===0){showToast("All rows already imported","#ff8906");return;}
        setSyncStatus("saving");
        const { data, error }=await supabase.from("transactions").insert(newRows).select();
        if(error){showToast("Import failed","#f25f4c");setSyncStatus("error");return;}
        setTransactions(p=>[...data,...p].sort((a,b)=>new Date(b.date)-new Date(a.date)));
        setShowMigrationBanner(false);
        showToast(`Imported ${data.length} transactions ✓`);
        setSyncStatus("synced");
      } catch(_){showToast("Import failed","#f25f4c");}
    }; r.readAsText(file); e.target.value="";
  }

  const syncMap = {
    loading: { label:"Loading...", color:"#ff8906" },
    saving:  { label:"Saving...", color:"#ff8906" },
    synced:  { label:`☁ Synced · ${transactions.length} transactions`, color:"#2cb67d" },
    error:   { label:"Error — try again", color:"#f25f4c" },
  };
  const st = syncMap[syncStatus] || syncMap.synced;
  const tabs = [{id:"dashboard",label:"Overview"},{id:"report",label:"Monthly"},{id:"yearly",label:"Yearly"},{id:"all",label:"History"}];
  const displayName = getDisplayName(session);
  const menuItem = {display:"block",width:"100%",textAlign:"left",padding:"10px 14px",fontSize:12,color:"#fffffe",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",boxSizing:"border-box"};

  return (
    <div style={{minHeight:"100vh",background:"#0f0e17",fontFamily:"'DM Mono','Courier New',monospace",color:"#fffffe",overflowX:"hidden",width:"100%",maxWidth:"100vw",position:"relative"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
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
        input[type=date].input{text-align:left;display:block}
        input[type=date].input::-webkit-date-and-time-value{text-align:left;margin:0}
        input[type=date].input::-webkit-datetime-edit{text-align:left;padding:0}
        .tab{cursor:pointer;padding:8px 14px;border-radius:6px;font-size:12px;color:#a7a9be;transition:all .15s;border:none;background:transparent;font-family:inherit;white-space:nowrap}
        .tab.active{background:#ff8906;color:#0f0e17;font-weight:500}
        .bar-fill{border-radius:4px;transition:width .5s}
        .tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px}
        .tag-income{background:#2cb67d22;color:#2cb67d}.tag-expense{background:#f25f4c22;color:#f25f4c}
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
        .modal{background:#1a1929;border:1px solid #2e2d3d;border-radius:16px;padding:28px;width:calc(100vw - 32px);max-width:440px;max-height:90vh;overflow-y:auto;overflow-x:hidden;box-sizing:border-box}
        .modal *{box-sizing:border-box;max-width:100%}
        .type-toggle{display:flex;background:#12111f;border-radius:8px;padding:4px;gap:4px}
        .type-btn{flex:1;padding:8px;border-radius:6px;border:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:500;transition:all .15s;min-width:0;box-sizing:border-box}
        .type-btn.income.active{background:#2cb67d;color:#fff}.type-btn.expense.active{background:#f25f4c;color:#fff}
        .type-btn:not(.active){background:transparent;color:#a7a9be}
        .stat-value{font-family:Tahoma,sans-serif;font-weight:800}
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
        .header-title{font-family:Tahoma,sans-serif;font-size:clamp(16px,4.5vw,20px);font-weight:800;color:#ff8906}
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
          .row-amount{min-width:0!important;flex-shrink:0;font-size:12px!important}
          .row-item{gap:6px;padding:10px 0}
          .currency-full{display:none}
          .currency-short{display:inline}
          .btn-add{padding:6px 10px!important;font-size:12px!important}
          .btn-danger{width:28px!important;height:28px!important;padding:0!important;display:flex!important;align-items:center;justify-content:center;flex-shrink:0}
          .btn-edit{width:28px!important;height:28px!important;padding:0!important;display:flex!important;align-items:center;justify-content:center;flex-shrink:0}
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
            <div style={{position:"relative"}}>
              <button className="btn btn-ghost" style={{padding:"6px 12px",fontSize:12,display:"flex",alignItems:"center",gap:6,maxWidth:160}} onClick={()=>setShowUserMenu(v=>!v)}>
                <span style={{color:"#fffffe",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{displayName}</span>
                <span style={{fontSize:9,transform:showUserMenu?"rotate(180deg)":"none",transition:"transform .15s"}}>▼</span>
              </button>
              {showUserMenu && <>
                <div style={{position:"fixed",inset:0,zIndex:40}} onClick={()=>setShowUserMenu(false)}/>
                <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",zIndex:41,background:"#1a1929",border:"1px solid #2e2d3d",borderRadius:10,minWidth:170,overflow:"hidden",boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
                  <button onClick={()=>{setShowUserMenu(false);setShowProfile(true);}} style={menuItem}>👤 Profile</button>
                  <button onClick={()=>{setShowUserMenu(false);setShowCatManager(true);}} style={menuItem}>⚙ Categories</button>
                  <div style={{height:1,background:"#2e2d3d"}}/>
                  <button onClick={()=>{setShowUserMenu(false);exportCSV();}} style={menuItem}>↓ Export CSV</button>
                  <label style={menuItem}>
                    ↑ Import CSV
                    <input type="file" accept=".csv" style={{display:"none"}} onChange={e=>{setShowUserMenu(false);importCSV(e);}}/>
                  </label>
                  <div style={{height:1,background:"#2e2d3d"}}/>
                  <button onClick={()=>{setShowUserMenu(false);onLogout();}} style={{...menuItem,color:"#f25f4c"}}>Sign out</button>
                </div>
              </>}
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
      </div>

      {/* Nav */}
      <div className="nav-wrap">
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button className="nav-btn" onClick={()=>{ if(activeTab==="yearly"){setSelectedYear(y=>y-1);return;} if(selectedMonth===0){setSelectedMonth(11);setSelectedYear(y=>y-1);}else setSelectedMonth(m=>m-1); }}>‹</button>
          <span style={{fontFamily:"Tahoma,sans-serif",fontWeight:700,fontSize:15,flex:1,textAlign:"center"}}>
            {activeTab==="yearly"?`Annual Report ${selectedYear}`:`${MONTHS_FULL[selectedMonth]} ${selectedYear}`}
          </span>
          <button className="nav-btn" onClick={()=>{ if(activeTab==="yearly"){setSelectedYear(y=>y+1);return;} if(selectedMonth===11){setSelectedMonth(0);setSelectedYear(y=>y+1);}else setSelectedMonth(m=>m+1); }}>›</button>
        </div>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          {tabs.map(t=><button key={t.id} className={`tab ${activeTab===t.id?"active":""}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>)}
        </div>
      </div>

      <div className="content-wrap">

        {/* Migration banner */}
        {showMigrationBanner&&(
          <div style={{background:"#ff890615",border:"1px solid #ff890640",borderRadius:12,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div style={{fontSize:13,color:"#fffffe",flex:1}}>Welcome! Import your existing data to get started.</div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
              <div className="import-wrap" style={{flex:"none"}}>
                <button className="btn btn-primary" style={{padding:"8px 16px",fontSize:12}}>Import CSV</button>
                <input type="file" accept=".csv" onChange={importCSV}/>
              </div>
              <button onClick={()=>setShowMigrationBanner(false)} style={{background:"none",border:"none",color:"#a7a9be",cursor:"pointer",fontSize:20,lineHeight:1,padding:"0 4px"}}>×</button>
            </div>
          </div>
        )}

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
              <div style={{fontSize:12,color:"#a7a9be",marginBottom:14,textTransform:"uppercase",letterSpacing:1}}>
                Recent{filtered.length>TX_PER_PAGE&&<span style={{textTransform:"none",letterSpacing:0}}> · page {txPage} of {totalTxPages}</span>}
              </div>
              {filtered.length===0?<div style={{textAlign:"center",color:"#a7a9be",padding:"24px 0",fontSize:13}}>No transactions this month</div>
                :<>
                  {filtered.slice((txPage-1)*TX_PER_PAGE, txPage*TX_PER_PAGE).map(t=>(
                    <div key={t.id} className="row-item">
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:10,color:"#a7a9be",marginBottom:2,whiteSpace:"nowrap"}}>{fmtDateTime(t)}</div>
                        <div style={{fontSize:13,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.category}</div>
                        {t.note&&<div style={{fontSize:11,color:"#a7a9be"}}>{t.note}</div>}
                      </div>
                      <span className={`tag tag-${t.type} row-tag`}>{t.type}</span>
                      <div className="row-amount" style={{fontWeight:500,color:t.type==="income"?"#2cb67d":"#f25f4c",fontSize:12,minWidth:70,textAlign:"right"}}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</div>
                      <button className="btn-edit btn" onClick={()=>handleEdit(t)}>✎</button>
                      <button className="btn-danger btn" onClick={()=>handleDelete(t.id)}>✕</button>
                    </div>
                  ))}
                  {totalTxPages>1&&(
                    <div style={{display:"flex",gap:6,justifyContent:"center",alignItems:"center",marginTop:14,flexWrap:"wrap"}}>
                      <button className="nav-btn" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={txPage===1} style={{opacity:txPage===1?0.4:1}}>‹</button>
                      {Array.from({length:totalTxPages},(_,i)=>i+1).map(n=>(
                        <button key={n} className={`tab ${txPage===n?"active":""}`} style={{padding:"6px 12px"}} onClick={()=>setPage(n)}>{n}</button>
                      ))}
                      <button className="nav-btn" onClick={()=>setPage(p=>Math.min(totalTxPages,p+1))} disabled={txPage===totalTxPages} style={{opacity:txPage===totalTxPages?0.4:1}}>›</button>
                    </div>
                  )}
                </>}
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
              {cats.income.map(cat=>{ const total=filtered.filter(t=>t.type==="income"&&t.category===cat).reduce((s,t)=>s+Number(t.amount),0); if(!total)return null; return <div key={cat} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #1e1d2e",fontSize:13}}><span>{cat}</span><span style={{color:"#2cb67d",fontWeight:500}}>{fmt(total)}</span></div>; })}
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
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:10,color:"#a7a9be",marginBottom:2,whiteSpace:"nowrap"}}>{fmtDateTime(t)}</div>
                    <div style={{fontSize:13,fontWeight:500}}>{t.category}</div>
                    {t.note&&<div style={{fontSize:11,color:"#a7a9be"}}>{t.note}</div>}
                  </div>
                  <span className={`tag tag-${t.type} row-tag`}>{t.type}</span>
                  <div className="row-amount" style={{fontWeight:500,color:t.type==="income"?"#2cb67d":"#f25f4c",fontSize:12,minWidth:70,textAlign:"right"}}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</div>
                  <button className="btn-edit btn" onClick={()=>handleEdit(t)}>✎</button>
                  <button className="btn-danger btn" onClick={()=>handleDelete(t.id)}>✕</button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Add / Edit Transaction Modal */}
      {showForm&&(
        <div className="overlay" onClick={e=>e.target===e.currentTarget&&setShowForm(false)}>
          <div className="modal">
            <div style={{fontFamily:"Tahoma,sans-serif",fontSize:18,fontWeight:800,marginBottom:20}}>{editId?"Edit Transaction":"New Transaction"}</div>
            <div className="type-toggle" style={{marginBottom:editId?6:16,opacity:editId?0.55:1}}>
              {["income","expense"].map(type=>(<button key={type} disabled={!!editId} className={`type-btn ${type} ${form.type===type?"active":""}`} style={editId?{cursor:"not-allowed"}:undefined} onClick={()=>setForm(f=>({...f,type,category:cats[type].includes(f.category)?f.category:""}))}>
                {type.charAt(0).toUpperCase()+type.slice(1)}
              </button>))}
            </div>
            {editId&&<div style={{fontSize:10,color:"#a7a9be",marginBottom:16,paddingLeft:2}}>Type can't be changed when editing — delete and re-add to switch.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <label style={{fontSize:11,color:"#a7a9be",paddingLeft:2}}>Category</label>
                <select className="input" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                  <option value="">Select category</option>
                  {cats[form.type].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <label style={{fontSize:11,color:"#a7a9be",paddingLeft:2}}>Amount (USD)</label>
                <input className="input" type="number" min="0" step="0.01" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <label style={{fontSize:11,color:"#a7a9be",paddingLeft:2}}>Date</label>
                <input className="input" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{textAlign:"left",width:"100%",maxWidth:"100%",boxSizing:"border-box"}}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <label style={{fontSize:11,color:"#a7a9be",paddingLeft:2}}>Note <span style={{opacity:0.5}}>(optional)</span></label>
                <input className="input" type="text" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>
              </div>
            </div>
            <div style={{display:"flex",gap:10,marginTop:20}}>
              <button className="btn btn-ghost" style={{flex:1,minWidth:0}} onClick={()=>{setShowForm(false);setEditId(null);}}>Cancel</button>
              <button className="btn btn-primary" style={{flex:2,minWidth:0}} onClick={handleSubmit}>{editId?"Save Changes":"Add Transaction"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showChangePw&&(
        <ChangePasswordModal
          onDone={()=>{ setShowChangePw(false); showToast("Password updated ✓"); }}
          onClose={()=>setShowChangePw(false)}
        />
      )}

      {/* Category Manager Modal */}
      {showCatManager&&(
        <CategoryManagerModal
          session={session}
          customCats={customCats}
          setCustomCats={setCustomCats}
          transactions={transactions}
          setTransactions={setTransactions}
          showToast={showToast}
          onClose={()=>setShowCatManager(false)}
        />
      )}

      {/* User Profile Modal */}
      {showProfile&&(
        <UserProfileModal
          session={session}
          onClose={()=>setShowProfile(false)}
          showToast={showToast}
        />
      )}
    </div>
  );
}
