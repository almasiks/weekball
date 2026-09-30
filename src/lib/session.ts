import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/supabase/database.types";

export type AppContext = {
  userId: string | null;
  isAnonymous: boolean;
  player: { id: string; name: string } | null;
  group: { id: string; name: string; inviteCode: string } | null;
  role: MemberRole | null;
};

const EMPTY: AppContext = {
  userId: null,
  isAnonymous: false,
  player: null,
  group: null,
  role: null,
};

// Current user, their profile and their active group (the most recently joined one).
// Deduplicated per request via React cache().
export const getAppContext = cache(async (): Promise<AppContext> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return EMPTY;

  const userId = claims.sub;
  const isAnonymous = claims.is_anonymous === true;

  const [{ data: player }, { data: membership }] = await Promise.all([
    supabase.from("players").select("id, name").eq("id", userId).maybeSingle(),
    supabase
      .from("group_members")
      .select("role, groups(id, name, invite_code)")
      .eq("player_id", userId)
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const group = membership?.groups;

  return {
    userId,
    isAnonymous,
    player,
    group: group
      ? { id: group.id, name: group.name, inviteCode: group.invite_code }
      : null,
    role: membership?.role ?? null,
  };
});

export async function getGroupMembers(groupId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_members")
    .select("player_id, role, players(name)")
    .eq("group_id", groupId);
  if (error) throw error;

  return (data ?? [])
    .map((row) => ({
      playerId: row.player_id,
      role: row.role,
      name: row.players?.name ?? "Без имени",
    }))
    .sort(
      (a, b) =>
        Number(b.role === "organizer") - Number(a.role === "organizer") ||
        a.name.localeCompare(b.name, "ru"),
    );
}
