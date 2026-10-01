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

export const metadata: Metadata = { title: "Игрок" };

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
  W: { label: "В", className: "bg-emerald-600 text-white" },
  D: { label: "Н", className: "bg-neutral-400 text-neutral-950" },
  L: { label: "П", className: "bg-red-600 text-white" },
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
  const ctx = await getAppContext();
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
        <Notice>Игрок не найден в вашей группе.</Notice>
        <Link href="/stats" className={buttonVariants({ variant: "outline" })}>
          К статистике
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
        Статистика
      </Link>

      <header className="flex items-center gap-3">
        <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} className="size-16 text-2xl" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {player.name}
            {player.id === ctx.playerId && <span className="text-base font-normal text-muted-foreground"> (вы)</span>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {positionLabel(player.position)} · уровень {player.level}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-2xl font-bold tabular-nums">{player.rating}</span>
          <span className="text-xs text-muted-foreground">рейтинг</span>
        </div>
      </header>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Рейтинг по играм</CardTitle>
        </CardHeader>
        <CardContent>
          <RatingChart history={rating_history} />
        </CardContent>
      </Card>

      {t && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              Итоги
              <FormDots form={t.form} />
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            <Stat label="матчей" value={t.matches} />
            <Stat label="В / Н / П" value={`${t.wins}/${t.draws}/${t.losses}`} />
            <Stat label="% побед" value={`${t.win_pct}%`} />
            <Stat label="голов" value={t.goals} />
            <Stat label="передач" value={t.assists} />
            <Stat label="голов за матч" value={Number(t.goals_per_match).toFixed(2)} />
            <Stat label="посещаемость" value={`${t.attendance_pct}%`} />
            <Stat label="игр сыграно" value={`${t.games_played}/${t.finished_games}`} />
            <Stat label="карточки" value={`${t.yellows}🟨 ${t.reds}🟥`} />
            {t.no_shows > 0 && (
              <p className="col-span-3 text-xs text-muted-foreground">
                Записывался, но не пришёл: {t.no_shows}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Последние матчи</CardTitle>
        </CardHeader>
        <CardContent>
          {recent_matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Сыгранных матчей пока нет.</p>
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
                      aria-label={{ W: "победа", D: "ничья", L: "поражение" }[m.result]}
                    >
                      {RESULT[m.result].label}
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
                        {formatGameDate(m.starts_at, DEFAULT_TIMEZONE)}
                        {m.goals > 0 && ` · ⚽ ${m.goals}`}
                        {m.assists > 0 && ` · пас ${m.assists}`}
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
