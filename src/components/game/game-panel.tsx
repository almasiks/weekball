import Link from "next/link";
import { ChevronRight, MapPin, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/notice";
import { PlayerAvatar } from "@/components/player-avatar";
import { ArrivalControls } from "@/components/game/arrival-controls";
import { GameRealtime } from "@/components/game/game-realtime";
import { SignupButtons } from "@/components/game/signup-buttons";
import { formatGameDate } from "@/lib/datetime";
import { gameShareText, whatsappUrl } from "@/lib/share";
import type { GameView, SignupEntry } from "@/lib/games";
import type { GameStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<GameStatus, string> = {
  signup: "Запись открыта",
  closed: "Запись закрыта",
  teams: "Делим команды",
  live: "Идёт игра",
  finished: "Игра завершена",
  cancelled: "Игра отменена",
};

type Props = {
  view: GameView;
  userId: string | null;
  gameUrl: string;
  // On the home page the header links to the full game page.
  linkToGame?: boolean;
};

export function GamePanel({ view, userId, gameUrl, linkToGame }: Props) {
  const { game, going, waitlist } = view;
  const all = [...going, ...waitlist, ...view.declined];
  const me = all.find((s) => s.playerId === userId) ?? null;
  const queuePosition =
    me?.status === "waitlist"
      ? waitlist.findIndex((s) => s.playerId === me.playerId) + 1
      : null;
  const isActive = game.status !== "cancelled" && game.status !== "finished";
  const fill = Math.min(100, Math.round((going.length / game.max_players) * 100));

  const shareText = gameShareText({
    startsAt: game.starts_at,
    timezone: game.timezone,
    place: game.place,
    status: game.status,
    goingCount: going.length,
    maxPlayers: game.max_players,
    url: gameUrl,
  });

  const title = (
    <span className="text-xl font-semibold tracking-tight">
      {formatGameDate(game.starts_at, game.timezone)}
    </span>
  );

  return (
    <Card>
      <GameRealtime gameId={game.id} />
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-2">
          {linkToGame ? (
            <Link
              href={`/game/${game.id}`}
              className="-my-2 flex min-h-11 items-center gap-1"
            >
              {title}
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
            </Link>
          ) : (
            title
          )}
          <Badge
            variant={game.status === "cancelled" ? "destructive" : "secondary"}
            className="mt-1 shrink-0"
          >
            {STATUS_LABEL[game.status]}
          </Badge>
        </div>
        {game.place && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {game.place}
          </p>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span>
              Записано <strong className="text-base">{going.length}</strong> из{" "}
              {game.max_players}
            </span>
            {waitlist.length > 0 && (
              <span className="text-muted-foreground">
                в очереди: {waitlist.length}
              </span>
            )}
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={game.max_players}
            aria-valuenow={going.length}
            aria-label="Заполненность состава"
          >
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${fill}%` }} />
          </div>
        </div>

        {game.status === "signup" && (
          <SignupButtons gameId={game.id} current={me?.status ?? null} />
        )}
        {game.status === "closed" && (
          <Notice>Запись закрыта организатором. Состав уже не меняется.</Notice>
        )}
        {game.status === "cancelled" && (
          <Notice variant="error">Игра отменена. Следите за новостями в чате.</Notice>
        )}

        {queuePosition && isActive && (
          <Notice>
            Вы в листе ожидания: <strong>{queuePosition}-й</strong> в очереди.
            Если кто-то откажется, вы автоматически попадёте в состав.
          </Notice>
        )}

        {me?.status === "going" && isActive && (
          <ArrivalControls
            gameId={game.id}
            arrival={me.arrival}
            lateMinutes={me.lateMinutes}
          />
        )}

        <PlayerSection title="Идут" count={going.length} empty="Пока никто не записался — будьте первым!">
          {going.map((s) => (
            <PlayerRow key={s.playerId} entry={s} isMe={s.playerId === userId} showArrival={isActive} />
          ))}
        </PlayerSection>

        {waitlist.length > 0 && (
          <PlayerSection title="Лист ожидания" count={waitlist.length}>
            {waitlist.map((s, i) => (
              <PlayerRow key={s.playerId} entry={s} isMe={s.playerId === userId} position={i + 1} />
            ))}
          </PlayerSection>
        )}

        <a
          href={whatsappUrl(shareText)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants(), "w-full bg-[#128C7E] text-white hover:bg-[#0e7266]")}
        >
          <MessageCircle aria-hidden />
          Поделиться в WhatsApp
        </a>
      </CardContent>
    </Card>
  );
}

function PlayerSection({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-medium text-muted-foreground">
        {title} · {count}
      </h3>
      {count === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">{children}</ul>
      )}
    </section>
  );
}

function PlayerRow({
  entry,
  isMe,
  position,
  showArrival,
}: {
  entry: SignupEntry;
  isMe: boolean;
  position?: number;
  showArrival?: boolean;
}) {
  return (
    <li className="flex min-h-12 items-center gap-3 py-1.5">
      {position !== undefined && (
        <span className="w-5 text-right text-sm text-muted-foreground tabular-nums">
          {position}
        </span>
      )}
      <PlayerAvatar name={entry.name} avatarUrl={entry.avatarUrl} className="size-8 text-sm" />
      <span className="min-w-0 flex-1 truncate">
        {entry.name}
        {isMe && <span className="text-muted-foreground"> (вы)</span>}
      </span>
      {showArrival && <ArrivalBadge entry={entry} />}
    </li>
  );
}

export function ArrivalBadge({ entry }: { entry: SignupEntry }) {
  if (entry.arrival === "arrived") {
    return <Badge className="shrink-0">на месте</Badge>;
  }
  if (entry.arrival === "late") {
    return (
      <Badge variant="outline" className="shrink-0 border-amber-500/50 text-amber-700 dark:text-amber-400">
        +{entry.lateMinutes} мин
      </Badge>
    );
  }
  return null;
}
