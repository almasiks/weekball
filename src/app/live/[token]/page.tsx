import type { Metadata } from "next";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { Notice } from "@/components/notice";
import { GuestLiveView } from "@/components/live/guest-live-view";
import { formatGameDate } from "@/lib/datetime";
import { LIVE_TOKEN, type PublicLiveGame } from "@/lib/match/public";
import type { Database } from "@/lib/supabase/database.types";

// Anonymous read through the security-definer RPC — works without any session.
const loadLive = cache(async (token: string): Promise<PublicLiveGame | null> => {
  if (!LIVE_TOKEN.test(token)) return null;
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data } = await supabase.rpc("get_live_game", { p_token: token });
  return (data as PublicLiveGame | null) ?? null;
});

export async function generateMetadata({ params }: PageProps<"/live/[token]">): Promise<Metadata> {
  const { token } = await params;
  const live = await loadLive(token);
  if (!live) return { title: "Live", robots: { index: false } };

  const teamName = (id: string) => live.teams.find((t) => t.id === id)?.name ?? "?";
  const current =
    live.matches.find((m) => m.status === "live" || m.status === "break") ?? live.matches.at(-1);
  const title = current
    ? `${teamName(current.team_a_id)} ${current.score_a}:${current.score_b} ${teamName(current.team_b_id)}`
    : `${live.game.group_name}: live`;
  const description = [
    live.game.group_name,
    formatGameDate(live.game.starts_at, live.game.timezone),
    current && (current.status === "finished" ? "матч завершён" : "идёт матч"),
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    title: { absolute: `⚽ ${title}` },
    description,
    robots: { index: false },
    openGraph: { title: `⚽ ${title}`, description, type: "website", siteName: "Weekly Football", locale: "ru_RU" },
    twitter: { card: "summary", title: `⚽ ${title}`, description },
  };
}

export default async function PublicLivePage({ params }: PageProps<"/live/[token]">) {
  const { token } = await params;
  const live = await loadLive(token);
  if (!live) {
    return <Notice variant="error">Ссылка недействительна или отключена организатором.</Notice>;
  }
  return <GuestLiveView token={token} initial={live} />;
}
