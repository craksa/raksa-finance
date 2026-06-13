import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

export default function AdminApp({ session, profile, onBack }) {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState(null);

  const meId    = session.user.id;
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
        .ad-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);padding:10px 22px;border-radius:8px;font-size:12px;font-weight:500;z-index:200;max-width:90vw;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.4)}
        .ad-switch{display:flex;align-items:center;gap:7px;cursor:pointer;font-size:12px;user-select:none}
        .ad-track{width:34px;height:20px;border-radius:10px;position:relative;transition:background .15s;flex-shrink:0}
        .ad-knob{position:absolute;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}
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
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {u.username || "(no username)"}
                  {u.role === "admin" && <span style={{ fontSize: 9, background: "#ff890622", color: "#ff8906", padding: "2px 6px", borderRadius: 4 }}>ADMIN</span>}
                  {self && <span style={{ fontSize: 9, color: "#a7a9be" }}>(you)</span>}
                  {u.disabled && <span style={{ fontSize: 9, background: "#f25f4c22", color: "#f25f4c", padding: "2px 6px", borderRadius: 4 }}>DISABLED</span>}
                </div>
                <div style={{ fontSize: 11, color: "#a7a9be", overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</div>
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
          New people sign up themselves and appear here with Finance access. Flip <b style={{ color: "#2cb67d" }}>Shop</b> on to grant the shop, or <b style={{ color: "#f25f4c" }}>Disabled</b> to lock an account out instantly (reversible). You can't disable or demote your own account.
        </div>
      </div>
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
