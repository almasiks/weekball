"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/session";
import type { MemberRole } from "@/lib/supabase/database.types";
import { getT, toMessage } from "@/lib/i18n/server";
import { readText, type FormState } from "@/lib/forms";

export async function setMemberRoleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const playerId = readText(formData, "playerId");
  const role = readText(formData, "role") as MemberRole;
  if (role !== "organizer" && role !== "player") {
    return { error: (await getT())("schedule.error.unknownRole") };
  }

  const ctx = await getAppContext();
  if (!ctx.group || ctx.role !== "organizer") {
    return { error: (await getT())("schedule.error.rolesOrganizerOnly") };
  }

  // RLS is the real guard: a non-organizer update matches zero rows.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_members")
    .update({ role })
    .eq("group_id", ctx.group.id)
    .eq("player_id", playerId)
    .select("player_id");

  if (error) return { error: await toMessage(error) };
  if (!data?.length) return { error: (await getT())("schedule.error.roleFailed") };

  revalidatePath("/", "layout");
  return {};
}
