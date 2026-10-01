import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/notice";
import { CheckinBoard, type CheckinPlayer } from "@/components/checkin/checkin-board";
import { formatGameDate } from "@/lib/datetime";
import { getGameView } from "@/lib/games";
import { getAppContext, getGroupMembers } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Кто пришёл" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CheckinPage({ params }: PageProps<"/game/[id]/checkin">) {
  const { id } = await params;
  const ctx = await getAppContext();
  const view = UUID.test(id) && ctx.userId ? await getGameView(id) : null;
  if (!view) redirect(`/game/${id}`);
  const isOrganizer = ctx.role === "organizer" && ctx.group?.id === view.game.group_id;
  if (!isOrganizer) redirect(`/game/${id}`);

  const members = await getGroupMembers(view.game.group_id);
  const signups = new Map(view.going.map((s) => [s.playerId, s]));
  const players: CheckinPlayer[] = members
    .filter((m) => !m.archived || signups.has(m.playerId))
    .map((m) => ({
      playerId: m.playerId,
      name: m.name,
      isRegular: m.isRegular,
      going: signups.has(m.playerId),
      present: signups.get(m.playerId)?.arrival === "arrived",
    }));
  const editable = ["signup", "closed", "teams", "live"].includes(view.game.status);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/game/${id}`}
        className="-ml-2 flex min-h-11 w-fit items-center gap-1 px-2 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        К игре
      </Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Кто пришёл</h1>
        <p className="text-sm text-muted-foreground">
          {view.game.title ? `${view.game.title} · ` : ""}
          {formatGameDate(view.game.starts_at, view.game.timezone)}
        </p>
      </header>

      {editable ? (
        <>
          <CheckinBoard gameId={view.game.id} players={players} />
          <Link href={`/game/${id}/teams`} className={cn(buttonVariants({ size: "lg" }), "h-14 w-full text-base")}>
            <Users aria-hidden />
            К командам
          </Link>
        </>
      ) : (
        <Notice>Игра завершена или отменена — отметка закрыта.</Notice>
      )}
    </div>
  );
}
