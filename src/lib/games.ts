import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ArrivalStatus,
  GameRow,
  SignupStatus,
} from "@/lib/supabase/database.types";

export type SignupEntry = {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  status: SignupStatus;
  arrival: ArrivalStatus;
  lateMinutes: number | null;
};

export type GameView = {
  game: GameRow;
  going: SignupEntry[];
  waitlist: SignupEntry[];
  declined: SignupEntry[];
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

// Game with its signups, as seen by the current user (RLS: members only).
export const getGameView = cache(
  async (gameId: string): Promise<GameView | null> => {
    const supabase = await createClient();
    const [{ data: game }, { data: signups, error }] = await Promise.all([
      supabase.from("games").select("*").eq("id", gameId).maybeSingle(),
      supabase
        .from("signups")
        .select(
          "player_id, status, arrival, late_minutes, created_at, players(name, avatar_url)",
        )
        .eq("game_id", gameId)
        .order("created_at", { ascending: true }),
    ]);
    if (error) throw error;
    if (!game) return null;

    const entries: SignupEntry[] = (signups ?? []).map((s) => ({
      playerId: s.player_id,
      name: s.players?.name ?? "Без имени",
      avatarUrl: s.players?.avatar_url ?? null,
      status: s.status,
      arrival: s.arrival,
      lateMinutes: s.late_minutes,
    }));

    return {
      game,
      going: entries.filter((e) => e.status === "going"),
      waitlist: entries.filter((e) => e.status === "waitlist"),
      declined: entries.filter((e) => e.status === "declined"),
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
      .eq("id", gameId)
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
