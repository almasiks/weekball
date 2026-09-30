import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Notice } from "@/components/notice";
import { GameRealtime } from "@/components/game/game-realtime";
import { LiveConsole } from "@/components/live/live-console";
import { formatGameDate } from "@/lib/datetime";
import { getGameView } from "@/lib/games";
import { getMatchData } from "@/lib/match/load";
import { getAppContext } from "@/lib/session";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = { title: "Матч" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LivePage({ params }: PageProps<"/game/[id]/live">) {
  const { id } = await params;
  const ctx = await getAppContext();
  const view = UUID.test(id) && ctx.userId ? await getGameView(id) : null;
  if (!view) redirect(`/game/${id}`);
  const isOrganizer = ctx.role === "organizer" && ctx.group?.id === view.game.group_id;
  if (!isOrganizer) redirect(`/game/${id}`);

  const [data, siteUrl] = await Promise.all([getMatchData(view), getSiteUrl()]);
  const cancelled = view.game.status === "cancelled";

  return (
    <div className="flex flex-col gap-4">
      <GameRealtime gameId={view.game.id} />
      <Link
        href={`/game/${id}`}
        className="-ml-2 flex min-h-11 w-fit items-center gap-1 px-2 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        К игре
      </Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Матч</h1>
        <p className="text-sm text-muted-foreground">
          {formatGameDate(view.game.starts_at, view.game.timezone)}
          {view.game.place && ` · ${view.game.place}`}
        </p>
      </header>

      {cancelled ? (
        <Notice variant="error">Игра отменена.</Notice>
      ) : (
        <LiveConsole
          gameId={view.game.id}
          gameStatus={view.game.status}
          teams={data.teams}
          matches={data.matches}
          events={data.events}
          names={data.names}
          siteUrl={siteUrl}
          meta={{
            startsAt: view.game.starts_at,
            timezone: view.game.timezone,
            place: view.game.place,
            goalLimit: view.game.goal_limit,
            matchMinutes: view.game.match_minutes,
          }}
        />
      )}
    </div>
  );
}
