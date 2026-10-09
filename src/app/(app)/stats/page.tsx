import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/player-avatar";
import { FormDots } from "@/components/stats/form-dots";
import { getAppContext } from "@/lib/session";
import { getLeaderboard, periodStart, type StatsPeriod } from "@/lib/stats";
import type { LeaderboardRow } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("stats.title") };
}

// `col` / `key` point at the texts: stats.col.<col>.label|title, stats.tab.<key>.label|empty
type Column = { col: string; value: (r: LeaderboardRow) => string | number };
type Tab = {
  key: string;
  include: (r: LeaderboardRow) => boolean;
  sort: (a: LeaderboardRow, b: LeaderboardRow) => number;
  columns: Column[];
};

const matchesCol: Column = { col: "matches", value: (r) => r.matches };

const TABS: Tab[] = [
  {
    key: "scorers",
    include: (r) => r.goals > 0,
    sort: (a, b) => b.goals - a.goals || a.matches - b.matches,
    columns: [
      { col: "goals", value: (r) => r.goals },
      matchesCol,
      { col: "goalsPerMatch", value: (r) => Number(r.goals_per_match).toFixed(2) },
    ],
  },
  {
    key: "assists",
    include: (r) => r.assists > 0,
    sort: (a, b) => b.assists - a.assists || b.goals - a.goals,
    columns: [{ col: "assists", value: (r) => r.assists }, matchesCol],
  },
  {
    key: "rating",
    include: (r) => r.rated_games > 0,
    sort: (a, b) => b.rating - a.rating,
    columns: [
      { col: "rating", value: (r) => r.rating },
      { col: "winPct", value: (r) => `${r.win_pct}` },
      matchesCol,
    ],
  },
  {
    key: "attendance",
    include: (r) => r.finished_games > 0,
    sort: (a, b) => b.attendance_pct - a.attendance_pct || b.games_played - a.games_played,
    columns: [
      { col: "attendance", value: (r) => `${r.attendance_pct}` },
      { col: "played", value: (r) => `${r.games_played}/${r.finished_games}` },
      { col: "noShows", value: (r) => r.no_shows },
    ],
  },
  {
    key: "cards",
    include: (r) => r.yellows + r.reds > 0,
    sort: (a, b) => b.reds - a.reds || b.yellows - a.yellows,
    columns: [
      { col: "yellows", value: (r) => r.yellows },
      { col: "reds", value: (r) => r.reds },
    ],
  },
];

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  const [ctx, tr] = await Promise.all([getAppContext(), getT()]);
  if (!ctx.group) redirect("/");
  const params = await searchParams;
  const tabText = (key: string, part: "label" | "empty") => tr(`stats.tab.${key}.${part}` as MessageKey);
  const colText = (col: string, part: "label" | "title") => tr(`stats.col.${col}.${part}` as MessageKey);
  const tab = TABS.find((t) => t.key === params.tab) ?? TABS[0];
  const period: StatsPeriod = params.period === "10" ? "10" : "all";

  const from = await periodStart(ctx.group.id, period);
  const rows = (await getLeaderboard(ctx.group.id, from)).filter(tab.include).sort(tab.sort);
  const href = (next: { tab?: string; period?: string }) => {
    const q = new URLSearchParams({ tab: next.tab ?? tab.key, period: next.period ?? period });
    return `/stats?${q}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{tr("stats.title")}</h1>
        <Link
          href="/history"
          className="flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-primary"
        >
          <History className="size-4" aria-hidden />
          {tr("cards.history")}
        </Link>
      </header>

      <nav aria-label={tr("stats.sections")} className="-mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-1.5">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={href({ tab: t.key })}
                aria-current={t.key === tab.key ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
                  t.key === tab.key ? "border-primary bg-primary text-primary-foreground" : "bg-background",
                )}
              >
                {tabText(t.key, "label")}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={tr("stats.period")}>
        {(
          [
            ["all", tr("stats.allTime")],
            ["10", tr("stats.last10")],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={href({ period: value })}
            aria-current={period === value ? "true" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-lg border text-sm font-medium",
              period === value ? "border-primary bg-primary/10 text-primary" : "bg-background",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{tabText(tab.key, "empty")}</p>
          ) : (
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">{tabText(tab.key, "label")}</caption>
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 text-left font-medium">{tr("gameStats.player")}</th>
                  {tab.columns.map((c) => (
                    <th key={c.col} className="w-12 text-center font-medium" title={colText(c.col, "title")}>
                      <abbr title={colText(c.col, "title")} className="no-underline">
                        {colText(c.col, "label")}
                      </abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => (
                  <tr key={r.player_id}>
                    <td className="max-w-0 py-1.5">
                      <Link href={`/players/${r.player_id}`} className="flex min-h-11 items-center gap-2">
                        <span className="w-5 shrink-0 text-right text-muted-foreground">{i + 1}</span>
                        <PlayerAvatar name={r.name} avatarUrl={r.avatar_url} className="size-8 text-sm" />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            {r.name}
                            {r.player_id === ctx.playerId && <span className="text-muted-foreground"> {tr("common.you")}</span>}
                          </span>
                          <FormDots form={r.form} />
                        </span>
                      </Link>
                    </td>
                    {tab.columns.map((c, ci) => (
                      <td key={c.col} className={cn("text-center", ci === 0 && "font-bold")}>
                        {c.value(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
