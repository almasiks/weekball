import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole, PlayerPosition } from "@/lib/supabase/database.types";
import { getT } from "@/lib/i18n/server";

// The only group of the app (seeded by the migration "single_group"). Games, schedule,
// sounds and statistics all belong to it; the interface has no notion of groups.
export const DEFAULT_GROUP_ID = "00000000-0000-4000-8000-000000000001";

export type AppContext = {
  // Anonymous auth account of this device. Created silently on the first visit
  // (AutoSession); it has no player until the person says who they are.
  userId: string | null;
  // The player linked to this account (players.user_id). Compare player ids with THIS.
  playerId: string | null;
  player: { id: string; name: string; position: PlayerPosition | null } | null;
  // Set as soon as there is a session. Always the default group.
  group: { id: string; name: string } | null;
  role: MemberRole | null;
};

const EMPTY: AppContext = { userId: null, playerId: null, player: null, group: null, role: null };

// Current account, its player and role. Deduplicated per request via React cache().
export const getAppContext = cache(async (): Promise<AppContext> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return EMPTY;

  const userId = claims.sub;
  const { data: player } = await supabase
    .from("players")
    .select("id, name, position")
    .eq("user_id", userId)
    .maybeSingle();
  const group = { id: DEFAULT_GROUP_ID, name: "Weekly Football" };
  if (!player) return { ...EMPTY, userId, group };

  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", DEFAULT_GROUP_ID)
    .eq("player_id", player.id)
    .maybeSingle();

  return {
    userId,
    playerId: player.id,
    player,
    group,
    role: membership?.role ?? "player",
  };
});

export type RosterMember = {
  playerId: string;
  role: MemberRole;
  name: string;
  level: number;
  position: PlayerPosition | null;
  hasAccount: boolean;
  isRegular: boolean;
  archived: boolean;
};

/** Roster names nobody has taken yet: offered in "Кто ты?". */
export async function getFreeRosterNames(groupId: string): Promise<string[]> {
  return (await getGroupMembers(groupId))
    .filter((m) => !m.hasAccount && !m.archived && m.isRegular)
    .map((m) => m.name)
    .sort((a, b) => a.localeCompare(b, "ru"));
}

export async function getGroupMembers(groupId: string): Promise<RosterMember[]> {
  const [supabase, t] = await Promise.all([createClient(), getT()]);
  const { data, error } = await supabase
    .from("group_members")
    .select("player_id, role, players(name, level, position, user_id, is_regular, archived_at)")
    .eq("group_id", groupId);
  if (error) throw error;

  return (data ?? [])
    .map((row) => ({
      playerId: row.player_id,
      role: row.role,
      name: row.players?.name ?? t("common.unnamed"),
      level: row.players?.level ?? 3,
      position: row.players?.position ?? null,
      hasAccount: !!row.players?.user_id,
      isRegular: row.players?.is_regular ?? true,
      archived: !!row.players?.archived_at,
    }))
    .sort(
      (a, b) =>
        Number(b.role === "organizer") - Number(a.role === "organizer") ||
        a.name.localeCompare(b.name, "ru"),
    );
}
