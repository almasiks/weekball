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

export const metadata: Metadata = { title: "Статистика" };

type Column = { label: string; title: string; value: (r: LeaderboardRow) => string | number };
type Tab = {
  key: string;
  label: string;
  empty: string;
  include: (r: LeaderboardRow) => boolean;
  sort: (a: LeaderboardRow, b: LeaderboardRow) => number;
  columns: Column[];
};

const matchesCol: Column = { label: "М", title: "Матчи", value: (r) => r.matches };

const TABS: Tab[] = [
  {
    key: "scorers",
    label: "Бомбардиры",
    empty: "Голов пока нет.",
    include: (r) => r.goals > 0,
    sort: (a, b) => b.goals - a.goals || a.matches - b.matches,
    columns: [
      { label: "Г", title: "Голы", value: (r) => r.goals },
      matchesCol,
      { label: "Г/М", title: "Голы за матч", value: (r) => Number(r.goals_per_match).toFixed(2) },
    ],
  },
  {
    key: "assists",
    label: "Ассистенты",
    empty: "Голевых передач пока нет.",
    include: (r) => r.assists > 0,
    sort: (a, b) => b.assists - a.assists || b.goals - a.goals,
    columns: [{ label: "П", title: "Передачи", value: (r) => r.assists }, matchesCol],
  },
  {
    key: "rating",
    label: "Рейтинг",
    empty: "Рейтинг появится после первой завершённой игры.",
    include: (r) => r.rated_games > 0,
    sort: (a, b) => b.rating - a.rating,
    columns: [
      { label: "Рейт.", title: "Рейтинг", value: (r) => r.rating },
      { label: "%В", title: "Процент побед", value: (r) => `${r.win_pct}` },
      matchesCol,
    ],
  },
  {
    key: "attendance",
    label: "Посещаемость",
    empty: "Завершённых игр пока нет.",
    include: (r) => r.finished_games > 0,
    sort: (a, b) => b.attendance_pct - a.attendance_pct || b.games_played - a.games_played,
    columns: [
      { label: "%", title: "Посещаемость", value: (r) => `${r.attendance_pct}` },
      { label: "Игр", title: "Сыграно игр", value: (r) => `${r.games_played}/${r.finished_games}` },
      { label: "Неяв.", title: "Записался, но не пришёл", value: (r) => r.no_shows },
    ],
  },
  {
    key: "cards",
    label: "Карточки",
    empty: "Карточек пока не было.",
    include: (r) => r.yellows + r.reds > 0,
    sort: (a, b) => b.reds - a.reds || b.yellows - a.yellows,
    columns: [
      { label: "🟨", title: "Жёлтые", value: (r) => r.yellows },
      { label: "🟥", title: "Красные", value: (r) => r.reds },
    ],
  },
];

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  const ctx = await getAppContext();
  if (!ctx.group) redirect("/");
  const params = await searchParams;
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
        <h1 className="text-2xl font-bold tracking-tight">Статистика</h1>
        <Link
          href="/history"
          className="flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-primary"
        >
          <History className="size-4" aria-hidden />
          История игр
        </Link>
      </header>

      <nav aria-label="Разделы статистики" className="-mx-4 overflow-x-auto px-4">
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
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Период">
        {(
          [
            ["all", "Всё время"],
            ["10", "Последние 10 игр"],
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
            <p className="py-6 text-center text-sm text-muted-foreground">{tab.empty}</p>
          ) : (
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">{tab.label}</caption>
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 text-left font-medium">Игрок</th>
                  {tab.columns.map((c) => (
                    <th key={c.label} className="w-12 text-center font-medium" title={c.title}>
                      <abbr title={c.title} className="no-underline">
                        {c.label}
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
                            {r.player_id === ctx.playerId && <span className="text-muted-foreground"> (вы)</span>}
                          </span>
                          <FormDots form={r.form} />
                        </span>
                      </Link>
                    </td>
                    {tab.columns.map((c, ci) => (
                      <td key={c.label} className={cn("text-center", ci === 0 && "font-bold")}>
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
