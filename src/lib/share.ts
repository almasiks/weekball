import { formatGameDate } from "@/lib/datetime";
import type { GameStatus } from "@/lib/supabase/database.types";

type ShareInput = {
  startsAt: string;
  timezone: string;
  place: string;
  status: GameStatus;
  goingCount: number;
  maxPlayers: number;
  url: string;
};

// "Сб, 4 окт, 19:00, Поле на Абая. Записываемся! Уже 12 из 20. Ссылка: …"
export function gameShareText(g: ShareInput): string {
  const when = formatGameDate(g.startsAt, g.timezone);
  const where = g.place ? `, ${g.place}` : "";
  const call =
    g.status === "cancelled"
      ? "Игра отменена."
      : g.status === "signup"
        ? `Записываемся! Уже ${g.goingCount} из ${g.maxPlayers}.`
        : `Запись закрыта, в составе ${g.goingCount} из ${g.maxPlayers}.`;
  return `${when}${where}. ${call} Ссылка: ${g.url}`;
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
