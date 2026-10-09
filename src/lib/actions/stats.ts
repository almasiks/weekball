"use server";

// Organizer: set a player's all-time totals by hand ("Статистика" -> pencil).
// The database stores the difference to what the matches give (stat_adjustments).
import { revalidatePath } from "next/cache";
import { toMessage } from "@/lib/i18n/server";
import { getAppContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type PlayerTotals = {
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  yellows: number;
  reds: number;
};

export type ActionResult = { error?: string };

function refresh(playerId: string) {
  revalidatePath("/stats");
  revalidatePath(`/players/${playerId}`);
}

export async function setPlayerStatsAction(playerId: string, totals: PlayerTotals): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.group) return { error: await toMessage({ message: "not_authenticated" }) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_player_stats", {
    p_group_id: ctx.group.id,
    p_player_id: playerId,
    p_wins: totals.wins,
    p_draws: totals.draws,
    p_losses: totals.losses,
    p_goals: totals.goals,
    p_assists: totals.assists,
    p_yellows: totals.yellows,
    p_reds: totals.reds,
  });
  if (error) return { error: await toMessage(error) };
  refresh(playerId);
  return {};
}

export async function resetPlayerStatsAction(playerId: string): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.group) return { error: await toMessage({ message: "not_authenticated" }) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_player_stats", { p_group_id: ctx.group.id, p_player_id: playerId });
  if (error) return { error: await toMessage(error) };
  refresh(playerId);
  return {};
}
