import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatGameDate } from "@/lib/datetime";
import type { GameRow } from "@/lib/supabase/database.types";

const STATUS_HINT: Partial<Record<GameRow["status"], string>> = {
  closed: "запись закрыта",
  cancelled: "отменена",
};

export function UpcomingGamesList({ games }: { games: GameRow[] }) {
  return (
    <ul className="divide-y">
      {games.map((game) => (
        <li key={game.id}>
          <Link
            href={`/game/${game.id}`}
            className="flex min-h-12 items-center gap-2 py-1.5"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span
                className={
                  game.status === "cancelled"
                    ? "font-medium text-muted-foreground line-through"
                    : "font-medium"
                }
              >
                {formatGameDate(game.starts_at, game.timezone)}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {[game.place, STATUS_HINT[game.status]].filter(Boolean).join(" · ") ||
                  `до ${game.max_players} игроков`}
              </span>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
