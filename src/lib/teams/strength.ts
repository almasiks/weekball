// The ONLY place that defines how strong a player is.
// Phase 3: the organizer-set level (1–5). Phase 5 will switch this to the rating.
export type StrengthSource = { level: number; rating?: number | null };

export function playerStrength(player: StrengthSource): number {
  return player.level;
}
