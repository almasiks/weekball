import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/notice";
import { GameRealtime } from "@/components/game/game-realtime";
import { MatchDetail } from "@/components/match/match-detail";
import { getGameView } from "@/lib/games";
import { getMatchData } from "@/lib/match/load";
import { getAppContext } from "@/lib/session";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("match.title") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MatchPage({ params }: PageProps<"/match/[id]">) {
  const { id } = await params;
  const [ctx, t] = await Promise.all([getAppContext(), getT()]);

  let gameId: string | null = null;
  if (UUID.test(id) && ctx.userId) {
    const supabase = await createClient();
    const { data } = await supabase.from("matches").select("game_id").eq("id", id).maybeSingle();
    gameId = data?.game_id ?? null;
  }
  const view = gameId ? await getGameView(gameId) : null;
  const data = view ? await getMatchData(view) : null;
  const match = data?.matches.find((m) => m.id === id);

  if (!view || !data || !match) {
    return (
      <div className="flex flex-col gap-4">
        <Notice>{t("match.notFound")}</Notice>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          {t("common.home")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <GameRealtime gameId={view.game.id} />
      <Link
        href={`/game/${view.game.id}`}
        className="-ml-2 flex min-h-11 w-fit items-center gap-1 px-2 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t("game.toGame")}
      </Link>
      <MatchDetail
        match={match}
        teams={data.teams}
        events={data.events}
        names={data.names}
        shareUrl={`${await getSiteUrl()}/match/${id}`}
      />
    </div>
  );
}
