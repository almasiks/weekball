"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toMessage } from "@/lib/errors";
import { recalcGroupRatings } from "@/lib/rating/recalc";
import { getAppContext } from "@/lib/session";
import type { PlayerPosition } from "@/lib/supabase/database.types";

export type ActionResult = { error?: string };

function done(error: { message?: string } | null): ActionResult {
  if (error) return { error: toMessage(error) };
  revalidatePath("/roster");
  revalidatePath("/", "layout");
  return {};
}

/** Splits pasted text into names: one per line, trimmed, empty lines dropped. */
function parseNames(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((n) => n.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export async function addPlayersAction(groupId: string, text: string): Promise<ActionResult & { added?: number }> {
  const names = parseNames(text);
  if (names.length === 0) return { error: "Вставьте хотя бы одно имя." };
  if (names.length > 100) return { error: "Не больше 100 имён за раз." };
  if (names.some((n) => n.length > 40)) return { error: "Имя — не длиннее 40 символов." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_players", { p_group_id: groupId, p_names: names });
  if (error) return { error: toMessage(error) };
  done(null);
  return { added: data?.length ?? 0 };
}

export async function renamePlayerAction(playerId: string, name: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_player", { p_player_id: playerId, p_name: name });
  return done(error);
}

export async function setPlayerPositionAction(
  playerId: string,
  position: PlayerPosition | null,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_player_position", { p_player_id: playerId, p_position: position });
  return done(error);
}

export async function setPlayerArchivedAction(playerId: string, archived: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_player_archived", { p_player_id: playerId, p_archived: archived });
  return done(error);
}

export async function unlinkPlayerAction(playerId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unlink_player", { p_player_id: playerId });
  return done(error);
}

// Merge duplicates, then rebuild ratings (history of the merged player changed).
export async function mergePlayersAction(fromId: string, toId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_players", { p_from: fromId, p_to: toId });
  if (error) return { error: toMessage(error) };
  const ctx = await getAppContext();
  if (ctx.group) await recalcGroupRatings(supabase, ctx.group.id).catch(() => null);
  return done(null);
}
