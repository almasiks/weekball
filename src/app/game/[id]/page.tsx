import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/notice";
import { ArrivalOverview } from "@/components/game/arrival-overview";
import { GamePanel } from "@/components/game/game-panel";
import { OrganizerControls } from "@/components/game/organizer-controls";
import { formatGameDate } from "@/lib/datetime";
import { getGamePreview, getGameView } from "@/lib/games";
import { getAppContext } from "@/lib/session";
import { getSiteUrl } from "@/lib/site-url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Open Graph for WhatsApp: server-side, no player names (crawlers aren't signed in).
export async function generateMetadata({
  params,
}: PageProps<"/game/[id]">): Promise<Metadata> {
  const { id } = await params;
  const preview = await getGamePreview(id);
  if (!preview) return { title: "Игра" };

  const when = formatGameDate(preview.startsAt, preview.timezone);
  const title = `${preview.groupName}: ${when}`;
  const status =
    preview.status === "cancelled"
      ? "Игра отменена"
      : `Записано ${preview.goingCount} из ${preview.maxPlayers}`;
  const description = [preview.place, status].filter(Boolean).join(" · ");

  return {
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${await getSiteUrl()}/game/${id}`,
      siteName: "Weekly Football",
      locale: "ru_RU",
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function GamePage({ params }: PageProps<"/game/[id]">) {
  const { id } = await params;
  const ctx = await getAppContext();
  const view = UUID.test(id) && ctx.userId ? await getGameView(id) : null;

  if (!view) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Игра недоступна</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Notice>
            {ctx.group
              ? "Эта игра не найдена или относится к другой группе."
              : "Чтобы записаться, откройте ссылку-приглашение в группу из чата WhatsApp, а потом эту ссылку ещё раз."}
          </Notice>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            На главную
          </Link>
        </CardContent>
      </Card>
    );
  }

  const isOrganizer =
    ctx.role === "organizer" && ctx.group?.id === view.game.group_id;
  const siteUrl = await getSiteUrl();

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/"
        className="-ml-2 flex min-h-11 w-fit items-center gap-1 px-2 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        На главную
      </Link>
      <GamePanel
        view={view}
        userId={ctx.userId}
        gameUrl={`${siteUrl}/game/${view.game.id}`}
      />
      {isOrganizer && (
        <>
          <OrganizerControls gameId={view.game.id} status={view.game.status} />
          <ArrivalOverview going={view.going} />
        </>
      )}
    </div>
  );
}
