import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GameRealtime } from "@/components/game/game-realtime";
import { MatchesOverview } from "@/components/match/matches-overview";
import { Notice } from "@/components/notice";
import { formatGameDate } from "@/lib/datetime";
import { getGameView, getUpcomingGames } from "@/lib/games";
import { getT } from "@/lib/i18n/server";
import { getMatchData } from "@/lib/match/load";
import { getAppContext } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("match.title") };
}

// The "Матч" tab: the live matches of the current game.
// The organizer lands in the console, players see the score, timer and events.
export default async function CurrentMatchPage() {
  const [ctx, t] = await Promise.all([getAppContext(), getT()]);
  if (!ctx.group) redirect("/");

  const [game] = await getUpcomingGames(ctx.group.id, 1);
  const view = game ? await getGameView(game.id) : null;
  if (!view) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("match.title")}</h1>
        <Notice>{t("match.noGame")}</Notice>
      </div>
    );
  }

  const canRun = ["signup", "closed", "teams", "live"].includes(view.game.status) && view.teams.length >= 2;
  if (ctx.role === "organizer" && canRun) redirect(`/game/${view.game.id}/live`);

  const data = await getMatchData(view);

  return (
    <div className="flex flex-col gap-4">
      <GameRealtime gameId={view.game.id} />
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("match.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {formatGameDate(t, view.game.starts_at, view.game.timezone)}
          {view.game.place && ` · ${view.game.place}`}
        </p>
      </header>
      {data.matches.length === 0 ? (
        <Notice>{t("match.notStartedYet")}</Notice>
      ) : (
        <MatchesOverview
          matches={data.matches}
          events={data.events}
          teams={data.teams}
          names={data.names}
          standings={data.standings}
          matchHrefBase="/match/"
          finished={view.game.status === "finished"}
        />
      )}
    </div>
  );
}
