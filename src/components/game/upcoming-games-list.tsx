import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatGameDate } from "@/lib/datetime";
import type { GameRow } from "@/lib/supabase/database.types";
import { getT } from "@/lib/i18n/server";

const STATUS_HINT = { closed: "game.hintClosed", cancelled: "game.hintCancelled" } as const;

export async function UpcomingGamesList({ games }: { games: GameRow[] }) {
  const t = await getT();
  const hint = (status: GameRow["status"]) =>
    status === "closed" || status === "cancelled" ? t(STATUS_HINT[status]) : null;
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
                {formatGameDate(t, game.starts_at, game.timezone)}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {[game.place, hint(game.status)].filter(Boolean).join(" · ") ||
                  t("game.upTo", { count: game.max_players })}
              </span>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
