import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatGameDate, utcToZonedInputs } from "@/lib/datetime";
import { getAppContext, getGroupMembers } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { teamColor } from "@/lib/teams/colors";

export const metadata: Metadata = { title: "Результаты всех игр" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ResultsPage({ searchParams }: PageProps<"/results">) {
  const ctx = await getAppContext();
  if (!ctx.group) redirect("/");

  const sp = await searchParams;
  const from = DATE.test(one(sp.from)) ? one(sp.from) : "";
  const to = DATE.test(one(sp.to)) ? one(sp.to) : "";
  const player = UUID.test(one(sp.player)) ? one(sp.player) : "";

  const supabase = await createClient();
  const [{ data: games, error }, members, playerGames] = await Promise.all([
    supabase.rpc("game_history", { p_group_id: ctx.group.id, p_limit: 500 }),
    getGroupMembers(ctx.group.id),
    player
      ? supabase.from("team_players").select("game_id").eq("player_id", player)
      : Promise.resolve({ data: null }),
  ]);
  if (error) throw error;

  const playedIn = playerGames.data ? new Set(playerGames.data.map((r) => r.game_id)) : null;
  const list = (games ?? []).filter((g) => {
    const day = utcToZonedInputs(g.starts_at, g.timezone).date;
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (playedIn && !playedIn.has(g.game_id)) return false;
    return true;
  });
  const sortedMembers = [...members].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const filtered = Boolean(from || to || player);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/stats"
        className="-ml-2 flex min-h-11 w-fit items-center gap-1 px-2 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Статистика
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Результаты всех игр</h1>

      <form method="get" className="flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="results-from">С даты</Label>
            <Input id="results-from" name="from" type="date" defaultValue={from} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="results-to">По дату</Label>
            <Input id="results-to" name="to" type="date" defaultValue={to} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="results-player">Игрок</Label>
          <select
            id="results-player"
            name="player"
            defaultValue={player}
            className="h-11 rounded-lg border bg-background px-3 text-base"
          >
            <option value="">Все игроки</option>
            {sortedMembers.map((m) => (
              <option key={m.playerId} value={m.playerId}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {filtered ? (
            <Link href="/results" className={buttonVariants({ variant: "outline" })}>
              Сбросить
            </Link>
          ) : (
            <span />
          )}
          <Button type="submit">Показать</Button>
        </div>
      </form>

      <p className="text-sm text-muted-foreground">Найдено игр: {list.length}</p>

      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {filtered ? "По этим фильтрам игр нет." : "Завершённых игр пока нет."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((g) => (
            <li key={g.game_id}>
              <Card size="sm">
                <CardContent>
                  <Link href={`/game/${g.game_id}`} className="flex items-start gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="font-semibold">
                        {formatGameDate(g.starts_at, g.timezone)}
                        {g.place && <span className="font-normal text-muted-foreground"> · {g.place}</span>}
                      </span>
                      <ul className="flex flex-col gap-0.5 text-sm">
                        {g.matches.map((m, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <Dot color={m.color_a} />
                            <span className="truncate">{m.team_a}</span>
                            <span className="font-semibold tabular-nums">
                              {m.score_a}:{m.score_b}
                            </span>
                            <span className="truncate">{m.team_b}</span>
                            <Dot color={m.color_b} />
                          </li>
                        ))}
                      </ul>
                    </div>
                    <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full border border-foreground/20"
      style={{ backgroundColor: teamColor(color).hex }}
    />
  );
}
