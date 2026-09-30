import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { recalcGroupRatings } from "@/lib/rating/recalc";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Called by the organizer's UI right after finish_game (and by "Пересчитать").
// Recalculates the ratings of the whole group with the organizer's own session;
// apply_rating_history re-checks the organizer role in the database.
export async function POST(_request: NextRequest, { params }: RouteContext<"/api/games/[id]/finalize">) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: game } = await supabase
    .from("games")
    .select("id, group_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!game) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (game.status !== "finished") {
    return NextResponse.json({ error: "game_not_finished" }, { status: 409 });
  }

  try {
    const result = await recalcGroupRatings(supabase, game.group_id);
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = (e as { message?: string }).message ?? "recalc_failed";
    const status = message.includes("not_organizer") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
