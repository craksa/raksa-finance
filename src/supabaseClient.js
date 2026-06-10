import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  document.body.innerHTML = '<div style="min-height:100vh;background:#0f0e17;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#f25f4c;text-align:center;padding:20px"><div><div style="font-size:18px;margin-bottom:12px">Configuration Error</div><div style="font-size:13px;color:#a7a9be">Missing Supabase environment variables.<br/>Check your .env file or GitHub secrets.</div></div></div>';
  throw new Error("Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
