import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, MessageCircle, Swords, Timer, UserCheck, Users } from "lucide-react";
import { MatchesOverview } from "@/components/match/matches-overview";
import { RecalcButton } from "@/components/stats/recalc-button";
import { GameCards } from "@/components/game/game-cards";
import { GameStatsTable } from "@/components/game/game-stats-table";
import { createClient } from "@/lib/supabase/server";
import { getMatchData } from "@/lib/match/load";
import { gameSummaryText, whatsappUrl } from "@/lib/share";
import { ShareTeamsButton } from "@/components/teams/share-teams-button";
import { TeamsList } from "@/components/teams/teams-list";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/notice";
import { ArrivalOverview } from "@/components/game/arrival-overview";
import { GamePanel } from "@/components/game/game-panel";
import { OrganizerControls } from "@/components/game/organizer-controls";
import { formatGameDate } from "@/lib/datetime";
import { getGamePreview, getGameView } from "@/lib/games";
import { getAppContext } from "@/lib/session";
import { getSiteUrl } from "@/lib/site-url";
import { getT } from "@/lib/i18n/server";
import { EnterScreen } from "@/components/enter-screen";

const organizerTile =
  "flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl bg-card p-2 text-center text-xs font-medium ring-1 ring-foreground/10 hover:bg-muted/60";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Open Graph for WhatsApp: server-side, no player names (crawlers aren't signed in).
export async function generateMetadata({
  params,
}: PageProps<"/game/[id]">): Promise<Metadata> {
  const { id } = await params;
  const [preview, t] = await Promise.all([getGamePreview(id), getT()]);
  if (!preview) return { title: t("game.metaTitle") };

  const when = formatGameDate(t, preview.startsAt, preview.timezone);
  const title = `${preview.groupName}: ${when}`;
  const status =
    preview.status === "cancelled"
      ? t("status.cancelled")
      : t("game.ogSigned", { going: preview.goingCount, max: preview.maxPlayers });
  const description = [preview.place, status].filter(Boolean).join(" · ");

  return {
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${await getSiteUrl()}/game/${id}`,
      siteName: "Weekly Football",
      locale: "ru_RU",
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function GamePage({ params }: PageProps<"/game/[id]">) {
  const { id } = await params;
  const [ctx, t] = await Promise.all([getAppContext(), getT()]);
  // Opened from a shared link on a new device: ask the name here, then show this game.
  if (!ctx.player) return <EnterScreen />;
  const view = UUID.test(id) ? await getGameView(id) : null;

  if (!view) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("game.unavailableTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Notice>{t("game.unavailableMember")}</Notice>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            {t("common.home")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  const isOrganizer =
    ctx.role === "organizer" && ctx.group?.id === view.game.group_id;
  const teamsEditable = ["signup", "closed", "teams", "live"].includes(view.game.status);
  const canRunMatch = teamsEditable && view.teams.length >= 2;
  const matchData = await getMatchData(view);
  const supabase = await createClient();
  const topScorers = matchData.matches.some((m) => m.status === "finished")
    ? ((await supabase.rpc("game_top_scorers", { p_game_id: view.game.id })).data ?? [])
    : [];
  const siteUrl = await getSiteUrl();
  const playerStats = view.teams.length
    ? ((await supabase.rpc("game_player_stats", { p_game_id: view.game.id })).data ?? [])
    : [];
  const creatorName = view.game.created_by
    ? ((await supabase.from("players").select("name").eq("id", view.game.created_by).maybeSingle()).data?.name ?? null)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/"
        className="-ml-2 flex min-h-11 w-fit items-center gap-1 px-2 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t("common.home")}
      </Link>
      <GamePanel
        view={view}
        userId={ctx.playerId}
        gameUrl={`${siteUrl}/game/${view.game.id}`}
      />

      {isOrganizer && teamsEditable && (
        <nav aria-label={t("game.organizerNav")} className="grid grid-cols-3 gap-2">
          <Link href={`/game/${id}/checkin`} className={organizerTile}>
            <UserCheck className="size-5" aria-hidden />
            {t("game.checkin")}
          </Link>
          <Link href={`/game/${id}/teams`} className={organizerTile}>
            <Users className="size-5" aria-hidden />
            {view.teams.length ? t("game.teams") : t("game.makeTeams")}
          </Link>
          {canRunMatch ? (
            <Link href={`/game/${id}/live`} className={cn(organizerTile, "bg-primary text-primary-foreground hover:bg-primary/90")}>
              <Timer className="size-5" aria-hidden />
              {view.game.status === "live" ? t("game.runMatch") : t("game.match")}
            </Link>
          ) : (
            <span className={cn(organizerTile, "text-muted-foreground opacity-60")} aria-disabled="true">
              <Timer className="size-5" aria-hidden />
              {t("game.matchAfterTeams")}
            </span>
          )}
        </nav>
      )}

      {isOrganizer && view.game.status === "finished" && (
        <Link
          href={`/game/${id}/live`}
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          <Timer aria-hidden />
          {t("game.fixEvents")}
        </Link>
      )}

      {isOrganizer && view.game.status === "finished" && !view.game.stats_processed_at && (
        <Notice variant="error">
          <div className="flex flex-col gap-2">
            <span>{t("game.statsStale")}</span>
            <RecalcButton gameId={view.game.id} />
          </div>
        </Notice>
      )}

      {matchData.matches.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            {view.game.status === "finished" ? t("game.results") : t("game.matches")}
          </h2>
          {topScorers.length > 0 && (
            <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span aria-hidden>🏆</span>
              <span>
                {t("game.topScorer")}{" "}
                {topScorers.map((s, i) => (
                  <span key={s.player_id}>
                    {i > 0 && ", "}
                    <Link href={`/players/${s.player_id}`} className="font-semibold underline-offset-2 hover:underline">
                      {s.name}
                    </Link>
                  </span>
                ))}{" "}
                — {topScorers[0].goals} ⚽
              </span>
            </p>
          )}
          <MatchesOverview
            matches={matchData.matches}
            events={matchData.events}
            teams={matchData.teams}
            names={matchData.names}
            standings={matchData.standings}
            matchHrefBase="/match/"
            finished={view.game.status === "finished"}
          />
          {matchData.matches.some((m) => m.status === "finished") && (
            <a
              href={whatsappUrl(
                gameSummaryText(t, {
                  startsAt: view.game.starts_at,
                  timezone: view.game.timezone,
                  teams: matchData.teams,
                  matches: matchData.matches,
                  standings: matchData.standings,
                  url: `${siteUrl}/game/${id}`,
                  mvp: playerStats.find((s) => s.player_id === view.game.mvp_player_id)?.name ?? null,
                  topScorers,
                }),
              )}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants(), "w-full bg-[#075E54] text-white hover:bg-[#064c44]")}
            >
              <MessageCircle aria-hidden />
              {t("game.shareResults")}
            </a>
          )}
        </section>
      )}

      {view.game.draft_active && (
        <Link href={`/game/${id}/teams`} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
          <Swords aria-hidden />
          {t("game.draftRunning")}
        </Link>
      )}


      {view.game.teams_published_at && view.teams.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("game.lineups")}</h2>
          <TeamsList teams={view.teams} userId={ctx.playerId} />
          <ShareTeamsButton
            t={t}
            startsAt={view.game.starts_at}
            timezone={view.game.timezone}
            url={`${siteUrl}/game/${id}`}
            teams={view.teams.map((t) => ({
              emoji: t.color.emoji,
              name: t.team.name,
              players: t.players.map((p) => p.name),
            }))}
          />
        </section>
      )}

      {view.teams.length > 0 && <GameStatsTable rows={playerStats} mvpId={view.game.mvp_player_id} />}

      <GameCards
        game={{
          id: view.game.id,
          title: view.game.title,
          startsAt: view.game.starts_at,
          timezone: view.game.timezone,
          place: view.game.place,
          status: view.game.status,
          maxPlayers: view.game.max_players,
          goalLimit: view.game.goal_limit,
          matchMinutes: view.game.match_minutes,
          periods: view.game.match_periods,
          autoSounds: view.game.auto_sounds,
          liveToken: isOrganizer ? view.game.live_token : null,
          mvpId: view.game.mvp_player_id,
        }}
        stats={playerStats}
        isOrganizer={isOrganizer}
        teamCount={view.teams.length}
        teamsEditable={teamsEditable}
        goingCount={view.going.length}
        presentCount={view.going.filter((s) => s.arrival === "arrived").length}
        creatorName={creatorName}
        siteUrl={siteUrl}
      />

      {isOrganizer && (
        <>
          <OrganizerControls gameId={view.game.id} status={view.game.status} />
          <ArrivalOverview going={view.going} />
        </>
      )}
    </div>
  );
}
