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
import { statusLabel } from "@/lib/game-status";
import { formatLabel } from "@/lib/match/format";
import { bestPlayersText, rankBestPlayers, whatsappUrl } from "@/lib/share";
import type { FormState } from "@/lib/forms";
import type { GamePlayerStatRow, GameStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n";

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
  const t = useT();
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);
  const name = gameName(t, game);

  return (
    <section className="flex flex-col gap-2" aria-label={t("cards.label")}>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={tileClass} onClick={() => setSheet("best")}>
          <Trophy className="size-5 text-amber-500" aria-hidden />
          {t("cards.best")}
        </button>
        <Link href="/history" className={tileClass}>
          <History className="size-5 text-primary" aria-hidden />
          {t("cards.history")}
        </Link>
        {isOrganizer && (
          <button type="button" className={tileClass} onClick={() => setSheet("edit")}>
            <Pencil className="size-5 text-primary" aria-hidden />
            {t("cards.edit")}
          </button>
        )}
        {isOrganizer && (
          <button type="button" className={tileClass} onClick={() => setSheet("reset")}>
            <RotateCcw className="size-5 text-amber-600" aria-hidden />
            {t("cards.reset")}
          </button>
        )}
        <button type="button" className={tileClass} onClick={() => setSheet("info")}>
          <Info className="size-5 text-primary" aria-hidden />
          {t("cards.info")}
        </button>
        <Link href="/results" className={tileClass}>
          <CalendarRange className="size-5 text-primary" aria-hidden />
          {t("cards.allResults")}
        </Link>
        {isOrganizer && (
          <button
            type="button"
            className={cn(tileClass, "col-span-2 min-h-14 flex-row items-center text-destructive ring-destructive/30")}
            onClick={() => setSheet("delete")}
          >
            <Trash2 className="size-5" aria-hidden />
            {t("cards.delete")}
          </button>
        )}
      </div>

      <BottomSheet open={sheet === "best"} title={t("cards.best")} onClose={close}>
        <BestPlayers game={game} stats={stats} isOrganizer={isOrganizer} siteUrl={props.siteUrl} />
      </BottomSheet>
      <BottomSheet open={sheet === "info"} title={t("cards.info")} onClose={close}>
        <GameInfo {...props} />
      </BottomSheet>
      {isOrganizer && (
        <>
          <BottomSheet open={sheet === "edit"} title={t("cards.edit")} onClose={close}>
            <EditGameForm
              game={game}
              teamCount={props.teamCount}
              teamsEditable={props.teamsEditable}
              onDone={close}
            />
          </BottomSheet>
          <BottomSheet open={sheet === "reset"} title={t("cards.resetTitle")} onClose={close}>
            <ConfirmDanger
              text={t("cards.resetText", { name })}
              confirm={t("cards.reset")}
              action={() => resetGameResultsAction(game.id)}
              onDone={close}
              onCancel={close}
            />
          </BottomSheet>
          <BottomSheet open={sheet === "delete"} title={t("cards.deleteTitle")} onClose={close}>
            <ConfirmDanger
              text={t("cards.deleteText", { name })}
              confirm={t("cards.delete")}
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

function gameName(t: T, game: Pick<GameCardsGame, "title" | "startsAt" | "timezone">) {
  return game.title ?? formatGameDate(t, game.startsAt, game.timezone);
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
  const t = useT();
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

  const text = bestPlayersText(t, {
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
          {t("cards.mvpLabel")} <strong>{mvp?.name ?? t("cards.mvpNone")}</strong>
        </span>
      </div>

      {best.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{t("cards.bestEmpty")}</p>
      ) : (
        <ol className="flex flex-col divide-y">
          {best.map((p, i) => (
            <li key={p.player_id} className="flex min-h-11 items-center gap-2">
              <span className="w-5 text-right text-sm text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {p.goals} ⚽ · {p.assists} 🅰️ · {p.wins} {t("gameStats.col.wins.short")}
              </span>
            </li>
          ))}
        </ol>
      )}

      {isOrganizer && stats.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="mvp-select">{t("cards.pickMvp")}</Label>
          <select
            id="mvp-select"
            value={game.mvpId ?? ""}
            disabled={pending}
            onChange={(e) => pickMvp(e.target.value || null)}
            className="h-11 rounded-lg border bg-background px-3 text-base"
          >
            <option value="">{t("cards.mvpNoneOption")}</option>
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
          {t("common.shareWhatsapp")}
        </a>
      )}
    </>
  );
}

function GameInfo({ game, isOrganizer, goingCount, presentCount, teamCount, creatorName, siteUrl }: Props) {
  const t = useT();
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
      setError(t("cards.copyFailed"));
    }
  }

  const rows: [string, string][] = [
    [t("cards.rowTitle"), game.title ?? "—"],
    [t("cards.rowWhen"), formatGameDate(t, game.startsAt, game.timezone)],
    [t("cards.rowWhere"), game.place || "—"],
    [t("cards.rowStatus"), statusLabel(t, game.status)],
    [t("cards.rowSigned"), t("cards.signedOf", { going: goingCount, max: game.maxPlayers })],
    [t("cards.rowCame"), String(presentCount)],
    [t("cards.rowTeams"), String(teamCount)],
    [
      t("cards.rowFormat"),
      `${formatLabel(t, game.goalLimit, game.matchMinutes)}${game.periods > 1 ? ` ${t("cards.periodsTimes", { count: game.periods })}` : ""}`,
    ],
    [t("cards.rowAutoSounds"), game.autoSounds ? t("cards.on") : t("cards.off")],
    [t("cards.rowCreator"), creatorName ?? "—"],
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
        <p className="text-sm font-medium">{t("cards.liveTitle")}</p>
        <p className="text-xs text-muted-foreground">
          {t("cards.liveText")}
        </p>
        {liveUrl ? (
          <>
            <Input readOnly value={liveUrl} aria-label={t("cards.liveLabel")} onFocus={(e) => e.target.select()} />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={copy}>
                <Copy aria-hidden />
                {copied ? t("cards.copied") : t("cards.copy")}
              </Button>
              <a
                href={whatsappUrl(t("share.watchLive", { url: liveUrl }))}
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
                {t("cards.liveOff")}
              </Button>
            )}
          </>
        ) : isOrganizer ? (
          <Button variant="secondary" disabled={pending} onClick={() => toggleLive(true)}>
            {t("cards.liveOn")}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">{t("cards.liveNotEnabled")}</p>
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
  const t = useT();
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
        <Label htmlFor="edit-title">{t("cards.titleOptional")}</Label>
        <Input id="edit-title" name="title" maxLength={60} defaultValue={game.title ?? ""} placeholder={t("cards.titlePlaceholder")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-date">{t("schedule.date")}</Label>
          <Input id="edit-date" name="date" type="date" required defaultValue={initial.date} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-time">{t("schedule.time")}</Label>
          <Input id="edit-time" name="time" type="time" required defaultValue={initial.time} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-place">{t("schedule.place")}</Label>
        <Input id="edit-place" name="place" maxLength={120} defaultValue={game.place} />
      </div>

      {teamsEditable && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t("cards.teamCount")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {[2, 3].map((n) => (
              <Button
                key={n}
                type="button"
                variant={count === n ? "default" : "outline"}
                aria-pressed={count === n}
                onClick={() => setCount(n)}
              >
                {t("game.teamsCount", { count: n })}
              </Button>
            ))}
          </div>
        </fieldset>
      )}

      <FormatFields idPrefix="edit-format" goalLimit={game.goalLimit} matchMinutes={game.matchMinutes} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-periods">{t("cards.periods")}</Label>
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
        <p className="text-xs text-muted-foreground">{t("cards.periodsHint")}</p>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="autoSounds" defaultChecked={game.autoSounds} className="size-5 accent-primary" />
        {t("cards.autoSounds")}
      </label>

      {state.error && <Notice variant="error">{state.error}</Notice>}
      <SubmitButton pendingText={t("common.saving")}>{t("common.save")}</SubmitButton>
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
  const t = useT();
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
          {t("cards.cancel")}
        </Button>
        <Button variant="destructive" onClick={run} disabled={pending}>
          {pending ? t("cards.wait") : confirm}
        </Button>
      </div>
    </>
  );
}
