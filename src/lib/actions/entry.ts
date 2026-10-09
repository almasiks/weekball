"use server";

// Entry without accounts: a name on the first visit, a PIN for the organizer.
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_GROUP_ID, getAppContext } from "@/lib/session";
import { errorMessage, getT, toMessage } from "@/lib/i18n/server";
import { readText, type FormState } from "@/lib/forms";

// "Как тебя зовут?" — signs the device in anonymously (the session cookie remembers it)
// and creates the player. A taken name comes back as the "name_taken" message.
export async function enterAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = readText(formData, "name");
  if (!name || name.length > 40) return { error: await errorMessage("invalid_player_name") };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) return { error: await errorMessage("not_authenticated") };
  }

  const { error } = await supabase.rpc("enter_app", { p_name: name });
  if (error) return { error: await toMessage(error) };

  revalidatePath("/", "layout");
  return { ok: true };
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
// A right PIN makes the current player an organizer; the role is written with
// the service key because players cannot change roles themselves (RLS).
export async function adminPinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getT();
  const ctx = await getAppContext();
  if (!ctx.playerId) return { error: await errorMessage("not_authenticated") };

  const expected = process.env.ADMIN_PIN?.trim();
  const admin = createAdminClient();
  if (!expected || !admin) return { error: t("adminPin.notConfigured") };

  const pin = readText(formData, "pin");
  if (!pin || !timingSafeEqual(digest(pin), digest(expected))) {
    // Slows down guessing a little; the real protection is a long PIN.
    await new Promise((resolve) => setTimeout(resolve, 800));
    return { error: t("adminPin.wrong") };
  }

  // The membership row exists since the name was entered (enter_app).
  const { data, error } = await admin
    .from("group_members")
    .update({ role: "organizer" })
    .eq("group_id", DEFAULT_GROUP_ID)
    .eq("player_id", ctx.playerId)
    .select("player_id");
  if (error || !data?.length) return { error: await toMessage(error) };

  revalidatePath("/", "layout");
  return { ok: true };
}
