import { describe, expect, it } from "vitest";
import {
  balanceTeams,
  strengthGapPercent,
  suggestTeamCount,
  teamSizes,
  type BalancePlayer,
  type Position,
} from "./balance";

// 20 realistic players: 2 goalkeepers, levels 1–5.
const LEVELS = [5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 4];
const POSITIONS: Position[] = [
  "gk", "fwd", "def", "mid", "fwd", "def", "mid", "mid", "def", "fwd",
  "gk", "def", "mid", null, "fwd", "def", "mid", "fwd", null, "mid",
];

function squad(count: number): BalancePlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    position: POSITIONS[i],
    strength: LEVELS[i],
  }));
}

const byId = (players: BalancePlayer[]) => new Map(players.map((p) => [p.id, p]));

describe("teamSizes / suggestTeamCount", () => {
  it("splits sizes with a difference of at most 1", () => {
    expect(teamSizes(17, 2)).toEqual([9, 8]);
    expect(teamSizes(17, 3)).toEqual([6, 6, 5]);
  });

  it("suggests 2 teams for 14–17 and 3 for 18–20", () => {
    expect(suggestTeamCount(14).recommended).toBe(2);
    expect(suggestTeamCount(16).options.map((o) => o.teams)).toEqual([2, 3]);
    expect(suggestTeamCount(18).recommended).toBe(3);
    expect(suggestTeamCount(8).options.map((o) => o.teams)).toEqual([2]);
  });
});

describe("balanceTeams", () => {
  for (const [count, teamCount] of [
    [16, 2],
    [17, 2],
    [18, 3],
    [19, 3],
    [20, 2],
  ] as const) {
    it(`${count} players / ${teamCount} teams: sizes, everyone placed once, gap <= 10%`, () => {
      const players = squad(count);
      for (let seed = 1; seed <= 30; seed++) {
        const { teams, strengths } = balanceTeams({ players, teamCount, seed });
        const sizes = teams.map((t) => t.length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        expect(teams.flat().sort()).toEqual(players.map((p) => p.id).sort());
        expect(strengthGapPercent(strengths)).toBeLessThanOrEqual(10);
      }
    });
  }

  it("puts one goalkeeper in each team when there are enough", () => {
    const players = squad(18);
    players[5].position = "gk"; // 3 goalkeepers for 3 teams
    const lookup = byId(players);
    for (let seed = 1; seed <= 20; seed++) {
      const { teams } = balanceTeams({ players, teamCount: 3, seed });
      for (const team of teams) {
        expect(team.filter((id) => lookup.get(id)!.position === "gk")).toHaveLength(1);
      }
    }
  });

  it("never puts two goalkeepers together when there are fewer keepers than teams", () => {
    const players = squad(18); // 2 goalkeepers, 3 teams
    const lookup = byId(players);
    const { teams } = balanceTeams({ players, teamCount: 3, seed: 7 });
    const gkPerTeam = teams.map((t) => t.filter((id) => lookup.get(id)!.position === "gk").length);
    expect(Math.max(...gkPerTeam)).toBe(1);
  });

  it("keeps locked players in their teams", () => {
    const players = squad(18);
    const locked = { p1: 0, p2: 0, p3: 1, p17: 1 };
    for (let seed = 1; seed <= 20; seed++) {
      const { teams } = balanceTeams({ players, teamCount: 2, locked, seed });
      expect(teams[0]).toEqual(expect.arrayContaining(["p1", "p2"]));
      expect(teams[1]).toEqual(expect.arrayContaining(["p3", "p17"]));
    }
  });

  it("is reproducible for the same seed", () => {
    const players = squad(18);
    const a = balanceTeams({ players, teamCount: 2, seed: 42 });
    const b = balanceTeams({ players, teamCount: 2, seed: 42 });
    expect(a).toEqual(b);
  });

  it("gives different splits for different seeds", () => {
    const players = squad(18);
    const signatures = new Set(
      Array.from({ length: 10 }, (_, i) => {
        const { teams } = balanceTeams({ players, teamCount: 2, seed: i + 1 });
        return teams.map((t) => [...t].sort().join(",")).sort().join("|");
      }),
    );
    expect(signatures.size).toBeGreaterThan(3);
  });

  it("works when nobody has a position (positions are simply ignored)", () => {
    const players = squad(18).map((p) => ({ ...p, position: null }));
    for (const teamCount of [2, 3]) {
      for (let seed = 1; seed <= 20; seed++) {
        const { teams, strengths } = balanceTeams({ players, teamCount, seed });
        const sizes = teams.map((t) => t.length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        expect(teams.flat()).toHaveLength(18);
        expect(strengthGapPercent(strengths)).toBeLessThanOrEqual(10);
      }
    }
  });

  it("handles fewer players than teams without crashing", () => {
    const { teams } = balanceTeams({ players: squad(2), teamCount: 3 });
    expect(teams.flat()).toHaveLength(2);
  });
});
