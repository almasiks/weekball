import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, MessageCircle, Swords, Timer, Users } from "lucide-react";
import { MatchesOverview } from "@/components/match/matches-overview";
import { RecalcButton } from "@/components/stats/recalc-button";
import { GameFormatEditor } from "@/components/game/game-format-editor";
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Open Graph for WhatsApp: server-side, no player names (crawlers aren't signed in).
export async function generateMetadata({
  params,
}: PageProps<"/game/[id]">): Promise<Metadata> {
  const { id } = await params;
  const preview = await getGamePreview(id);
  if (!preview) return { title: "Игра" };

  const when = formatGameDate(preview.startsAt, preview.timezone);
  const title = `${preview.groupName}: ${when}`;
  const status =
    preview.status === "cancelled"
      ? "Игра отменена"
      : `Записано ${preview.goingCount} из ${preview.maxPlayers}`;
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
  const ctx = await getAppContext();
  const view = UUID.test(id) && ctx.userId ? await getGameView(id) : null;

  if (!view) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Игра недоступна</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Notice>
            {ctx.group
              ? "Эта игра не найдена или относится к другой группе."
              : "Чтобы записаться, откройте ссылку-приглашение в группу из чата WhatsApp, а потом эту ссылку ещё раз."}
          </Notice>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            На главную
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

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/"
        className="-ml-2 flex min-h-11 w-fit items-center gap-1 px-2 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        На главную
      </Link>
      <GamePanel
        view={view}
        userId={ctx.userId}
        gameUrl={`${siteUrl}/game/${view.game.id}`}
      />

      {isOrganizer && teamsEditable && (
        <GameFormatEditor
          gameId={view.game.id}
          goalLimit={view.game.goal_limit}
          matchMinutes={view.game.match_minutes}
          autoSounds={view.game.auto_sounds}
        />
      )}

      {isOrganizer && canRunMatch && (
        <Link
          href={`/game/${id}/live`}
          className={cn(buttonVariants({ size: "lg" }), "h-14 w-full text-base")}
        >
          <Timer aria-hidden />
          {view.game.status === "live" ? "Вести матч" : "Начать матч"}
        </Link>
      )}

      {isOrganizer && view.game.status === "finished" && (
        <Link
          href={`/game/${id}/live`}
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          <Timer aria-hidden />
          Исправить события
        </Link>
      )}

      {isOrganizer && view.game.status === "finished" && !view.game.stats_processed_at && (
        <Notice variant="error">
          <div className="flex flex-col gap-2">
            <span>Статистика и рейтинги по этой игре не обновлены.</span>
            <RecalcButton gameId={view.game.id} />
          </div>
        </Notice>
      )}

      {matchData.matches.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            {view.game.status === "finished" ? "Итоги" : "Матчи"}
          </h2>
          {topScorers.length > 0 && (
            <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span aria-hidden>🏆</span>
              <span>
                Лучший бомбардир вечера:{" "}
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
                gameSummaryText({
                  startsAt: view.game.starts_at,
                  timezone: view.game.timezone,
                  teams: matchData.teams,
                  matches: matchData.matches,
                  standings: matchData.standings,
                  url: `${siteUrl}/game/${id}`,
                }),
              )}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants(), "w-full bg-[#075E54] text-white hover:bg-[#064c44]")}
            >
              <MessageCircle aria-hidden />
              Поделиться итогами
            </a>
          )}
        </section>
      )}

      {view.game.draft_active && (
        <Link href={`/game/${id}/teams`} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
          <Swords aria-hidden />
          Идёт драфт — смотреть
        </Link>
      )}

      {isOrganizer && !view.game.draft_active && teamsEditable && (
        <Link
          href={`/game/${id}/teams`}
          className={cn(buttonVariants({ size: "lg", variant: "secondary" }), "w-full")}
        >
          <Users aria-hidden />
          {view.teams.length ? "Команды" : "Разделить на команды"}
        </Link>
      )}

      {view.game.teams_published_at && view.teams.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Составы</h2>
          <TeamsList teams={view.teams} userId={ctx.userId} />
          <ShareTeamsButton
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

      {isOrganizer && (
        <>
          <OrganizerControls gameId={view.game.id} status={view.game.status} />
          <ArrivalOverview going={view.going} />
        </>
      )}
    </div>
  );
}
