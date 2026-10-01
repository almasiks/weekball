import type { GameStatus } from "@/lib/supabase/database.types";

export const STATUS_LABEL: Record<GameStatus, string> = {
  signup: "Запись открыта",
  closed: "Запись закрыта",
  teams: "Делим команды",
  live: "Идёт игра",
  finished: "Игра завершена",
  cancelled: "Игра отменена",
};
