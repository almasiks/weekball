import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DAYS_AHEAD = 14;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Daily Vercel Cron: make sure every active schedule has games for the next 2 weeks.
// Idempotent — unique (schedule_id, starts_at) prevents duplicates.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured" },
      { status: 500 },
    );
  }

  const { data, error } = await admin.rpc("create_upcoming_games", {
    days_ahead: DAYS_AHEAD,
  });
  if (error) {
    console.error("create_upcoming_games failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ created: data ?? 0, daysAhead: DAYS_AHEAD });
}
