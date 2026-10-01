import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Notice } from "@/components/notice";
import { GameRealtime } from "@/components/game/game-realtime";
import { DraftPanel } from "@/components/teams/draft-panel";
import { TeamsBoard } from "@/components/teams/teams-board";
import { formatGameDate } from "@/lib/datetime";
import { getGameView } from "@/lib/games";
import { getAppContext } from "@/lib/session";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = { title: "Команды" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TeamsPage({ params }: PageProps<"/game/[id]/teams">) {
  const { id } = await params;
  const ctx = await getAppContext();
  const view = UUID.test(id) && ctx.userId ? await getGameView(id) : null;
  if (!view) redirect(`/game/${id}`);

  const isOrganizer = ctx.role === "organizer" && ctx.group?.id === view.game.group_id;
  // Regular players only come here to watch / pick during a draft.
  if (!isOrganizer && !view.game.draft_active) redirect(`/game/${id}`);

  const editable = ["signup", "closed", "teams", "live"].includes(view.game.status);
  const shareUrl = `${await getSiteUrl()}/game/${id}`;

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
        <h1 className="text-2xl font-bold tracking-tight">
          {view.game.draft_active ? "Драфт" : "Команды"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatGameDate(view.game.starts_at, view.game.timezone)}
          {view.game.place && ` · ${view.game.place}`}
        </p>
      </header>

      {!editable ? (
        <Notice variant="error">Игра отменена или завершена — составы менять нельзя.</Notice>
      ) : view.game.draft_active ? (
        <DraftPanel view={view} userId={ctx.playerId} isOrganizer={isOrganizer} />
      ) : view.going.length === 0 ? (
        <Notice>На игру пока никто не записан — делить некого.</Notice>
      ) : (
        <TeamsBoard view={view} shareUrl={shareUrl} />
      )}
    </div>
  );
}
