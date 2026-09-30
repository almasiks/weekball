import "server-only";
import { createClient } from "@/lib/supabase/server";

export type StatsPeriod = "all" | "10";

/** Start date of the period: "10" = since the 10th most recent finished game. */
export async function periodStart(groupId: string, period: StatsPeriod): Promise<string | null> {
  if (period === "all") return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("games")
    .select("starts_at")
    .eq("group_id", groupId)
    .eq("status", "finished")
    .order("starts_at", { ascending: false })
    .limit(10);
  return data?.at(-1)?.starts_at ?? null;
}

export async function getLeaderboard(groupId: string, from: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leaderboard", { p_group_id: groupId, p_from: from });
  if (error) throw error;
  return data ?? [];
}
