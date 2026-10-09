import type { MessageKey, T } from "@/lib/i18n";
import type { GameStatus } from "@/lib/supabase/database.types";

export function statusLabel(t: T, status: GameStatus): string {
  return t(`status.${status}` as MessageKey);
}
