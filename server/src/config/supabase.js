import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

let adminClient;
export function getSupabaseAdmin() {
  if (adminClient) return adminClient;
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required by the API.");
  }
  adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return adminClient;
}

export async function connectSupabase() {
  const { error } = await getSupabaseAdmin().from("hcm_records").select("id").limit(1);
  if (error) throw new Error(`Could not connect to Supabase: ${error.message}`);
  console.log("Connected to Supabase Postgres.");
  return getSupabaseAdmin();
}

export async function disconnectSupabase() {
  adminClient = undefined;
}
