import { formatGameDate } from "@/lib/datetime";
import type { T } from "@/lib/i18n";
import { teamColor } from "@/lib/teams/colors";
import type { GameStatus } from "@/lib/supabase/database.types";

type ShareInput = {
  startsAt: string;
  timezone: string;
  place: string;
  status: GameStatus;
  goingCount: number;
  maxPlayers: number;
  url: string;
};

// "Сб, 4 окт, 19:00, Поле на Абая. Записываемся! Уже 12 из 20. Ссылка: …"
export function gameShareText(t: T, g: ShareInput): string {
  const when = formatGameDate(t, g.startsAt, g.timezone);
  const where = g.place ? `, ${g.place}` : "";
  const call =
    g.status === "cancelled"
      ? t("share.gameCancelled")
      : t(g.status === "signup" ? "share.gameSignup" : "share.gameClosed", { going: g.goingCount, max: g.maxPlayers });
  return `${when}${where}. ${call} ${t("common.link", { url: g.url })}`;
}

type TeamsShareInput = {
  startsAt: string;
  timezone: string;
  url: string;
  teams: { emoji: string; name: string; players: string[] }[];
};

// "Составы на Сб, 4 окт, 19:00:\n🔴 Красные: Иван, Пётр\n🔵 Синие: …\nСсылка: …"
export function teamsShareText(t: T, input: TeamsShareInput): string {
  const lines = input.teams.map(
    (t) => `${t.emoji} ${t.name}: ${t.players.length ? t.players.join(", ") : "—"}`,
  );
  return [
    t("share.teamsTitle", { when: formatGameDate(t, input.startsAt, input.timezone) }),
    ...lines,
    t("common.link", { url: input.url }),
  ].join("\n");
}

type ResultTeam = { id: string; name: string; color: string };
type ResultMatch = { id: string; team_a_id: string; team_b_id: string; score_a: number; score_b: number; status: string };
type ResultEvent = { match_id: string; type: string; team_id: string; player_id: string };

function scorersLine(
  t: T,
  team: ResultTeam,
  opponentId: string,
  events: ResultEvent[],
  names: Record<string, string>,
): string | null {
  const counts = new Map<string, number>();
  const own: string[] = [];
  for (const e of events) {
    if (e.type === "goal" && e.team_id === team.id) {
      const name = names[e.player_id] ?? "?";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    } else if (e.type === "own_goal" && e.team_id === opponentId) {
      own.push(t("share.ownGoal", { name: names[e.player_id] ?? "?" }));
    }
  }
  const parts = [...[...counts].map(([n, c]) => (c > 1 ? `${n} ${c}` : n)), ...own];
  return parts.length ? `${teamColor(team.color).emoji} ${team.name}: ${parts.join(", ")}` : null;
}

// "⚽ Красные 3:2 Синие\n🔴 Красные: Иван 2, Пётр\n🔵 Синие: …\nСсылка: …"
export function matchResultText(t: T, input: {
  match: ResultMatch;
  teams: ResultTeam[];
  events: ResultEvent[];
  names: Record<string, string>;
  url: string;
}): string {
  const { match, teams, url, names } = input;
  const a = teams.find((t) => t.id === match.team_a_id);
  const b = teams.find((t) => t.id === match.team_b_id);
  if (!a || !b) return url;
  const events = input.events.filter((e) => e.match_id === match.id);
  const status = match.status === "finished" ? "" : ` ${t("share.matchLive")}`;
  return [
    `⚽ ${a.name} ${match.score_a}:${match.score_b} ${b.name}${status}`,
    scorersLine(t, a, b.id, events, names),
    scorersLine(t, b, a.id, events, names),
    t("common.link", { url }),
  ]
    .filter(Boolean)
    .join("\n");
}

// Results of every match + the table of the evening.
export function gameSummaryText(t: T, input: {
  startsAt: string;
  timezone: string;
  teams: ResultTeam[];
  matches: ResultMatch[];
  standings: { name: string; color: string; points: number; goals_for: number; goals_against: number }[];
  url: string;
  mvp?: string | null;
  topScorers?: { name: string; goals: number }[];
}): string {
  const scorers = input.topScorers ?? [];
  const extras = [
    input.mvp ? t("share.mvp", { name: input.mvp }) : null,
    scorers.length
      ? t("share.topScorer", { names: scorers.map((s) => s.name).join(", "), goals: scorers[0].goals })
      : null,
  ].filter((l): l is string => l !== null);
  const byId = new Map(input.teams.map((t) => [t.id, t]));
  const results = input.matches
    .filter((m) => m.status === "finished")
    .map((m) => `${byId.get(m.team_a_id)?.name} ${m.score_a}:${m.score_b} ${byId.get(m.team_b_id)?.name}`);
  const table = input.standings.map(
    (s, i) =>
      `${i + 1}. ${teamColor(s.color).emoji} ${s.name} — ${t("share.points", { points: s.points })} (${s.goals_for}:${s.goals_against})`,
  );
  return [
    t("share.summaryTitle", { when: formatGameDate(t, input.startsAt, input.timezone) }),
    ...results,
    "",
    t("share.table"),
    ...table,
    ...(extras.length ? ["", ...extras] : []),
    "",
    t("common.link", { url: input.url }),
  ].join("\n");
}

type BestPlayer = { name: string; goals: number; assists: number; wins: number };

// "🏅 Лучшие игроки: Сб, 4 окт, 19:00\n⭐ Игрок вечера: Иван\n1. Иван — 3 ⚽, 1 🅰️, 2 победы\n…"
export function bestPlayersText(t: T, input: {
  startsAt: string;
  timezone: string;
  mvp: string | null;
  players: BestPlayer[];
  url: string;
}): string {
  const line = (p: BestPlayer, i: number) => {
    const parts = [
      p.goals ? `${p.goals} ⚽` : null,
      p.assists ? `${p.assists} 🅰️` : null,
      p.wins ? t("share.wins", { count: p.wins }) : null,
    ].filter(Boolean);
    return `${i + 1}. ${p.name}${parts.length ? ` — ${parts.join(", ")}` : ""}`;
  };
  return [
    t("share.bestTitle", { when: formatGameDate(t, input.startsAt, input.timezone) }),
    input.mvp ? t("share.mvp", { name: input.mvp }) : null,
    ...input.players.map(line),
    "",
    t("common.link", { url: input.url }),
  ]
    .filter((l) => l !== null)
    .join("\n");
}

// Ranking for "Лучшие игроки": goals + assists, then wins, then fewer own goals.
export function rankBestPlayers<T extends BestPlayer & { own_goals: number }>(rows: T[], limit = 5): T[] {
  return [...rows]
    .filter((r) => r.goals + r.assists + r.wins > 0)
    .sort(
      (a, b) =>
        b.goals + b.assists - (a.goals + a.assists) ||
        b.goals - a.goals ||
        b.wins - a.wins ||
        a.own_goals - b.own_goals,
    )
    .slice(0, limit);
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
