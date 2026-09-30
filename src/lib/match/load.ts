import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { GameView } from "@/lib/games";
import type { LiveEvent, LiveMatch, LiveTeam, StandingRow } from "./types";

export type MatchData = {
  matches: LiveMatch[];
  events: LiveEvent[];
  teams: LiveTeam[];
  names: Record<string, string>;
  standings: StandingRow[];
};

// Matches, (non-voided) events and standings of a game, as seen by the current member.
export async function getMatchData(view: GameView): Promise<MatchData> {
  const supabase = await createClient();
  const gameId = view.game.id;
  const [{ data: matches }, { data: events }, { data: standings }] = await Promise.all([
    supabase.from("matches").select("*").eq("game_id", gameId).order("sort_order"),
    supabase
      .from("events")
      .select("*")
      .eq("game_id", gameId)
      .is("voided_at", null)
      .order("period")
      .order("second")
      .order("created_at"),
    supabase.rpc("game_standings", { p_game_id: gameId }),
  ]);

  const teams: LiveTeam[] = view.teams.map((t) => ({
    id: t.team.id,
    name: t.team.name,
    color: t.team.color,
    players: t.players.map((p) => ({ id: p.playerId, name: p.name })),
  }));

  // Names for everyone who appears in events, even if they later left their team.
  const names: Record<string, string> = {};
  for (const p of [...view.going, ...view.waitlist, ...view.declined]) names[p.playerId] = p.name;
  const missing = [
    ...new Set(
      (events ?? []).flatMap((e) => [e.player_id, e.assist_player_id, e.player_in_id]).filter(
        (id): id is string => !!id && !names[id],
      ),
    ),
  ];
  if (missing.length) {
    const { data: players } = await supabase.from("players").select("id, name").in("id", missing);
    for (const p of players ?? []) names[p.id] = p.name;
  }

  return {
    matches: (matches ?? []).map((m) => ({ ...m, timer_elapsed_ms: Number(m.timer_elapsed_ms) })),
    events: events ?? [],
    teams,
    names,
    standings: standings ?? [],
  };
}
