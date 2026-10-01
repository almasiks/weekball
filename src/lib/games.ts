import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { teamColor, type TeamColor } from "@/lib/teams/colors";
import { playerStrength } from "@/lib/teams/strength";
import type {
  ArrivalStatus,
  GameRow,
  PlayerPosition,
  SignupStatus,
  TeamRow,
} from "@/lib/supabase/database.types";

export type SignupEntry = {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  level: number;
  rating: number | null;
  ratedGames: number;
  position: PlayerPosition | null;
  status: SignupStatus;
  arrival: ArrivalStatus;
  lateMinutes: number | null;
};

export type TeamMember = SignupEntry & { isLocked: boolean; addedLate: boolean };

export type TeamView = {
  team: TeamRow;
  color: TeamColor;
  players: TeamMember[];
  strength: number;
};

export type GameView = {
  game: GameRow;
  going: SignupEntry[];
  waitlist: SignupEntry[];
  declined: SignupEntry[];
  // Empty for regular players until teams are published or a draft is running (RLS).
  teams: TeamView[];
  unassigned: SignupEntry[];
};

// Games older than this are no longer "upcoming" (a game lasts ~2 hours).
const UPCOMING_GRACE_MS = 3 * 60 * 60 * 1000;

function upcomingSince() {
  return new Date(Date.now() - UPCOMING_GRACE_MS).toISOString();
}

export async function getUpcomingGames(groupId: string, limit = 5) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("group_id", groupId)
    .gte("starts_at", upcomingSince())
    .neq("status", "finished")
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// Game with its signups and teams, as seen by the current user.
// RLS decides visibility: teams come back only for organizers, or once published / drafting.
export const getGameView = cache(
  async (gameId: string): Promise<GameView | null> => {
    const supabase = await createClient();
    const [{ data: game }, { data: signups, error }, { data: teams }, { data: teamPlayers }] =
      await Promise.all([
        supabase.from("games").select("*").eq("id", gameId).maybeSingle(),
        supabase
          .from("signups")
          .select(
            "player_id, status, arrival, late_minutes, created_at, players(name, avatar_url, level, position, rating, rated_games)",
          )
          .eq("game_id", gameId)
          .order("created_at", { ascending: true }),
        supabase
          .from("teams")
          .select("*")
          .eq("game_id", gameId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("team_players")
          .select("*")
          .eq("game_id", gameId)
          .order("created_at", { ascending: true }),
      ]);
    if (error) throw error;
    if (!game) return null;

    const entries: SignupEntry[] = (signups ?? []).map((s) => ({
      playerId: s.player_id,
      name: s.players?.name ?? "Без имени",
      avatarUrl: s.players?.avatar_url ?? null,
      level: s.players?.level ?? 3,
      rating: s.players?.rating ?? null,
      ratedGames: s.players?.rated_games ?? 0,
      position: s.players?.position ?? null,
      status: s.status,
      arrival: s.arrival,
      lateMinutes: s.late_minutes,
    }));
    const going = entries.filter((e) => e.status === "going");
    const goingById = new Map(going.map((e) => [e.playerId, e]));

    const teamViews: TeamView[] = (teams ?? []).map((team) => {
      const players = (teamPlayers ?? [])
        .filter((tp) => tp.team_id === team.id && goingById.has(tp.player_id))
        .map((tp) => ({
          ...goingById.get(tp.player_id)!,
          isLocked: tp.is_locked,
          addedLate: tp.added_late,
        }));
      return {
        team,
        color: teamColor(team.color),
        players,
        strength: players.reduce((sum, p) => sum + playerStrength(p), 0),
      };
    });
    const assigned = new Set(teamViews.flatMap((t) => t.players.map((p) => p.playerId)));

    return {
      game,
      going,
      waitlist: entries.filter((e) => e.status === "waitlist"),
      declined: entries.filter((e) => e.status === "declined"),
      teams: teamViews,
      unassigned: going.filter((e) => !assigned.has(e.playerId)),
    };
  },
);

// Public, name-free summary for Open Graph previews (crawlers are not signed in).
export async function getGamePreview(gameId: string) {
  const admin = createAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(gameId)) return null;

  const [{ data: game }, { count }] = await Promise.all([
    admin
      .from("games")
      .select("starts_at, place, max_players, timezone, status, groups(name)")


      .maybeSingle(),
    admin
      .from("signups")
      .select("player_id", { count: "exact", head: true })
      .eq("game_id", gameId)
      .eq("status", "going"),
  ]);
  if (!game) return null;

  return {
    groupName: game.groups?.name ?? "Weekly Football",
    startsAt: game.starts_at,
    place: game.place,
    maxPlayers: game.max_players,
    timezone: game.timezone,
    status: game.status,
    goingCount: count ?? 0,
  };
}
