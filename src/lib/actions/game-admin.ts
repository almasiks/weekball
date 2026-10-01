"use server";

// Organizer actions of the game screen: edit, MVP, live link, reset, soft delete.
// Reset and delete are always soft and end with a recalculation of the ratings.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/session";
import { recalcGroupRatings } from "@/lib/rating/recalc";
import { setTeamCountAction } from "@/lib/actions/teams";
import { zonedTimeToUtc } from "@/lib/datetime";
import { errorMessage, toMessage } from "@/lib/errors";
import { readInt, readText, type FormState } from "@/lib/forms";

export type ActionResult = { error?: string };

function revalidateAll() {
  revalidatePath("/", "layout");
}

async function recalc(groupId: string): Promise<string | undefined> {
  try {
    const supabase = await createClient();
    await recalcGroupRatings(supabase, groupId);
  } catch (e) {
    return toMessage(e as { message?: string });
  }
}

export async function updateGameAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gameId = readText(formData, "gameId");
  const timezone = readText(formData, "timezone");
  const title = readText(formData, "title");
  const date = readText(formData, "date");
  const time = readText(formData, "time");
  const place = readText(formData, "place");
  const noLimit = formData.get("noGoalLimit") === "on";
  const goalLimit = readInt(formData, "goalLimit");
  const minutes = readInt(formData, "matchMinutes");
  const periods = readInt(formData, "periods");
  const teamCount = readInt(formData, "teamCount");

  if (title.length > 60) return { error: "Название — до 60 символов." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Укажите дату игры." };
  if (!/^\d{2}:\d{2}$/.test(time)) return { error: "Укажите время начала." };
  if (place.length > 120) return { error: "Название места слишком длинное." };
  if (!noLimit && (goalLimit === null || goalLimit < 1 || goalLimit > 20)) {
    return { error: "Лимит голов — от 1 до 20 (или «Без лимита голов»)." };
  }
  if (minutes === null || minutes < 1 || minutes > 60) return { error: "Длительность тайма — от 1 до 60 минут." };
  if (periods === null || periods < 1 || periods > 4) return { error: "Таймов — от 1 до 4." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_game", {
    p_game_id: gameId,
    p_title: title,
    p_starts_at: zonedTimeToUtc(date, time, timezone).toISOString(),
    p_place: place,
  });
  if (error) return { error: toMessage(error) };

  const { error: formatError } = await supabase.rpc("update_game_format", {
    p_game_id: gameId,
    p_goal_limit: noLimit ? null : goalLimit,
    p_match_minutes: minutes,
    p_auto_sounds: formData.get("autoSounds") === "on",
    p_periods: periods,
  });
  if (formatError) return { error: toMessage(formatError) };

  if (teamCount !== null && formData.get("teamCountChanged") === "1") {
    const r = await setTeamCountAction(gameId, teamCount);
    if (r.error) return { error: r.error };
  }

  revalidateAll();
  return { ok: true };
}

export async function setGameMvpAction(gameId: string, playerId: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_game_mvp", { p_game_id: gameId, p_player_id: playerId });
  if (error) return { error: toMessage(error) };
  revalidateAll();
  return {};
}

export async function setLiveLinkAction(
  gameId: string,
  enabled: boolean,
): Promise<ActionResult & { token?: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_live_link", { p_game_id: gameId, p_enabled: enabled });
  if (error) return { error: toMessage(error) };
  revalidatePath(`/game/${gameId}`);
  return { token: data };
}

export async function resetGameResultsAction(gameId: string): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.group || ctx.role !== "organizer") return { error: errorMessage("not_organizer") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_game_results", { p_game_id: gameId });
  if (error) return { error: toMessage(error) };
  const recalcError = await recalc(ctx.group.id);
  revalidateAll();
  return recalcError ? { error: `Результаты сброшены, но пересчёт не удался: ${recalcError}` } : {};
}

export async function deleteGameAction(gameId: string): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.group || ctx.role !== "organizer") return { error: errorMessage("not_organizer") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_game", { p_game_id: gameId });
  if (error) return { error: toMessage(error) };
  const recalcError = await recalc(ctx.group.id);
  revalidateAll();
  return recalcError ? { error: `Игра удалена, но пересчёт не удался: ${recalcError}` } : {};
}
