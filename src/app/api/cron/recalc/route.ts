import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { recalcGroupRatings } from "@/lib/rating/recalc";
import { createAdminClient } from "@/lib/supabase/admin";

// Daily safety net: groups with finished games whose statistics were never
// processed (e.g. the organizer's phone lost the connection after "Завершить игру").
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  }

  const { data: pending, error } = await admin
    .from("games")
    .select("group_id")
    .eq("status", "finished")
    .is("stats_processed_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groups = [...new Set((pending ?? []).map((g) => g.group_id))];
  const results: Record<string, string> = {};
  for (const groupId of groups) {
    try {
      const r = await recalcGroupRatings(admin, groupId);
      results[groupId] = `ok: ${r.games} games`;
    } catch (e) {
      console.error("recalc failed", groupId, e);
      results[groupId] = "error";
    }
  }
  return NextResponse.json({ groups: groups.length, results });
}
