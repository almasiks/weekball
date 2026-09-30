import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatGameDate } from "@/lib/datetime";
import { getAppContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { teamColor } from "@/lib/teams/colors";

export const metadata: Metadata = { title: "История игр" };

export default async function HistoryPage() {
  const ctx = await getAppContext();
  if (!ctx.group) redirect("/");

  const supabase = await createClient();
  const { data: games, error } = await supabase.rpc("game_history", { p_group_id: ctx.group.id });
  if (error) throw error;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/stats"
        className="-ml-2 flex min-h-11 w-fit items-center gap-1 px-2 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Статистика
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">История игр</h1>

      {!games?.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Завершённых игр пока нет. Они появятся здесь после «Завершить игру».
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {games.map((g) => (
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
                      {g.top_scorers.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Лучший бомбардир: {g.top_scorers.map((s) => s.name).join(", ")} ⚽{" "}
                          {g.top_scorers[0].goals}
                        </span>
                      )}
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
