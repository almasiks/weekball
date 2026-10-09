import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole, PlayerPosition } from "@/lib/supabase/database.types";
import { getT } from "@/lib/i18n/server";

export type AppContext = {
  // Auth account (may exist without a player yet).
  userId: string | null;
  // The roster player linked to this account (players.user_id). Compare player ids with THIS.
  playerId: string | null;
  isAnonymous: boolean;
  player: { id: string; name: string; position: PlayerPosition | null } | null;
  group: { id: string; name: string; inviteCode: string } | null;
  role: MemberRole | null;
};

const EMPTY: AppContext = {
  userId: null,
  playerId: null,
  isAnonymous: false,
  player: null,
  group: null,
  role: null,
};

// Current account, its player and the active group (the most recently joined one).
// Deduplicated per request via React cache().
export const getAppContext = cache(async (): Promise<AppContext> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return EMPTY;

  const userId = claims.sub;
  const isAnonymous = claims.is_anonymous === true;

  const { data: player } = await supabase
    .from("players")
    .select("id, name, position")
    .eq("user_id", userId)
    .maybeSingle();
  if (!player) return { ...EMPTY, userId, isAnonymous };

  const { data: membership } = await supabase
    .from("group_members")
    .select("role, groups(id, name, invite_code)")
    .eq("player_id", player.id)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const group = membership?.groups;

  return {
    userId,
    playerId: player.id,
    isAnonymous,
    player,
    group: group ? { id: group.id, name: group.name, inviteCode: group.invite_code } : null,
    role: membership?.role ?? null,
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
