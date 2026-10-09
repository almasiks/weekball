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
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("teams.title") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TeamsPage({ params }: PageProps<"/game/[id]/teams">) {
  const { id } = await params;
  const [ctx, t] = await Promise.all([getAppContext(), getT()]);
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
        {t("game.toGame")}
      </Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          {view.game.draft_active ? t("teams.draftTitle") : t("teams.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatGameDate(t, view.game.starts_at, view.game.timezone)}
          {view.game.place && ` · ${view.game.place}`}
        </p>
      </header>

      {!editable ? (
        <Notice variant="error">{t("teams.lockedGame")}</Notice>
      ) : view.game.draft_active ? (
        <DraftPanel view={view} userId={ctx.playerId} isOrganizer={isOrganizer} />
      ) : view.going.length === 0 ? (
        <Notice>{t("teams.noSignups")}</Notice>
      ) : (
        <TeamsBoard view={view} shareUrl={shareUrl} />
      )}
    </div>
  );
}
