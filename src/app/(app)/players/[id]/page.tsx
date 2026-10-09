import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/notice";
import { PlayerAvatar } from "@/components/player-avatar";
import { FormDots } from "@/components/stats/form-dots";
import { RatingChart } from "@/components/stats/rating-chart";
import { formatGameDate, DEFAULT_TIMEZONE } from "@/lib/datetime";
import { positionLabel } from "@/lib/positions";
import { getAppContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { LeaderboardRow, PlayerPosition } from "@/lib/supabase/database.types";
import { teamColor } from "@/lib/teams/colors";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("stats.playerTitle") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Profile = {
  player: {
    id: string;
    name: string;
    avatar_url: string | null;
    position: PlayerPosition | null;
    level: number;
    rating: number;
    rated_games: number;
  };
  totals: LeaderboardRow | null;
  rating_history: { game_id: string; starts_at: string; rating_before: number; rating_after: number; delta: number }[];
  recent_matches: {
    match_id: string;
    starts_at: string;
    result: "W" | "D" | "L";
    goals_for: number;
    goals_against: number;
    goals: number;
    assists: number;
    team_name: string;
    team_color: string;
    opponent_name: string;
    opponent_color: string;
  }[];
};

const RESULT = {
  W: { className: "bg-emerald-600 text-white" },
  D: { className: "bg-neutral-400 text-neutral-950" },
  L: { className: "bg-red-600 text-white" },
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-muted/60 px-2 py-2.5">
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="text-center text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default async function PlayerPage({ params }: PageProps<"/players/[id]">) {
  const { id } = await params;
  const [ctx, tr] = await Promise.all([getAppContext(), getT()]);
  if (!ctx.group) redirect("/");

  let profile: Profile | null = null;
  if (UUID.test(id)) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("player_profile", { p_group_id: ctx.group.id, p_player_id: id });
    profile = (data as Profile | null) ?? null;
  }

  if (!profile?.player) {
    return (
      <div className="flex flex-col gap-4">
        <Notice>{tr("stats.playerNotFound")}</Notice>
        <Link href="/stats" className={buttonVariants({ variant: "outline" })}>
          {tr("stats.toStats")}
        </Link>
      </div>
    );
  }

  const { player, totals: t, rating_history, recent_matches } = profile;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/stats"
        className="-ml-2 flex min-h-11 w-fit items-center gap-1 px-2 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {tr("stats.title")}
      </Link>

      <header className="flex items-center gap-3">
        <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} className="size-16 text-2xl" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {player.name}
            {player.id === ctx.playerId && <span className="text-base font-normal text-muted-foreground"> {tr("common.you")}</span>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tr("stats.positionLevel", { position: positionLabel(tr, player.position), level: player.level })}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-2xl font-bold tabular-nums">{player.rating}</span>
          <span className="text-xs text-muted-foreground">{tr("stats.rating")}</span>
        </div>
      </header>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{tr("stats.ratingByGames")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RatingChart history={rating_history} />
        </CardContent>
      </Card>

      {t && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              {tr("game.results")}
              <FormDots form={t.form} />
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            <Stat label={tr("stats.statMatches")} value={t.matches} />
            <Stat label={tr("stats.statWdl")} value={`${t.wins}/${t.draws}/${t.losses}`} />
            <Stat label={tr("stats.statWinPct")} value={`${t.win_pct}%`} />
            <Stat label={tr("stats.statGoals")} value={t.goals} />
            <Stat label={tr("stats.statAssists")} value={t.assists} />
            <Stat label={tr("stats.statGoalsPerMatch")} value={Number(t.goals_per_match).toFixed(2)} />
            <Stat label={tr("stats.statAttendance")} value={`${t.attendance_pct}%`} />
            <Stat label={tr("stats.statGamesPlayed")} value={`${t.games_played}/${t.finished_games}`} />
            <Stat label={tr("stats.statCards")} value={`${t.yellows}🟨 ${t.reds}🟥`} />
            {t.no_shows > 0 && (
              <p className="col-span-3 text-xs text-muted-foreground">
                {tr("stats.noShows", { count: t.no_shows })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card size="sm">
        <CardHeader>
          <CardTitle>{tr("stats.recentMatches")}</CardTitle>
        </CardHeader>
        <CardContent>
          {recent_matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("stats.noMatches")}</p>
          ) : (
            <ul className="divide-y">
              {recent_matches.map((m) => (
                <li key={m.match_id}>
                  <Link href={`/match/${m.match_id}`} className="flex min-h-12 items-center gap-2 py-1.5">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded text-xs font-bold",
                        RESULT[m.result].className,
                      )}
                      aria-label={tr(`stats.result.${m.result}.title` as MessageKey)}
                    >
                      {tr(`stats.result.${m.result}.label` as MessageKey)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        <Dot color={m.team_color} /> {m.team_name}{" "}
                        <span className="tabular-nums">
                          {m.goals_for}:{m.goals_against}
                        </span>{" "}
                        {m.opponent_name} <Dot color={m.opponent_color} />
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatGameDate(tr, m.starts_at, DEFAULT_TIMEZONE)}
                        {m.goals > 0 && ` · ⚽ ${m.goals}`}
                        {m.assists > 0 && tr("stats.assistsShort", { count: m.assists })}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 rounded-full border border-foreground/20 align-middle"
      style={{ backgroundColor: teamColor(color).hex }}
    />
  );
}
