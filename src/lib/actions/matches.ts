"use server";

// Match setup actions (need a connection). In-match actions (timer, events) go
// through the offline queue straight from the browser.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toMessage } from "@/lib/errors";

export type ActionResult = { error?: string };

function revalidateGame(gameId: string) {
  revalidatePath("/");
  revalidatePath(`/game/${gameId}`);
  revalidatePath(`/game/${gameId}/live`);
}

async function done(gameId: string, call: PromiseLike<{ error: { message?: string } | null }>) {
  const { error } = await call;
  if (error) return { error: toMessage(error) };
  revalidateGame(gameId);
  return {};
}

export async function generateRoundRobinAction(
  gameId: string,
  periods: number,
  periodSeconds: number,
): Promise<ActionResult> {
  const supabase = await createClient();
  return done(
    gameId,
    supabase.rpc("generate_round_robin", {
      p_game_id: gameId,
      p_periods: periods,
      p_period_seconds: periodSeconds,
    }),
  );
}

export async function createMatchAction(
  gameId: string,
  teamA: string,
  teamB: string,
  periods: number,
  periodSeconds: number,
): Promise<ActionResult> {
  const supabase = await createClient();
  return done(
    gameId,
    supabase.rpc("create_match", {
      p_game_id: gameId,
      p_team_a_id: teamA,
      p_team_b_id: teamB,
      p_periods: periods,
      p_period_seconds: periodSeconds,
    }),
  );
}

export async function updateMatchSettingsAction(
  gameId: string,
  matchId: string,
  periods: number,
  periodSeconds: number,
): Promise<ActionResult> {
  const supabase = await createClient();
  return done(
    gameId,
    supabase.rpc("update_match_settings", {
      p_match_id: matchId,
      p_periods: periods,
      p_period_seconds: periodSeconds,
    }),
  );
}

export async function deleteMatchAction(gameId: string, matchId: string): Promise<ActionResult> {
  const supabase = await createClient();
  return done(gameId, supabase.rpc("delete_match", { p_match_id: matchId }));
}

export async function reopenMatchAction(gameId: string, matchId: string): Promise<ActionResult> {
  const supabase = await createClient();
  return done(gameId, supabase.rpc("reopen_match", { p_match_id: matchId }));
}

export async function finishGameAction(gameId: string): Promise<ActionResult> {
  const supabase = await createClient();
  return done(gameId, supabase.rpc("finish_game", { p_game_id: gameId }));
}

export async function setLiveLinkAction(
  gameId: string,
  enabled: boolean,
  regenerate = false,
): Promise<ActionResult & { token?: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_live_link", {
    p_game_id: gameId,
    p_enabled: enabled,
    p_regenerate: regenerate,
  });
  if (error) return { error: toMessage(error) };
  revalidatePath(`/game/${gameId}/live`);
  return { token: data };
}
