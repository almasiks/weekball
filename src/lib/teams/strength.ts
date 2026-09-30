// The ONLY place that defines how strong a player is.
// New players: the organizer-set level (1–5). As rated games accumulate, the
// rating takes over, fully after RATING_FULL_WEIGHT_GAMES games.
import { START_RATING } from "@/lib/rating/elo";

export const RATING_FULL_WEIGHT_GAMES = 10;
// 100 rating points ≈ one level; 1000 (start) ≈ level 3.
const RATING_POINTS_PER_LEVEL = 100;

export type StrengthSource = {
  level: number;
  rating?: number | null;
  ratedGames?: number | null;
};

/** Rating expressed on the 1–5 level scale. */
export function ratingAsLevel(rating: number): number {
  return Math.min(5, Math.max(1, 3 + (rating - START_RATING) / RATING_POINTS_PER_LEVEL));
}

export function playerStrength(player: StrengthSource): number {
  const games = Math.max(0, player.ratedGames ?? 0);
  if (player.rating == null || games === 0) return player.level;
  const weight = Math.min(1, games / RATING_FULL_WEIGHT_GAMES);
  const value = (1 - weight) * player.level + weight * ratingAsLevel(player.rating);
  return Math.round(value * 100) / 100;
}
