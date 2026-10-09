import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnterScreen } from "@/components/enter-screen";
import { GamePanel } from "@/components/game/game-panel";
import { LiveBanner } from "@/components/game/live-banner";
import { UpcomingGamesList } from "@/components/game/upcoming-games-list";
import { TeamsList } from "@/components/teams/teams-list";
import { getGameView, getUpcomingGames } from "@/lib/games";
import { getT } from "@/lib/i18n/server";
import { getMatchData } from "@/lib/match/load";
import { getAppContext } from "@/lib/session";
import { getSiteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

// Home = the next game. A device that is not known yet gets "Как тебя зовут?" instead.
export default async function HomePage() {
  const [ctx, t] = await Promise.all([getAppContext(), getT()]);
  if (!ctx.player || !ctx.group) return <EnterScreen />;

  const [upcoming, siteUrl] = await Promise.all([getUpcomingGames(ctx.group.id), getSiteUrl()]);
  const [nextGame, ...laterGames] = upcoming;
  const view = nextGame ? await getGameView(nextGame.id) : null;
  const matchData = view ? await getMatchData(view) : null;
  const liveMatch = matchData?.matches.find((m) => m.status === "live" || m.status === "break");
  const teamName = (id: string) => matchData?.teams.find((team) => team.id === id)?.name ?? "?";

  return (
    <div className="flex flex-col gap-4">
      {liveMatch && (
        <LiveBanner
          href="/match"
          match={liveMatch}
          teamA={teamName(liveMatch.team_a_id)}
          teamB={teamName(liveMatch.team_b_id)}
        />
      )}

      {view ? (
        <GamePanel view={view} userId={ctx.playerId} gameUrl={`${siteUrl}/game/${view.game.id}`} linkToGame />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <CalendarClock className="size-10 text-primary" aria-hidden />
            <p className="font-medium">{t("home.noGameTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {ctx.role === "organizer" ? t("home.noGameOrganizer") : t("home.noGamePlayer")}
            </p>
            {ctx.role === "organizer" && (
              <Link href="/admin/schedule" className={cn(buttonVariants({ variant: "outline" }), "mt-2")}>
                {t("home.scheduleLink")}
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {view?.game.teams_published_at && view.teams.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("game.lineups")}</h2>
          <TeamsList teams={view.teams} userId={ctx.playerId} />
        </section>
      )}

      {laterGames.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("home.laterGames")}</CardTitle>
          </CardHeader>
          <CardContent>
            <UpcomingGamesList games={laterGames} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
