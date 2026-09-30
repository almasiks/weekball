// Elo-like team rating. Pure: no I/O. Replaying the same history always gives
// the same result, so a full recalculation is safe to run any number of times.

export const START_RATING = 1000;
export const K_FACTOR = 20;
const MAX_GOAL_MULTIPLIER = 2;

export type RatedMatch = {
  gameId: string;
  gameStartsAt: string; // ISO
  sortOrder: number;
  teamA: string[]; // player ids
  teamB: string[];
  scoreA: number;
  scoreB: number;
};

export type HistoryRow = {
  player_id: string;
  game_id: string;
  rating_before: number;
  rating_after: number;
  delta: number;
};

export type ReplayResult = {
  ratings: Record<string, number>; // rounded
  ratedGames: Record<string, number>; // games (evenings) played
  history: HistoryRow[]; // one row per player per game
};

/** Expected score of A against B. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/** 1 + ln(|diff| + 1), capped at 2. A draw gives 1. */
export function goalDiffMultiplier(diff: number): number {
  return Math.min(MAX_GOAL_MULTIPLIER, 1 + Math.log(Math.abs(diff) + 1));
}

const average = (ids: string[], ratings: Map<string, number>) =>
  ids.reduce((sum, id) => sum + (ratings.get(id) ?? START_RATING), 0) / ids.length;

/** Rating change for every player of team A (team B gets the opposite). */
export function matchDelta(ratingA: number, ratingB: number, scoreA: number, scoreB: number): number {
  const result = scoreA > scoreB ? 1 : scoreA === scoreB ? 0.5 : 0;
  return K_FACTOR * goalDiffMultiplier(scoreA - scoreB) * (result - expectedScore(ratingA, ratingB));
}

/** Chronological order: game date, then the match order inside the game. */
export function sortMatches<T extends Pick<RatedMatch, "gameStartsAt" | "sortOrder" | "gameId">>(matches: T[]): T[] {
  return [...matches].sort(
    (a, b) =>
      Date.parse(a.gameStartsAt) - Date.parse(b.gameStartsAt) ||
      a.gameId.localeCompare(b.gameId) ||
      a.sortOrder - b.sortOrder,
  );
}

export function replayRatings(matches: RatedMatch[]): ReplayResult {
  const ratings = new Map<string, number>();
  const games = new Map<string, Set<string>>(); // player -> game ids
  const history: HistoryRow[] = [];
  // Per game: rating before the first match of the evening, then after the last one.
  let currentGame: string | null = null;
  let before = new Map<string, number>();

  const closeGame = () => {
    if (!currentGame) return;
    for (const [player, start] of before) {
      const end = ratings.get(player)!;
      history.push({
        player_id: player,
        game_id: currentGame,
        rating_before: Math.round(start),
        rating_after: Math.round(end),
        delta: Math.round(end) - Math.round(start),
      });
    }
  };

  for (const m of sortMatches(matches)) {
    if (m.teamA.length === 0 || m.teamB.length === 0) continue;
    if (m.gameId !== currentGame) {
      closeGame();
      currentGame = m.gameId;
      before = new Map();
    }
    for (const id of [...m.teamA, ...m.teamB]) {
      if (!ratings.has(id)) ratings.set(id, START_RATING);
      if (!before.has(id)) before.set(id, ratings.get(id)!);
      if (!games.has(id)) games.set(id, new Set());
      games.get(id)!.add(m.gameId);
    }

    const delta = matchDelta(average(m.teamA, ratings), average(m.teamB, ratings), m.scoreA, m.scoreB);
    for (const id of m.teamA) ratings.set(id, ratings.get(id)! + delta);
    for (const id of m.teamB) ratings.set(id, ratings.get(id)! - delta);
  }
  closeGame();

  return {
    ratings: Object.fromEntries([...ratings].map(([id, r]) => [id, Math.round(r)])),
    ratedGames: Object.fromEntries([...games].map(([id, set]) => [id, set.size])),
    history,
  };
}
