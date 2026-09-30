import type { LiveEvent, LiveMatch, LiveTeam, StandingRow } from "./types";

/** Score from events (same rule as the SQL trigger): own goals count for the opponent. */
export function computeScore(
  match: Pick<LiveMatch, "id" | "team_a_id" | "team_b_id">,
  events: Pick<LiveEvent, "match_id" | "type" | "team_id" | "voided_at">[],
): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const e of events) {
    if (e.match_id !== match.id || e.voided_at) continue;
    if (e.type === "goal") {
      if (e.team_id === match.team_a_id) a++;
      else if (e.team_id === match.team_b_id) b++;
    } else if (e.type === "own_goal") {
      if (e.team_id === match.team_a_id) b++;
      else if (e.team_id === match.team_b_id) a++;
    }
  }
  return { a, b };
}

/**
 * Mini table of the evening (same rules as SQL game_standings):
 * finished matches only, 3/1/0 points, sorted by points, goal difference, goals for,
 * then team order.
 */
export function computeStandings(
  teams: Pick<LiveTeam, "id" | "name" | "color">[],
  matches: Pick<LiveMatch, "team_a_id" | "team_b_id" | "score_a" | "score_b" | "status">[],
): StandingRow[] {
  const order = new Map(teams.map((t, i) => [t.id, i]));
  const rows = new Map<string, StandingRow>(
    teams.map((t) => [
      t.id,
      {
        team_id: t.id, name: t.name, color: t.color,
        played: 0, won: 0, drawn: 0, lost: 0,
        goals_for: 0, goals_against: 0, goal_diff: 0, points: 0,
      },
    ]),
  );

  for (const m of matches) {
    if (m.status !== "finished") continue;
    for (const [team, gf, ga] of [
      [m.team_a_id, m.score_a, m.score_b],
      [m.team_b_id, m.score_b, m.score_a],
    ] as const) {
      const row = rows.get(team);
      if (!row) continue;
      row.played++;
      row.goals_for += gf;
      row.goals_against += ga;
      if (gf > ga) row.won++;
      else if (gf === ga) row.drawn++;
      else row.lost++;
    }
  }

  return [...rows.values()]
    .map((r) => ({ ...r, goal_diff: r.goals_for - r.goals_against, points: r.won * 3 + r.drawn }))
    .sort(
      (x, y) =>
        y.points - x.points ||
        y.goal_diff - x.goal_diff ||
        y.goals_for - x.goals_for ||
        order.get(x.team_id)! - order.get(y.team_id)!,
    );
}
