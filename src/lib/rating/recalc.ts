import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { replayRatings, type RatedMatch } from "./elo";

type Client = SupabaseClient<Database>;

/**
 * Rebuilds ratings of a whole group by replaying every finished game in order,
 * then writes them atomically (apply_rating_history). Idempotent.
 * Works with the organizer's client (RLS) or the service-role client (cron).
 */
export async function recalcGroupRatings(client: Client, groupId: string) {
  const { data: games, error: gamesError } = await client
    .from("games")
    .select("id, starts_at")
    .eq("group_id", groupId)
    .eq("status", "finished");
  if (gamesError) throw gamesError;

  const gameIds = (games ?? []).map((g) => g.id);
  const startsAt = new Map((games ?? []).map((g) => [g.id, g.starts_at]));

  let matches: RatedMatch[] = [];
  if (gameIds.length) {
    const [{ data: rows, error: mErr }, { data: roster, error: rErr }] = await Promise.all([
      client
        .from("matches")
        .select("game_id, sort_order, team_a_id, team_b_id, score_a, score_b")
        .in("game_id", gameIds)
        .eq("status", "finished"),
      client.from("team_players").select("team_id, player_id").in("game_id", gameIds),
    ]);
    if (mErr) throw mErr;
    if (rErr) throw rErr;

    const byTeam = new Map<string, string[]>();
    for (const r of roster ?? []) byTeam.set(r.team_id, [...(byTeam.get(r.team_id) ?? []), r.player_id]);

    matches = (rows ?? []).map((m) => ({
      gameId: m.game_id,
      gameStartsAt: startsAt.get(m.game_id)!,
      sortOrder: m.sort_order,
      teamA: byTeam.get(m.team_a_id) ?? [],
      teamB: byTeam.get(m.team_b_id) ?? [],
      scoreA: m.score_a,
      scoreB: m.score_b,
    }));
  }

  const result = replayRatings(matches);

  // Only current members can be written (players who left the group keep their last rating).
  const { data: members, error: memberError } = await client
    .from("group_members")
    .select("player_id")
    .eq("group_id", groupId);
  if (memberError) throw memberError;
  const memberIds = new Set((members ?? []).map((m) => m.player_id));

  const { error } = await client.rpc("apply_rating_history", {
    p_group_id: groupId,
    payload: {
      history: result.history.filter((h) => memberIds.has(h.player_id)),
      players: Object.entries(result.ratings)
        .filter(([id]) => memberIds.has(id))
        .map(([player_id, rating]) => ({
          player_id,
          rating,
          rated_games: result.ratedGames[player_id] ?? 0,
        })),
      processed_game_ids: gameIds,
    },
  });
  if (error) throw error;

  return { games: gameIds.length, matches: matches.length, players: Object.keys(result.ratings).length };
}
