"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getT, toMessage } from "@/lib/i18n/server";
import { recalcGroupRatings } from "@/lib/rating/recalc";
import { getAppContext } from "@/lib/session";
import type { PlayerPosition } from "@/lib/supabase/database.types";

export type ActionResult = { error?: string };

async function done(error: { message?: string } | null): Promise<ActionResult> {
  if (error) return { error: await toMessage(error) };
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
  const t = await getT();
  if (names.length === 0) return { error: t("roster.error.needOne") };
  if (names.length > 100) return { error: t("roster.error.tooMany") };
  if (names.some((n) => n.length > 40)) return { error: t("roster.error.nameLong") };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_players", { p_group_id: groupId, p_names: names });
  if (error) return { error: await toMessage(error) };
  await done(null);
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
  if (error) return { error: await toMessage(error) };
  const ctx = await getAppContext();
  if (ctx.group) await recalcGroupRatings(supabase, ctx.group.id).catch(() => null);
  return done(null);
}
