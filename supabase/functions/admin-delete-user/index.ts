// admin-delete-user — Supabase Edge Function
//
// Securely deletes a user: verifies the CALLER is an admin, emails their data
// (CSV) to the owner, deletes all their app data, then removes the auth account.
// The service-role key and mail key live ONLY here on the server — never in the
// React app. The app calls this with the admin's own JWT.
//
// ── Deploy ──
//   supabase functions deploy admin-delete-user
// ── Required secrets (Project Settings → Edge Functions → Secrets, or CLI) ──
//   supabase secrets set RESEND_API_KEY=re_xxx        # from https://resend.com
//   supabase secrets set OWNER_EMAIL=raksask90@gmail.com
//   supabase secrets set MAIL_FROM="Raksa Finance <onboarding@resend.dev>"
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const USER_TABLES = ["transactions", "categories", "shop_products", "shop_sales", "shop_restock", "shop_categories"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function tableToCsv(rows: Record<string, unknown>[]): string {
  if (!rows || rows.length === 0) return "(no rows)\n";
  const cols = Object.keys(rows[0]);
  return cols.join(",") + "\n" + rows.map(r => cols.map(c => csvCell(r[c])).join(",")).join("\n") + "\n";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_KEY   = Deno.env.get("RESEND_API_KEY");
    const OWNER_EMAIL  = Deno.env.get("OWNER_EMAIL");
    const MAIL_FROM    = Deno.env.get("MAIL_FROM") || "onboarding@resend.dev";

    // 1. Identify the caller from their JWT.
    const authHeader = req.headers.get("Authorization") || "";
    const caller = createClient(SUPABASE_URL, SERVICE_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) return json({ ok: false, error: "Not authenticated" }, 401);

    // 2. Confirm the caller is an admin (service-role read bypasses RLS).
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: me } = await admin.from("profiles").select("role,disabled").eq("user_id", user.id).maybeSingle();
    if (!me || me.role !== "admin" || me.disabled) return json({ ok: false, error: "Admins only" }, 403);

    const { user_id, csv: csvFromClient } = await req.json();
    if (!user_id) return json({ ok: false, error: "user_id required" }, 400);
    if (user_id === user.id) return json({ ok: false, error: "You cannot delete yourself" }, 400);

    // 3. Fetch the target profile + build the CSV (prefer the app's copy, else rebuild).
    const { data: target } = await admin.from("profiles").select("*").eq("user_id", user_id).maybeSingle();
    let csv = csvFromClient as string | undefined;
    if (!csv) {
      const parts = [`# raksa-finance export`, `# user: ${target?.username || ""} <${target?.email || ""}>`, `# user_id: ${user_id}`, `# exported: ${new Date().toISOString()}`, ``];
      for (const t of USER_TABLES) {
        const { data } = await admin.from(t).select("*").eq("user_id", user_id);
        parts.push(`# table: ${t} (${(data || []).length} rows)`);
        parts.push(tableToCsv((data || []) as Record<string, unknown>[]));
      }
      csv = parts.join("\n");
    }

    // 4. Email the CSV to the owner (best-effort; doesn't block deletion).
    let emailed = false;
    if (RESEND_KEY && OWNER_EMAIL) {
      try {
        const b64 = btoa(unescape(encodeURIComponent(csv)));
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: MAIL_FROM,
            to: [OWNER_EMAIL],
            subject: `Deleted user: ${target?.username || target?.email || user_id}`,
            text: `User ${target?.username || ""} <${target?.email || ""}> was deleted. Their data is attached as CSV.`,
            attachments: [{ filename: `deleted-${(target?.username || user_id)}.csv`, content: b64 }],
          }),
        });
        emailed = res.ok;
      } catch (_) { emailed = false; }
    }

    // 5. Delete all app data, then the auth account.
    for (const t of USER_TABLES) await admin.from(t).delete().eq("user_id", user_id);
    await admin.from("profiles").delete().eq("user_id", user_id);
    const { error: delErr } = await admin.auth.admin.deleteUser(user_id);
    if (delErr) return json({ ok: false, error: `Data wiped but auth delete failed: ${delErr.message}`, emailed }, 500);

    return json({ ok: true, emailed });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
