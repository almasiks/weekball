import { formatGameDate } from "@/lib/datetime";
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
export function gameShareText(g: ShareInput): string {
  const when = formatGameDate(g.startsAt, g.timezone);
  const where = g.place ? `, ${g.place}` : "";
  const call =
    g.status === "cancelled"
      ? "Игра отменена."
      : g.status === "signup"
        ? `Записываемся! Уже ${g.goingCount} из ${g.maxPlayers}.`
        : `Запись закрыта, в составе ${g.goingCount} из ${g.maxPlayers}.`;
  return `${when}${where}. ${call} Ссылка: ${g.url}`;
}

type TeamsShareInput = {
  startsAt: string;
  timezone: string;
  url: string;
  teams: { emoji: string; name: string; players: string[] }[];
};

// "Составы на Сб, 4 окт, 19:00:\n🔴 Красные: Иван, Пётр\n🔵 Синие: …\nСсылка: …"
export function teamsShareText(input: TeamsShareInput): string {
  const lines = input.teams.map(
    (t) => `${t.emoji} ${t.name}: ${t.players.length ? t.players.join(", ") : "—"}`,
  );
  return [
    `Составы на ${formatGameDate(input.startsAt, input.timezone)}:`,
    ...lines,
    `Ссылка: ${input.url}`,
  ].join("\n");
}

type ResultTeam = { id: string; name: string; color: string };
type ResultMatch = { id: string; team_a_id: string; team_b_id: string; score_a: number; score_b: number; status: string };
type ResultEvent = { match_id: string; type: string; team_id: string; player_id: string };

function scorersLine(
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
      own.push(`автогол (${names[e.player_id] ?? "?"})`);
    }
  }
  const parts = [...[...counts].map(([n, c]) => (c > 1 ? `${n} ${c}` : n)), ...own];
  return parts.length ? `${teamColor(team.color).emoji} ${team.name}: ${parts.join(", ")}` : null;
}

// "⚽ Красные 3:2 Синие\n🔴 Красные: Иван 2, Пётр\n🔵 Синие: …\nСсылка: …"
export function matchResultText(input: {
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
  const status = match.status === "finished" ? "" : " (идёт матч)";
  return [
    `⚽ ${a.name} ${match.score_a}:${match.score_b} ${b.name}${status}`,
    scorersLine(a, b.id, events, names),
    scorersLine(b, a.id, events, names),
    `Ссылка: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// Results of every match + the table of the evening.
export function gameSummaryText(input: {
  startsAt: string;
  timezone: string;
  teams: ResultTeam[];
  matches: ResultMatch[];
  standings: { name: string; color: string; points: number; goals_for: number; goals_against: number }[];
  url: string;
}): string {
  const byId = new Map(input.teams.map((t) => [t.id, t]));
  const results = input.matches
    .filter((m) => m.status === "finished")
    .map((m) => `${byId.get(m.team_a_id)?.name} ${m.score_a}:${m.score_b} ${byId.get(m.team_b_id)?.name}`);
  const table = input.standings.map(
    (s, i) =>
      `${i + 1}. ${teamColor(s.color).emoji} ${s.name} — ${s.points} очк. (${s.goals_for}:${s.goals_against})`,
  );
  return [
    `⚽ Итоги: ${formatGameDate(input.startsAt, input.timezone)}`,
    ...results,
    "",
    "Таблица:",
    ...table,
    "",
    `Ссылка: ${input.url}`,
  ].join("\n");
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
