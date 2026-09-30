import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Service-role client: bypasses RLS. Server-only (cron, public OG metadata).
// Returns null when the key is not configured, so callers can degrade gracefully.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
