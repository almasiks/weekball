import type { MessageKey, T } from "@/lib/i18n";
import type { PlayerPosition } from "@/lib/supabase/database.types";

export const POSITION_VALUES: PlayerPosition[] = ["gk", "def", "mid", "fwd"];

export function positionShort(t: T, position: PlayerPosition | null): string | null {
  return position ? t(`positions.${position}.short` as MessageKey) : null;
}

export function positionLabel(t: T, position: PlayerPosition | null): string {
  return position ? t(`positions.${position}.label` as MessageKey) : t("positions.none");
}
