// Pure team-balancing algorithm. No I/O: strengths are computed by the caller
// with playerStrength() and passed in.

export type Position = "gk" | "def" | "mid" | "fwd" | null;

export type BalancePlayer = {
  id: string;
  position: Position;
  strength: number;
};

export type BalanceInput = {
  players: BalancePlayer[];
  teamCount: number;
  // playerId -> team index; these players never move.
  locked?: Record<string, number>;
  // Same seed -> same result; a different seed -> a different, still balanced split.
  seed?: number;
};

export type BalanceResult = {
  teams: string[][];
  strengths: number[];
};

// Deterministic PRNG (mulberry32).
export function createRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Team sizes that differ by at most one, largest first.
export function teamSizes(playerCount: number, teamCount: number): number[] {
  const base = Math.floor(playerCount / teamCount);
  const extra = playerCount % teamCount;
  return Array.from({ length: teamCount }, (_, i) => base + (i < extra ? 1 : 0));
}

export type TeamCountSuggestion = {
  recommended: 2 | 3;
  options: { teams: 2 | 3; sizes: number[] }[];
};

// 14–20 players: 2 teams of 7–10 or 3 teams of 5–7 (one rests / rotation).
export function suggestTeamCount(playerCount: number): TeamCountSuggestion {
  const options = ([2, 3] as const)
    .filter((k) => k === 2 || playerCount >= 12)
    .map((teams) => ({ teams, sizes: teamSizes(playerCount, teams) }));
  const recommended = playerCount >= 18 ? 3 : 2;
  return { recommended, options };
}

const FIELD_POSITIONS = ["def", "mid", "fwd"] as const;

function spread(values: number[]) {
  return Math.max(...values) - Math.min(...values);
}

function cost(teams: BalancePlayer[][]) {
  const sums = teams.map((t) => t.reduce((s, p) => s + p.strength, 0));
  const gk = spread(teams.map((t) => t.filter((p) => p.position === "gk").length));
  const positions = FIELD_POSITIONS.reduce(
    (acc, pos) => acc + spread(teams.map((t) => t.filter((p) => p.position === pos).length)),
    0,
  );
  // Goalkeepers first, then strength, then field positions.
  return gk * 1000 + spread(sums) * 10 + positions;
}

export function balanceTeams(input: BalanceInput): BalanceResult {
  const { players, teamCount } = input;
  if (!Number.isInteger(teamCount) || teamCount < 2) {
    throw new Error("teamCount must be an integer >= 2");
  }
  const random = createRandom(input.seed ?? 1);
  const locked = input.locked ?? {};

  const teams: BalancePlayer[][] = Array.from({ length: teamCount }, () => []);
  const lockedIds = new Set<string>();
  for (const player of players) {
    const index = locked[player.id];
    if (index !== undefined && index >= 0 && index < teamCount) {
      teams[index].push(player);
      lockedIds.add(player.id);
    }
  }

  // Capacities: the "+1" spots go to teams that already hold the most locked players.
  const sizes = teamSizes(players.length, teamCount);
  const capacity = new Array<number>(teamCount);
  shuffle([...teams.keys()], random)
    .sort((a, b) => teams[b].length - teams[a].length)
    .forEach((teamIndex, rank) => {
      capacity[teamIndex] = Math.max(sizes[rank], teams[teamIndex].length);
    });

  const sum = (i: number) => teams[i].reduce((s, p) => s + p.strength, 0);
  const hasRoom = (i: number) => teams[i].length < capacity[i];
  const count = (i: number, pos: Position) => teams[i].filter((p) => p.position === pos).length;

  // Random order among equal players is what makes different seeds give different splits.
  const free = shuffle(
    players.filter((p) => !lockedIds.has(p.id)),
    random,
  ).sort((a, b) => b.strength - a.strength);

  // 1) One goalkeeper per team, when there are enough.
  const placed = new Set<string>();
  for (const gk of free.filter((p) => p.position === "gk")) {
    const candidates = shuffle([...teams.keys()], random).filter(
      (i) => hasRoom(i) && count(i, "gk") === 0,
    );
    if (candidates.length === 0) break;
    const target = candidates.reduce((best, i) => (sum(i) < sum(best) ? i : best));
    teams[target].push(gk);
    placed.add(gk.id);
  }

  // 2) Greedy: strongest first into the weakest team with room; ties -> fewer of that position.
  for (const player of free) {
    if (placed.has(player.id)) continue;
    const candidates = shuffle([...teams.keys()], random).filter(hasRoom);
    const target = candidates.reduce((best, i) => {
      const bySum = sum(i) - sum(best);
      if (bySum !== 0) return bySum < 0 ? i : best;
      // Unknown position: not taken into account.
      const byPos = player.position ? count(i, player.position) - count(best, player.position) : 0;
      if (byPos !== 0) return byPos < 0 ? i : best;
      return teams[i].length < teams[best].length ? i : best;
    });
    teams[target].push(player);
  }

  // 3) Pairwise swaps (sizes stay the same) while they lower the cost.
  for (let pass = 0; pass < 50; pass++) {
    const current = cost(teams);
    const swaps: [number, number, number, number][] = [];
    for (let a = 0; a < teamCount; a++) {
      for (let b = a + 1; b < teamCount; b++) {
        teams[a].forEach((pa, ia) => {
          if (lockedIds.has(pa.id)) return;
          teams[b].forEach((pb, ib) => {
            if (lockedIds.has(pb.id)) return;
            if (pa.strength === pb.strength && pa.position === pb.position) return;
            swaps.push([a, ia, b, ib]);
          });
        });
      }
    }

    let improved = false;
    for (const [a, ia, b, ib] of shuffle(swaps, random)) {
      [teams[a][ia], teams[b][ib]] = [teams[b][ib], teams[a][ia]];
      if (cost(teams) < current) {
        improved = true;
        break;
      }
      [teams[a][ia], teams[b][ib]] = [teams[b][ib], teams[a][ia]];
    }
    if (!improved) break;
  }

  return {
    teams: teams.map((t) => t.map((p) => p.id)),
    strengths: teams.map((_, i) => sum(i)),
  };
}

// Difference between the strongest and weakest team, in % of the strongest.
export function strengthGapPercent(strengths: number[]): number {
  const max = Math.max(...strengths);
  if (max <= 0) return 0;
  return Math.round(((max - Math.min(...strengths)) / max) * 100);
}
