import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

// Tables owned per-user (user_id column). Used for export + delete.
const USER_TABLES = ["transactions", "categories", "shop_products", "shop_sales", "shop_restock", "shop_categories"];

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function tableToCsv(rows) {
  if (!rows || rows.length === 0) return "(no rows)\n";
  const cols = Object.keys(rows[0]);
  const head = cols.join(",");
  const body = rows.map(r => cols.map(c => csvCell(r[c])).join(",")).join("\n");
  return `${head}\n${body}\n`;
}

export default function AdminApp({ session, profile, onBack }) {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState(null);
  const [busy, setBusy]       = useState(false);

  // Delete flow
  const [delTarget, setDelTarget] = useState(null);
  const [delPwd, setDelPwd]       = useState("");
  const [delConfirm, setDelConfirm] = useState("");

  const meId    = session.user.id;
  const meEmail = session.user.email;
  const isAdmin = profile?.role === "admin";

  const showToast = (msg, color = "#2cb67d") => { setToast({ msg, color }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id,username,email,role,can_finance,can_shop,disabled,created_at")
      .order("created_at", { ascending: true });
    if (error) showToast("Could not load users — check the admin SQL ran", "#f25f4c");
    else setUsers(data || []);
    setLoading(false);
  }

  // ── Toggle a flag (auto-save) ──
  async function setFlag(u, field, value) {
    setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, [field]: value } : x)); // optimistic
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("user_id", u.user_id);
    if (error) {
      setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, [field]: !value } : x)); // revert
      showToast("Failed to save change", "#f25f4c");
    } else {
      showToast(`${u.username || u.email}: ${labelFor(field)} ${value ? "on" : "off"} ✓`);
    }
  }
  function setRole(u, role) {
    setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, role } : x));
    supabase.from("profiles").update({ role }).eq("user_id", u.user_id).then(({ error }) => {
      if (error) { setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, role: u.role } : x)); showToast("Failed to change role", "#f25f4c"); }
      else showToast(`${u.username || u.email} is now ${role === "admin" ? "an admin" : "a user"} ✓`);
    });
  }
  const labelFor = f => f === "can_finance" ? "Finance" : f === "can_shop" ? "Shop" : f === "disabled" ? "Disabled" : f;

  // ── Build a single CSV string with all of a user's data ──
  async function buildExport(u) {
    const parts = [`# raksa-finance export`, `# user: ${u.username || ""} <${u.email}>`, `# user_id: ${u.user_id}`, `# exported: ${new Date().toISOString()}`, ``];
    for (const t of USER_TABLES) {
      const { data, error } = await supabase.from(t).select("*").eq("user_id", u.user_id).order("created_at", { ascending: true });
      parts.push(`# table: ${t}${error ? " (read error)" : ` (${(data || []).length} rows)`}`);
      parts.push(error ? `(error: ${error.message})\n` : tableToCsv(data));
    }
    return parts.join("\n");
  }
  function downloadCsv(text, filename) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function openDelete(u) { setDelTarget(u); setDelPwd(""); setDelConfirm(""); }

  async function confirmDelete() {
    const u = delTarget;
    if (!u) return;
    if ((delConfirm || "").trim().toLowerCase() !== (u.username || u.email).toLowerCase()) {
      showToast("Type the exact username/email to confirm", "#f25f4c"); return;
    }
    if (!delPwd) { showToast("Enter your password", "#f25f4c"); return; }
    setBusy(true);

    // 1. Re-verify the admin's own password.
    const { error: pwErr } = await supabase.auth.signInWithPassword({ email: meEmail, password: delPwd });
    if (pwErr) { setBusy(false); showToast("Wrong password", "#f25f4c"); return; }

    // 2. Export all the user's data → download a local copy first (always).
    let csv = "";
    try { csv = await buildExport(u); downloadCsv(csv, `deleted-${(u.username || u.email).replace(/[^a-z0-9]/gi, "_")}-${new Date().toISOString().slice(0, 10)}.csv`); }
    catch (e) { setBusy(false); showToast("Export failed — aborting delete", "#f25f4c"); return; }

    // 3. Try the server-side function (emails the CSV + removes the auth account).
    let serverDone = false;
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", { body: { user_id: u.user_id, csv } });
      if (!error && data && data.ok) serverDone = true;
    } catch (_) { /* function not deployed yet — fall back below */ }

    if (serverDone) {
      setUsers(prev => prev.filter(x => x.user_id !== u.user_id));
      showToast(`Deleted ${u.username || u.email} · CSV emailed ✓`);
    } else {
      // 4. Fallback: wipe data + lock the account (auth login record stays, but blocked).
      for (const t of USER_TABLES) await supabase.from(t).delete().eq("user_id", u.user_id);
      await supabase.from("profiles").update({ disabled: true, can_finance: false, can_shop: false, role: "user" }).eq("user_id", u.user_id);
      setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, disabled: true, can_finance: false, can_shop: false, role: "user" } : x));
      showToast("CSV downloaded · data wiped · account locked (deploy email function for full deletion)", "#ff8906");
    }
    setBusy(false);
    setDelTarget(null);
  }

  if (!isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f0e17", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono',monospace", textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⛔</div>
        <div style={{ fontSize: 16, color: "#f25f4c", marginBottom: 8 }}>Admins only</div>
        <button onClick={onBack} style={{ padding: "10px 20px", background: "transparent", color: "#ff8906", border: "1px solid #ff8906", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>← Back</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0e17", fontFamily: "'DM Mono','Courier New',monospace", color: "#fffffe", overflowX: "hidden", maxWidth: "100vw" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .ad-btn{cursor:pointer;border:none;border-radius:6px;font-family:inherit;font-size:13px;font-weight:500;padding:8px 14px;transition:all .15s}
        .ad-ghost{background:transparent;color:#a7a9be;border:1px solid #2e2d3d}.ad-ghost:hover{border-color:#ff8906;color:#ff8906}
        .ad-card{background:#1a1929;border:1px solid #2e2d3d;border-radius:12px;padding:14px 16px;margin-bottom:10px}
        .ad-inp{background:#12111f;border:1px solid #2e2d3d;border-radius:6px;color:#fffffe;font-family:inherit;font-size:13px;padding:10px 14px;width:100%;outline:none}
        .ad-inp:focus{border-color:#ff8906}
        .ad-overlay{position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px}
        .ad-modal{background:#1a1929;border:1px solid #2e2d3d;border-radius:16px;padding:24px;width:calc(100vw - 32px);max-width:440px;max-height:92vh;overflow-y:auto}
        .ad-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);padding:10px 22px;border-radius:8px;font-size:12px;font-weight:500;z-index:200;max-width:90vw;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.4)}
        .ad-lbl{font-size:11px;color:#a7a9be;display:block;margin-bottom:4px}
        .ad-switch{display:flex;align-items:center;gap:7px;cursor:pointer;font-size:12px;user-select:none}
        .ad-track{width:34px;height:20px;border-radius:10px;position:relative;transition:background .15s;flex-shrink:0}
        .ad-knob{position:absolute;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}
        @media(max-width:480px){ .ad-modal{border-radius:20px 20px 0 0;max-width:100%;width:100%} .ad-overlay{align-items:flex-end;padding:0} }
      `}</style>

      {toast && <div className="ad-toast" style={{ background: toast.color, color: "#fff" }}>{toast.msg}</div>}

      <div style={{ background: "#12111f", borderBottom: "1px solid #2e2d3d", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "Tahoma,sans-serif", fontSize: "clamp(15px,4vw,20px)", fontWeight: 800, color: "#ff8906" }}>User Management</div>
          <div style={{ fontSize: 10, color: "#a7a9be", marginTop: 2 }}>{users.length} user{users.length !== 1 ? "s" : ""} · គ្រប់គ្រងអ្នកប្រើ</div>
        </div>
        <button className="ad-btn ad-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={onBack}>← Finance</button>
      </div>

      <div style={{ padding: "16px 20px 100px", maxWidth: 720, margin: "0 auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 50, color: "#a7a9be", fontSize: 13 }}>Loading...</div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#a7a9be", fontSize: 13 }}>No users found.</div>
        ) : users.map(u => {
          const self = u.user_id === meId;
          return (
            <div key={u.user_id} className="ad-card" style={{ borderLeft: u.disabled ? "3px solid #f25f4c" : u.role === "admin" ? "3px solid #ff8906" : "3px solid transparent" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {u.username || "(no username)"}
                    {u.role === "admin" && <span style={{ fontSize: 9, background: "#ff890622", color: "#ff8906", padding: "2px 6px", borderRadius: 4 }}>ADMIN</span>}
                    {self && <span style={{ fontSize: 9, color: "#a7a9be" }}>(you)</span>}
                    {u.disabled && <span style={{ fontSize: 9, background: "#f25f4c22", color: "#f25f4c", padding: "2px 6px", borderRadius: 4 }}>DISABLED</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#a7a9be", overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</div>
                </div>
                {!self && (
                  <button className="ad-btn" style={{ background: "transparent", color: "#f25f4c", border: "1px solid #f25f4c44", fontSize: 11, padding: "5px 10px" }} onClick={() => openDelete(u)}>Delete</button>
                )}
              </div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                <Switch label="Finance" on={u.can_finance} color="#2cb67d" onClick={() => setFlag(u, "can_finance", !u.can_finance)} />
                <Switch label="Shop"    on={u.can_shop}    color="#2cb67d" onClick={() => setFlag(u, "can_shop", !u.can_shop)} />
                <Switch label="Admin"   on={u.role === "admin"} color="#ff8906" disabled={self} onClick={() => setRole(u, u.role === "admin" ? "user" : "admin")} />
                <Switch label="Disabled" on={u.disabled} color="#f25f4c" disabled={self} onClick={() => setFlag(u, "disabled", !u.disabled)} />
              </div>
            </div>
          );
        })}

        <div style={{ fontSize: 11, color: "#a7a9be", marginTop: 14, lineHeight: 1.6 }}>
          New people sign up themselves and appear here with Finance access. Flip <b style={{ color: "#2cb67d" }}>Shop</b> on to grant the shop, <b style={{ color: "#f25f4c" }}>Disabled</b> to lock an account out instantly, or <b style={{ color: "#f25f4c" }}>Delete</b> to export + remove a user.
        </div>
      </div>

      {/* ══ DELETE MODAL ══ */}
      {delTarget && (
        <div className="ad-overlay">
          <div className="ad-modal">
            <div style={{ fontFamily: "Tahoma,sans-serif", fontWeight: 800, fontSize: 16, marginBottom: 8, color: "#f25f4c" }}>Delete user</div>
            <div style={{ fontSize: 12, color: "#a7a9be", marginBottom: 16, lineHeight: 1.6 }}>
              This exports <b style={{ color: "#fffffe" }}>{delTarget.username || delTarget.email}</b>'s data to a CSV (downloaded, and emailed to you if the server function is set up), then permanently removes the user and all their finance + shop data. This cannot be undone.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="ad-lbl">Type the username to confirm: <b style={{ color: "#fffffe" }}>{delTarget.username || delTarget.email}</b></label>
                <input className="ad-inp" value={delConfirm} onChange={e => setDelConfirm(e.target.value)} placeholder={delTarget.username || delTarget.email} autoComplete="off" />
              </div>
              <div>
                <label className="ad-lbl">Your password</label>
                <input className="ad-inp" type="password" value={delPwd} onChange={e => setDelPwd(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="ad-btn ad-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => setDelTarget(null)}>Cancel</button>
              <button className="ad-btn" style={{ flex: 2, background: "#f25f4c", color: "#fff", opacity: busy ? .6 : 1 }} disabled={busy} onClick={confirmDelete}>
                {busy ? "Working…" : "Export & Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Switch({ label, on, color, onClick, disabled }) {
  return (
    <div className="ad-switch" style={{ opacity: disabled ? .45 : 1, cursor: disabled ? "not-allowed" : "pointer" }} onClick={disabled ? undefined : onClick}>
      <div className="ad-track" style={{ background: on ? color : "#2e2d3d" }}>
        <div className="ad-knob" style={{ left: on ? 16 : 2 }} />
      </div>
      <span style={{ color: on ? "#fffffe" : "#a7a9be" }}>{label}</span>
    </div>
  );
}
