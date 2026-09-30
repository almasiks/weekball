import { describe, expect, it } from "vitest";
import {
  expectedScore,
  goalDiffMultiplier,
  K_FACTOR,
  matchDelta,
  replayRatings,
  START_RATING,
  type RatedMatch,
} from "./elo";
import { playerStrength, ratingAsLevel, RATING_FULL_WEIGHT_GAMES } from "@/lib/teams/strength";

const match = (over: Partial<RatedMatch>): RatedMatch => ({
  gameId: "g1",
  gameStartsAt: "2026-10-03T14:00:00Z",
  sortOrder: 0,
  teamA: ["a1", "a2"],
  teamB: ["b1", "b2"],
  scoreA: 1,
  scoreB: 0,
  ...over,
});

describe("expectedScore", () => {
  it("is 0.5 for equal ratings and symmetric", () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
    expect(expectedScore(1200, 1000) + expectedScore(1000, 1200)).toBeCloseTo(1);
    expect(expectedScore(1400, 1000)).toBeCloseTo(1 / (1 + 10 ** (-400 / 400)));
  });
});

describe("goalDiffMultiplier", () => {
  it("is 1 for a draw, grows with the difference, capped at 2", () => {
    expect(goalDiffMultiplier(0)).toBe(1);
    expect(goalDiffMultiplier(1)).toBeCloseTo(1 + Math.log(2));
    expect(goalDiffMultiplier(-1)).toBeCloseTo(1 + Math.log(2));
    expect(goalDiffMultiplier(2)).toBe(2); // 1 + ln 3 > 2
    expect(goalDiffMultiplier(9)).toBe(2);
  });
});

describe("matchDelta", () => {
  it("equal teams: win by 1 gives K·(1+ln2)·0.5, draw gives 0", () => {
    expect(matchDelta(1000, 1000, 1, 0)).toBeCloseTo(K_FACTOR * (1 + Math.log(2)) * 0.5);
    expect(matchDelta(1000, 1000, 2, 2)).toBe(0);
    expect(matchDelta(1000, 1000, 0, 1)).toBeCloseTo(-matchDelta(1000, 1000, 1, 0));
  });

  it("the favourite gains less for a win than the underdog", () => {
    expect(matchDelta(1200, 1000, 1, 0)).toBeLessThan(matchDelta(1000, 1200, 1, 0));
  });
});

describe("replayRatings", () => {
  it("gives every player of a team the same change and keeps the sum constant", () => {
    const { ratings, history } = replayRatings([match({ scoreA: 3, scoreB: 1 })]);
    expect(ratings.a1).toBe(ratings.a2);
    expect(ratings.b1).toBe(ratings.b2);
    expect(ratings.a1 - START_RATING).toBe(START_RATING - ratings.b1);
    expect(ratings.a1).toBe(START_RATING + 20); // K * 2 * 0.5
    expect(history.find((h) => h.player_id === "a1")).toMatchObject({ rating_before: 1000, rating_after: 1020, delta: 20 });
  });

  it("is idempotent: replaying the same history gives the same result", () => {
    const history = [
      match({ gameId: "g1", scoreA: 2, scoreB: 1 }),
      match({ gameId: "g2", gameStartsAt: "2026-10-10T14:00:00Z", teamA: ["a1", "b1"], teamB: ["a2", "b2"], scoreA: 0, scoreB: 0 }),
      match({ gameId: "g2", gameStartsAt: "2026-10-10T14:00:00Z", sortOrder: 1, scoreA: 0, scoreB: 4 }),
    ];
    expect(replayRatings(history)).toEqual(replayRatings(history));
    expect(replayRatings([...history].reverse())).toEqual(replayRatings(history)); // input order doesn't matter
  });

  it("plays matches by game date, then sort order", () => {
    // The same two results in a different chronological order give different ratings,
    // and the replay must follow dates, not the array order.
    const early = match({ gameId: "early", gameStartsAt: "2026-10-01T14:00:00Z", scoreA: 5, scoreB: 0 });
    const late = match({ gameId: "late", gameStartsAt: "2026-10-08T14:00:00Z", teamA: ["a1"], teamB: ["b1"], scoreA: 0, scoreB: 1 });
    const r1 = replayRatings([late, early]);
    const r2 = replayRatings([early, late]);
    expect(r1).toEqual(r2);
    expect(r1.history.map((h) => h.game_id)).toEqual(["early", "early", "early", "early", "late", "late"]);
  });

  it("records one history row per player per game (several matches in one evening)", () => {
    const { history, ratedGames } = replayRatings([
      match({ sortOrder: 0, scoreA: 1, scoreB: 0 }),
      match({ sortOrder: 1, scoreA: 1, scoreB: 0 }),
    ]);
    const a1 = history.filter((h) => h.player_id === "a1");
    expect(a1).toHaveLength(1);
    expect(a1[0].delta).toBe(a1[0].rating_after - a1[0].rating_before);
    expect(ratedGames.a1).toBe(1);
  });

  it("skips matches with an empty team", () => {
    expect(replayRatings([match({ teamB: [] })]).history).toEqual([]);
  });
});

describe("playerStrength", () => {
  it("uses the level for new players", () => {
    expect(playerStrength({ level: 4 })).toBe(4);
    expect(playerStrength({ level: 4, rating: 1300, ratedGames: 0 })).toBe(4);
  });

  it("moves from level to rating as games accumulate", () => {
    const p = (ratedGames: number) => playerStrength({ level: 2, rating: 1200, ratedGames });
    expect(ratingAsLevel(1200)).toBe(5);
    expect(p(1)).toBeCloseTo(2.3); // 90% level, 10% rating
    expect(p(5)).toBeCloseTo(3.5);
    expect(p(RATING_FULL_WEIGHT_GAMES)).toBe(5);
    expect(p(40)).toBe(5);
    expect(p(1)).toBeLessThan(p(5));
  });

  it("maps the rating onto the 1–5 scale with clamping", () => {
    expect(ratingAsLevel(START_RATING)).toBe(3);
    expect(ratingAsLevel(700)).toBe(1);
    expect(ratingAsLevel(1050)).toBe(3.5);
  });
});
