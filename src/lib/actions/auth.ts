"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

async function callbackUrl() {
  return `${await getSiteUrl()}/auth/callback`;
}

// Links Google to the current (usually anonymous) user, keeping the same profile.
export async function linkGoogleAction() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: await callbackUrl() },
  });
  if (error || !data?.url) {
    redirect(`/?auth_error=${encodeURIComponent(error?.code ?? "link_failed")}`);
  }
  redirect(data.url);
}

// Signs in with Google on a new device (replaces the current session).
export async function signInWithGoogleAction() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callbackUrl() },
  });
  if (error || !data?.url) {
    redirect(`/?auth_error=${encodeURIComponent(error?.code ?? "signin_failed")}`);
  }
  redirect(data.url);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
