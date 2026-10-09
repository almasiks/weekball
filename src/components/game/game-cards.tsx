"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarRange,
  Copy,
  History,
  Info,
  MessageCircle,
  Pencil,
  RotateCcw,
  Star,
  Trash2,
  Trophy,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BottomSheet } from "@/components/bottom-sheet";
import { FormatFields } from "@/components/format-fields";
import { Notice } from "@/components/notice";
import { SubmitButton } from "@/components/submit-button";
import {
  deleteGameAction,
  resetGameResultsAction,
  setGameMvpAction,
  setLiveLinkAction,
  updateGameAction,
} from "@/lib/actions/game-admin";
import { formatGameDate, utcToZonedInputs } from "@/lib/datetime";
import { STATUS_LABEL } from "@/lib/game-status";
import { formatLabel } from "@/lib/match/format";
import { bestPlayersText, rankBestPlayers, whatsappUrl } from "@/lib/share";
import type { FormState } from "@/lib/forms";
import type { GamePlayerStatRow, GameStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export type GameCardsGame = {
  id: string;
  title: string | null;
  startsAt: string;
  timezone: string;
  place: string;
  status: GameStatus;
  maxPlayers: number;
  goalLimit: number | null;
  matchMinutes: number;
  periods: number;
  autoSounds: boolean;
  liveToken: string | null;
  mvpId: string | null;
};

type Props = {
  game: GameCardsGame;
  stats: GamePlayerStatRow[];
  isOrganizer: boolean;
  teamCount: number;
  teamsEditable: boolean;
  goingCount: number;
  presentCount: number;
  creatorName: string | null;
  siteUrl: string;
};

type Sheet = "best" | "info" | "edit" | "reset" | "delete" | null;

const tileClass =
  "flex min-h-20 flex-col items-start justify-between gap-2 rounded-xl bg-card p-3 text-left text-sm font-medium ring-1 ring-foreground/10 transition-colors hover:bg-muted/60";

// Dop tep style action cards under the game statistics.
export function GameCards(props: Props) {
  const { game, stats, isOrganizer } = props;
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);
  const name = gameName(game);

  return (
    <section className="flex flex-col gap-2" aria-label="Действия с игрой">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={tileClass} onClick={() => setSheet("best")}>
          <Trophy className="size-5 text-amber-500" aria-hidden />
          Лучшие игроки
        </button>
        <Link href="/history" className={tileClass}>
          <History className="size-5 text-primary" aria-hidden />
          История игр
        </Link>
        {isOrganizer && (
          <button type="button" className={tileClass} onClick={() => setSheet("edit")}>
            <Pencil className="size-5 text-primary" aria-hidden />
            Редактировать игру
          </button>
        )}
        {isOrganizer && (
          <button type="button" className={tileClass} onClick={() => setSheet("reset")}>
            <RotateCcw className="size-5 text-amber-600" aria-hidden />
            Сбросить результаты
          </button>
        )}
        <button type="button" className={tileClass} onClick={() => setSheet("info")}>
          <Info className="size-5 text-primary" aria-hidden />
          Инфо
        </button>
        <Link href="/results" className={tileClass}>
          <CalendarRange className="size-5 text-primary" aria-hidden />
          Результаты всех игр
        </Link>
        {isOrganizer && (
          <button
            type="button"
            className={cn(tileClass, "col-span-2 min-h-14 flex-row items-center text-destructive ring-destructive/30")}
            onClick={() => setSheet("delete")}
          >
            <Trash2 className="size-5" aria-hidden />
            Удалить игру
          </button>
        )}
      </div>

      <BottomSheet open={sheet === "best"} title="Лучшие игроки" onClose={close}>
        <BestPlayers game={game} stats={stats} isOrganizer={isOrganizer} siteUrl={props.siteUrl} />
      </BottomSheet>
      <BottomSheet open={sheet === "info"} title="Инфо" onClose={close}>
        <GameInfo {...props} />
      </BottomSheet>
      {isOrganizer && (
        <>
          <BottomSheet open={sheet === "edit"} title="Редактировать игру" onClose={close}>
            <EditGameForm
              game={game}
              teamCount={props.teamCount}
              teamsEditable={props.teamsEditable}
              onDone={close}
            />
          </BottomSheet>
          <BottomSheet open={sheet === "reset"} title="Сбросить результаты?" onClose={close}>
            <ConfirmDanger
              text={`Все голы и карточки игры «${name}» будут аннулированы, матчи вернутся к 0:0. Составы команд останутся. Статистика и рейтинг пересчитаются.`}
              confirm="Сбросить результаты"
              action={() => resetGameResultsAction(game.id)}
              onDone={close}
              onCancel={close}
            />
          </BottomSheet>
          <BottomSheet open={sheet === "delete"} title="Удалить игру?" onClose={close}>
            <ConfirmDanger
              text={`Игра «${name}» исчезнет из списков и статистики, рейтинг пересчитается. Данные не стираются физически.`}
              confirm="Удалить игру"
              action={() => deleteGameAction(game.id)}
              redirectTo="/"
              onDone={close}
              onCancel={close}
            />
          </BottomSheet>
        </>
      )}
    </section>
  );
}

function gameName(game: Pick<GameCardsGame, "title" | "startsAt" | "timezone">) {
  return game.title ?? formatGameDate(game.startsAt, game.timezone);
}

function BestPlayers({
  game,
  stats,
  isOrganizer,
  siteUrl,
}: {
  game: GameCardsGame;
  stats: GamePlayerStatRow[];
  isOrganizer: boolean;
  siteUrl: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const best = rankBestPlayers(stats);
  const mvp = stats.find((s) => s.player_id === game.mvpId) ?? null;

  function pickMvp(playerId: string | null) {
    setError(null);
    startTransition(async () => {
      const r = await setGameMvpAction(game.id, playerId);
      if (r.error) setError(r.error);
    });
  }

  const text = bestPlayersText({
    startsAt: game.startsAt,
    timezone: game.timezone,
    mvp: mvp?.name ?? null,
    players: best,
    url: `${siteUrl}/game/${game.id}`,
  });

  return (
    <>
      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2">
        <Star className="size-5 shrink-0 fill-amber-400 text-amber-500" aria-hidden />
        <span className="flex-1 text-sm">
          Игрок вечера: <strong>{mvp?.name ?? "не выбран"}</strong>
        </span>
      </div>

      {best.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Пока нет голов, ассистов и побед.</p>
      ) : (
        <ol className="flex flex-col divide-y">
          {best.map((p, i) => (
            <li key={p.player_id} className="flex min-h-11 items-center gap-2">
              <span className="w-5 text-right text-sm text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {p.goals} ⚽ · {p.assists} 🅰️ · {p.wins} В
              </span>
            </li>
          ))}
        </ol>
      )}

      {isOrganizer && stats.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="mvp-select">Выбрать игрока вечера</Label>
          <select
            id="mvp-select"
            value={game.mvpId ?? ""}
            disabled={pending}
            onChange={(e) => pickMvp(e.target.value || null)}
            className="h-11 rounded-lg border bg-background px-3 text-base"
          >
            <option value="">— не выбран —</option>
            {[...stats]
              .sort((a, b) => a.name.localeCompare(b.name, "ru"))
              .map((s) => (
                <option key={s.player_id} value={s.player_id}>
                  {s.name}
                </option>
              ))}
          </select>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {(best.length > 0 || mvp) && (
        <a
          href={whatsappUrl(text)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants(), "w-full bg-[#075E54] text-white hover:bg-[#064c44]")}
        >
          <MessageCircle aria-hidden />
          Поделиться в WhatsApp
        </a>
      )}
    </>
  );
}

function GameInfo({ game, isOrganizer, goingCount, presentCount, teamCount, creatorName, siteUrl }: Props) {
  const [token, setToken] = useState(game.liveToken);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const liveUrl = token ? `${siteUrl}/live/${token}` : null;

  function toggleLive(enabled: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await setLiveLinkAction(game.id, enabled);
      if (r.error) setError(r.error);
      else setToken(r.token ?? null);
    });
  }

  async function copy() {
    if (!liveUrl) return;
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Не удалось скопировать — выделите ссылку вручную.");
    }
  }

  const rows: [string, string][] = [
    ["Название", game.title ?? "—"],
    ["Когда", formatGameDate(game.startsAt, game.timezone)],
    ["Где", game.place || "—"],
    ["Статус", STATUS_LABEL[game.status]],
    ["Записано", `${goingCount} из ${game.maxPlayers}`],
    ["Пришло", String(presentCount)],
    ["Команд", String(teamCount)],
    [
      "Формат",
      `${formatLabel(game.goalLimit, game.matchMinutes)}${game.periods > 1 ? ` × ${game.periods} тайма` : ""}`,
    ],
    ["Автозвуки", game.autoSounds ? "вкл." : "выкл."],
    ["Создал", creatorName ?? "—"],
  ];

  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-2 flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">Публичная live-ссылка</p>
        <p className="text-xs text-muted-foreground">
          Гости без входа видят счёт, таймер и составы (только имена).
        </p>
        {liveUrl ? (
          <>
            <Input readOnly value={liveUrl} aria-label="Live-ссылка" onFocus={(e) => e.target.select()} />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={copy}>
                <Copy aria-hidden />
                {copied ? "Скопировано" : "Скопировать"}
              </Button>
              <a
                href={whatsappUrl(`⚽ Смотреть игру онлайн: ${liveUrl}`)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants(), "bg-[#075E54] text-white hover:bg-[#064c44]")}
              >
                <MessageCircle aria-hidden />
                WhatsApp
              </a>
            </div>
            {isOrganizer && (
              <Button variant="ghost" disabled={pending} onClick={() => toggleLive(false)}>
                Выключить ссылку
              </Button>
            )}
          </>
        ) : isOrganizer ? (
          <Button variant="secondary" disabled={pending} onClick={() => toggleLive(true)}>
            Включить live-ссылку
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Организатор ещё не включил ссылку.</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </>
  );
}

function EditGameForm({
  game,
  teamCount,
  teamsEditable,
  onDone,
}: {
  game: GameCardsGame;
  teamCount: number;
  teamsEditable: boolean;
  onDone: () => void;
}) {
  const initial = utcToZonedInputs(game.startsAt, game.timezone);
  // null = not chosen: saving other fields must not create teams by itself.
  const [count, setCount] = useState<number | null>(teamCount >= 2 ? teamCount : null);
  const [state, formAction] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await updateGameAction(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="gameId" value={game.id} />
      <input type="hidden" name="timezone" value={game.timezone} />
      <input type="hidden" name="teamCount" value={count ?? ""} />
      <input type="hidden" name="teamCountChanged" value={count !== null && count !== teamCount ? "1" : "0"} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-title">Название (необязательно)</Label>
        <Input id="edit-title" name="title" maxLength={60} defaultValue={game.title ?? ""} placeholder="Например, Кубок октября" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-date">Дата</Label>
          <Input id="edit-date" name="date" type="date" required defaultValue={initial.date} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-time">Время</Label>
          <Input id="edit-time" name="time" type="time" required defaultValue={initial.time} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-place">Место</Label>
        <Input id="edit-place" name="place" maxLength={120} defaultValue={game.place} />
      </div>

      {teamsEditable && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Количество команд</legend>
          <div className="grid grid-cols-2 gap-2">
            {[2, 3].map((n) => (
              <Button
                key={n}
                type="button"
                variant={count === n ? "default" : "outline"}
                aria-pressed={count === n}
                onClick={() => setCount(n)}
              >
                {n} команды
              </Button>
            ))}
          </div>
        </fieldset>
      )}

      <FormatFields idPrefix="edit-format" goalLimit={game.goalLimit} matchMinutes={game.matchMinutes} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-periods">Таймов в матче</Label>
        <select
          id="edit-periods"
          name="periods"
          defaultValue={game.periods}
          className="h-11 rounded-lg border bg-background px-3 text-base"
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">Длительность выше — это один тайм.</p>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="autoSounds" defaultChecked={game.autoSounds} className="size-5 accent-primary" />
        Автозвуки: «Минута!» и финальный свисток
      </label>

      {state.error && <Notice variant="error">{state.error}</Notice>}
      <SubmitButton pendingText="Сохраняем…">Сохранить</SubmitButton>
    </form>
  );
}

function ConfirmDanger({
  text,
  confirm,
  action,
  redirectTo,
  onDone,
  onCancel,
}: {
  text: string;
  confirm: string;
  action: () => Promise<{ error?: string }>;
  redirectTo?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (r.error) {
        setError(r.error);
        return;
      }
      onDone();
      if (redirectTo) router.replace(redirectTo);
      else router.refresh();
    });
  }

  return (
    <>
      <p className="text-sm">{text}</p>
      {error && <Notice variant="error">{error}</Notice>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Отмена
        </Button>
        <Button variant="destructive" onClick={run} disabled={pending}>
          {pending ? "Подождите…" : confirm}
        </Button>
      </div>
    </>
  );
}
