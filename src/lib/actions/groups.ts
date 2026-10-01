"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/session";
import type { MemberRole } from "@/lib/supabase/database.types";
import { errorMessage, toMessage } from "@/lib/errors";
import { readText, type FormState } from "@/lib/forms";

const ERROR_MESSAGES = {
  invalid_group_name: errorMessage("invalid_group_name"),
  invalid_player_name: errorMessage("invalid_player_name"),
  not_authenticated: errorMessage("not_authenticated"),
};

// Uses the existing session or silently creates an anonymous one.
async function ensureSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) return { supabase, error: null };

  const { error } = await supabase.auth.signInAnonymously();
  return { supabase, error };
}

export async function createGroupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const groupName = readText(formData, "groupName");
  const playerName = readText(formData, "playerName");
  if (!groupName || groupName.length > 60) {
    return { error: ERROR_MESSAGES.invalid_group_name };
  }
  if (!playerName || playerName.length > 40) {
    return { error: ERROR_MESSAGES.invalid_player_name };
  }

  const { supabase, error: authError } = await ensureSession();
  if (authError) return { error: ERROR_MESSAGES.not_authenticated };

  const { error } = await supabase.rpc("create_group", {
    group_name: groupName,
    player_name: playerName,
  });
  if (error) return { error: toMessage(error) };

  revalidatePath("/", "layout");
  redirect("/admin?created=1");
}

export async function joinGroupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = readText(formData, "code");
  const playerName = readText(formData, "playerName");
  // "Это я": link this account to a roster name (keeps all of its history).
  const claimPlayerId = readText(formData, "claimPlayerId") || null;
  if (!claimPlayerId && (!playerName || playerName.length > 40)) {
    return { error: ERROR_MESSAGES.invalid_player_name };
  }

  const { supabase, error: authError } = await ensureSession();
  if (authError) return { error: ERROR_MESSAGES.not_authenticated };

  const { error } = await supabase.rpc("join_group", {
    code,
    player_name: playerName,
    p_claim_player_id: claimPlayerId,
  });
  if (error) return { error: toMessage(error) };

  revalidatePath("/", "layout");
  redirect("/roster?joined=1");
}

export async function setMemberRoleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const playerId = readText(formData, "playerId");
  const role = readText(formData, "role") as MemberRole;
  if (role !== "organizer" && role !== "player") {
    return { error: "Неизвестная роль." };
  }

  const ctx = await getAppContext();
  if (!ctx.group || ctx.role !== "organizer") {
    return { error: "Менять роли может только организатор." };
  }

  // RLS is the real guard: a non-organizer update matches zero rows.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_members")
    .update({ role })
    .eq("group_id", ctx.group.id)
    .eq("player_id", playerId)
    .select("player_id");

  if (error) return { error: toMessage(error) };
  if (!data?.length) return { error: "Не удалось изменить роль." };

  revalidatePath("/", "layout");
  return {};
}
