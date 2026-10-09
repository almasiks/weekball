"use server";

// No accounts and no entry screen: a device gets an anonymous session by itself
// (AutoSession). A name is asked only when it is needed — the first "Иду" or the
// organizer PIN — and then the device is remembered.
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_GROUP_ID, getAppContext } from "@/lib/session";
import { errorMessage, getT, toMessage } from "@/lib/i18n/server";
import { readText, type FormState } from "@/lib/forms";

export type ActionResult = { error?: string };

// Links this device to a player: a roster name without an account is taken over
// (with its history), a new name creates a player, a taken name -> "name_taken".
async function becomePlayer(name: string): Promise<string | null> {
  const clean = name.trim();
  if (!clean || clean.length > 40) return errorMessage("invalid_player_name");

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    // Normally the browser already has a session; this covers a cleared cookie.
    const { error } = await supabase.auth.signInAnonymously();
    if (error) return errorMessage("not_authenticated");
  }
  const { error } = await supabase.rpc("enter_app", { p_name: clean });
  return error ? toMessage(error) : null;
}

/** "Кто ты?" in the profile. */
export async function chooseNameAction(name: string): Promise<ActionResult> {
  const error = await becomePlayer(name);
  if (error) return { error };
  revalidatePath("/", "layout");
  return {};
}

/** The first "Иду" of a device: who it is, and straight into the game. */
export async function enterAndSignupAction(gameId: string, name: string): Promise<ActionResult> {
  const failed = await becomePlayer(name);
  if (failed) return { error: failed };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_signup", { p_game_id: gameId, wants_to_come: true });
  revalidatePath("/", "layout");
  return error ? { error: await toMessage(error) } : {};
}

export async function renameMeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = readText(formData, "name");
  if (!name || name.length > 40) return { error: await errorMessage("invalid_player_name") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_me", { p_name: name });
  if (error) return { error: await toMessage(error) };

  revalidatePath("/", "layout");
  return { ok: true };
}

const digest = (value: string) => createHash("sha256").update(value).digest();

// Organizer entry: the PIN lives only in the server environment (ADMIN_PIN).
// A right PIN makes the player of this device an organizer (a device without a
// player gives a name in the same form). The role is written with the service
// key because players cannot change roles themselves (RLS).
export async function adminPinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getT();
  const expected = process.env.ADMIN_PIN?.trim();
  const admin = createAdminClient();
  if (!expected || !admin) return { error: t("adminPin.notConfigured") };

  const pin = readText(formData, "pin");
  if (!pin || !timingSafeEqual(digest(pin), digest(expected))) {
    // Slows down guessing a little; the real protection is a long PIN.
    await new Promise((resolve) => setTimeout(resolve, 800));
    return { error: t("adminPin.wrong") };
  }

  let playerId = (await getAppContext()).playerId;
  if (!playerId) {
    const failed = await becomePlayer(readText(formData, "name"));
    if (failed) return { error: failed };
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const { data: player } = await supabase
      .from("players")
      .select("id")
      .eq("user_id", claims?.claims?.sub ?? "")
      .maybeSingle();
    playerId = player?.id ?? null;
  }
  if (!playerId) return { error: await errorMessage("not_authenticated") };

  // The membership row exists since the player was created (enter_app).
  const { data, error } = await admin
    .from("group_members")
    .update({ role: "organizer" })
    .eq("group_id", DEFAULT_GROUP_ID)
    .eq("player_id", playerId)
    .select("player_id");
  if (error || !data?.length) return { error: await toMessage(error) };

  revalidatePath("/", "layout");
  return { ok: true };
}
