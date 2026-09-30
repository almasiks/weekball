"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheck,
  CloudOff,
  Flag,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Sun,
  Undo2,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/notice";
import { BottomSheet } from "@/components/bottom-sheet";
import { EventFeed } from "@/components/match/event-feed";
import { Scoreboard, statusLabel } from "@/components/match/scoreboard";
import { StandingsTable } from "@/components/match/standings-table";
import { MatchSetup } from "@/components/live/match-setup";
import { LiveLinkPanel } from "@/components/live/live-link-panel";
import { signalTimeUp, useNow, useServerOffset, useWakeLock } from "@/lib/match/hooks";
import { useOutbox } from "@/lib/match/use-outbox";
import { saveSnapshot } from "@/lib/match/snapshot";
import { applyTimerCommand, computeElapsed, type TimerCommand } from "@/lib/match/timer";
import { computeScore, computeStandings } from "@/lib/match/score";
import type { EventPayload, QueueItem } from "@/lib/match/queue";
import type { EventType, LiveEvent, LiveMatch, LiveTeam } from "@/lib/match/types";
import { finishGameAction, reopenMatchAction } from "@/lib/actions/matches";
import { matchResultText, whatsappUrl } from "@/lib/share";
import { teamColor } from "@/lib/teams/colors";
import { cn } from "@/lib/utils";

const ASSIST_WINDOW_MS = 6000;

// Wall clock, read only from event handlers.
const clock = () => Date.now();

type Props = {
  gameId: string;
  gameStatus: string;
  teams: LiveTeam[];
  matches: LiveMatch[];
  events: LiveEvent[];
  names: Record<string, string>;
  liveToken: string | null;
  siteUrl: string;
  meta: { startsAt: string; timezone: string; place: string };
  // Offline shell: opened from the IndexedDB snapshot, no server actions / links.
  offline?: boolean;
  initialOffset?: number;
};

type Picker =
  | { step: "player"; type: EventType; teamId: string }
  | { step: "sub_in"; teamId: string; outId: string }
  | { step: "assist"; eventId: string; teamId: string; scorerId: string; until: number }
  | { step: "void"; event: LiveEvent }
  | null;

const EVENT_TITLE: Record<EventType, string> = {
  goal: "Кто забил?",
  own_goal: "Кто забил в свои ворота?",
  yellow: "Жёлтая карточка",
  red: "Красная карточка",
  sub: "Кто уходит?",
};

export function LiveConsole(props: Props) {
  const { gameId, teams, names, siteUrl } = props;
  const router = useRouter();
  const measuredOffset = useServerOffset();
  const offset = measuredOffset ?? props.initialOffset ?? 0;
  const now = useNow(250);
  const [picker, setPicker] = useState<Picker>(null);
  const [confirmFinish, setConfirmFinish] = useState<"match" | "game" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, startAction] = useTransition();

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refresh = useCallback(() => {
    clearTimeout(refreshTimer.current);
    // Never refresh offline or in the offline shell: Next would fall back to a full reload.
    if (props.offline || !navigator.onLine) return;
    refreshTimer.current = setTimeout(() => navigator.onLine && router.refresh(), 200);
  }, [router, props.offline]);
  const outbox = useOutbox(gameId, refresh, props.matches);

  // Keep the last server state on this device so the console can reopen offline.
  useEffect(() => {
    if (props.offline) return;
    saveSnapshot({
      gameId,
      savedAt: clock(),
      meta: props.meta,
      gameStatus: props.gameStatus,
      teams: props.teams,
      matches: props.matches,
      events: props.events,
      names: props.names,
      siteUrl: props.siteUrl,
      offset: measuredOffset ?? 0,
    });
  }, [gameId, props.offline, props.meta, props.gameStatus, props.teams, props.matches, props.events, props.names, props.siteUrl, measuredOffset]);

  // --- Optimistic state: server data + queued (unsent / just sent) actions, in order.
  const { matches, events } = useMemo(() => {
    let ms = props.matches;
    let es = props.events;
    for (const item of outbox.overlay) {
      if (item.kind === "timer") {
        ms = ms.map((m) =>
          m.id === item.matchId ? applyTimerCommand(m, item.command, Date.parse(item.clientTs)) : m,
        );
      } else if (item.kind === "event") {
        if (!es.some((e) => e.id === item.payload.id)) es = [...es, item.payload];
      } else {
        es = es.filter((e) => e.id !== item.eventId);
      }
    }
    ms = ms.map((m) => {
      const s = computeScore(m, es);
      return { ...m, score_a: s.a, score_b: s.b };
    });
    return { matches: ms, events: es };
  }, [props.matches, props.events, outbox.overlay]);

  const pendingEventIds = useMemo(
    () => new Set(outbox.pending.filter((i) => i.kind === "event").map((i) => i.id)),
    [outbox.pending],
  );

  // --- Current match
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const liveMatch = matches.find((m) => m.status === "live" || m.status === "break");
  const current =
    matches.find((m) => m.id === selectedId) ??
    liveMatch ??
    matches.find((m) => m.status === "scheduled") ??
    matches[matches.length - 1];
  const inPlay = current && (current.status === "live" || current.status === "break");
  const elapsed = current ? computeElapsed(current, now, offset) : null;

  const wakeLockSupported = useWakeLock(!!liveMatch);

  // --- One signal when regulation time runs out (the timer keeps going).
  const signaled = useRef(new Set<string>());
  useEffect(() => {
    if (!current || current.status !== "live" || current.timer_status !== "running" || !elapsed?.isOvertime) return;
    const key = `${current.id}:${current.period}`;
    if (signaled.current.has(key)) return;
    signaled.current.add(key);
    // Don't buzz for a period that was already over when the page loaded.
    if (elapsed.overtimeMs < 5000) signalTimeUp();
  }, [current, elapsed?.isOvertime, elapsed?.overtimeMs]);

  // The assist sheet closes by itself when its window ends (the goal is sent without an assist).
  const assistOpen = picker?.step === "assist" && now <= picker.until;

  const serverNowIso = () => new Date(clock() + offset).toISOString();

  function timer(command: TimerCommand) {
    if (!current) return;
    setActionError(null);
    outbox.enqueue({
      id: crypto.randomUUID(),
      kind: "timer",
      matchId: current.id,
      command,
      clientTs: serverNowIso(),
      createdAt: clock(),
      status: "pending",
    });
  }

  function addEvent(type: EventType, teamId: string, playerId: string, extra: Partial<EventPayload> = {}, holdMs = 0) {
    if (!current) return null;
    const e = computeElapsed(current, clock(), offset);
    const payload: EventPayload = {
      id: crypto.randomUUID(),
      match_id: current.id,
      type,
      team_id: teamId,
      player_id: playerId,
      assist_player_id: null,
      player_in_id: null,
      period: current.period,
      second: Math.floor(e.elapsedMs / 1000),
      ...extra,
    };
    outbox.enqueue({
      id: payload.id,
      kind: "event",
      matchId: current.id,
      payload,
      createdAt: clock(),
      status: "pending",
      holdUntil: holdMs ? clock() + holdMs : undefined,
    });
    return payload.id;
  }

  function pickPlayer(playerId: string) {
    if (!picker || picker.step !== "player") return;
    const { type, teamId } = picker;
    if (type === "sub") {
      setPicker({ step: "sub_in", teamId, outId: playerId });
      return;
    }
    if (type === "goal") {
      // Recorded now (score updates instantly); held a few seconds for an optional assist.
      const id = addEvent("goal", teamId, playerId, {}, ASSIST_WINDOW_MS);
      if (id) setPicker({ step: "assist", eventId: id, teamId, scorerId: playerId, until: clock() + ASSIST_WINDOW_MS });
      return;
    }
    addEvent(type, teamId, playerId);
    setPicker(null);
  }

  function finishAssist(assistId: string | null) {
    if (picker?.step !== "assist") return;
    outbox.update(picker.eventId, (item) =>
      item.kind === "event"
        ? { ...item, holdUntil: undefined, payload: { ...item.payload, assist_player_id: assistId } }
        : item,
    );
    setPicker(null);
  }

  // Undo: an unsent event is simply dropped from the queue; a sent one is voided.
  function voidEvent(event: LiveEvent) {
    const queued = outbox.pending.find((i) => i.id === event.id);
    if (queued) {
      outbox.remove(event.id);
    } else {
      outbox.enqueue({
        id: `void:${event.id}`,
        kind: "void",
        matchId: event.match_id,
        eventId: event.id,
        createdAt: clock(),
        status: "pending",
      });
    }
    setPicker(null);
  }

  const currentEvents = current ? events.filter((e) => e.match_id === current.id) : [];
  // "Last" = most recently recorded: queued ones first (newest last), else latest by time.
  const lastEvent =
    [...outbox.overlay].reverse().find(
      (i): i is Extract<QueueItem, { kind: "event" }> =>
        i.kind === "event" && i.matchId === current?.id && currentEvents.some((e) => e.id === i.id),
    )?.payload ??
    [...currentEvents].sort((a, b) => a.period - b.period || a.second - b.second).at(-1);

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const goalCounts = new Map<string, number>();
  for (const e of events) if (e.type === "goal") goalCounts.set(e.player_id, (goalCounts.get(e.player_id) ?? 0) + 1);
  const rosterFor = (teamId: string, sortByGoals: boolean, exclude?: string) =>
    [...(teamById.get(teamId)?.players ?? [])]
      .filter((p) => p.id !== exclude)
      .sort(
        (a, b) =>
          (sortByGoals ? (goalCounts.get(b.id) ?? 0) - (goalCounts.get(a.id) ?? 0) : 0) ||
          a.name.localeCompare(b.name, "ru"),
      );

  const standings = computeStandings(teams, matches);
  const anyLive = !!liveMatch;
  const anyFinished = matches.some((m) => m.status === "finished");
  const gameFinished = props.gameStatus === "finished";

  function runAction(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setActionError(null);
    startAction(async () => {
      const r = await fn();
      if (r.error) setActionError(r.error);
      else after?.();
    });
  }

  // ------------------------------------------------------------------ render
  return (
    <div className="flex flex-col gap-4">
      <SyncBar online={outbox.online} pending={outbox.pending.length} />

      {outbox.rejected.map((item) => (
        <Notice key={item.id} variant="error">
          <div className="flex items-start gap-2">
            <span className="flex-1">
              Не принято сервером: {describeItem(item, names)} — {item.error}
            </span>
            <button
              type="button"
              className="-m-2 flex size-11 shrink-0 items-center justify-center"
              aria-label="Скрыть"
              onClick={() => outbox.remove(item.id)}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </Notice>
      ))}

      {!wakeLockSupported && anyLive && (
        <Notice>
          <Sun className="mr-1 inline size-4" aria-hidden />
          Браузер не умеет держать экран включённым — отключите автоблокировку на время матча.
        </Notice>
      )}

      <MatchSetup
        gameId={gameId}
        teams={teams}
        matches={matches}
        currentId={current?.id ?? null}
        onSelect={setSelectedId}
        disabled={gameFinished}
      />

      {current && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Scoreboard
              match={current}
              teams={teams}
              scoreA={current.score_a}
              scoreB={current.score_b}
              offset={offset}
              big
            />

            {/* Timer controls */}
            {!gameFinished && (
              <div className="grid grid-cols-2 gap-2">
                {current.status === "scheduled" && (
                  <Button
                    size="lg"
                    className="col-span-2 h-16 text-lg"
                    disabled={anyLive && liveMatch?.id !== current.id}
                    onClick={() => timer({ kind: "start" })}
                  >
                    <Play aria-hidden />
                    Старт
                  </Button>
                )}
                {current.status === "live" && current.timer_status === "running" && (
                  <Button size="lg" variant="secondary" className="h-16 text-lg" onClick={() => timer({ kind: "pause" })}>
                    <Pause aria-hidden />
                    Пауза
                  </Button>
                )}
                {current.status === "live" && current.timer_status === "paused" && (
                  <Button size="lg" className="h-16 text-lg" onClick={() => timer({ kind: "resume" })}>
                    <Play aria-hidden />
                    Продолжить
                  </Button>
                )}
                {current.status === "live" && current.period < current.periods && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-16 text-lg"
                    onClick={() => timer({ kind: "break", period: current.period })}
                  >
                    <SkipForward aria-hidden />
                    Перерыв
                  </Button>
                )}
                {current.status === "live" && current.period >= current.periods && (
                  <Button size="lg" variant="outline" className="h-16 text-lg" onClick={() => setConfirmFinish("match")}>
                    <Flag aria-hidden />
                    Завершить
                  </Button>
                )}
                {current.status === "break" && (
                  <Button
                    size="lg"
                    className="col-span-2 h-16 text-lg"
                    onClick={() => timer({ kind: "next_period", period: current.period + 1 })}
                  >
                    <Play aria-hidden />
                    Начать {current.period + 1}-й тайм
                  </Button>
                )}
                {current.status === "finished" && (
                  <Button
                    variant="outline"
                    className="col-span-2"
                    disabled={pendingAction || anyLive}
                    onClick={() => runAction(() => reopenMatchAction(gameId, current.id))}
                  >
                    <RotateCcw aria-hidden />
                    Вернуть матч (отменить завершение)
                  </Button>
                )}
              </div>
            )}

            {/* Events */}
            {inPlay && (
              <div className="grid grid-cols-2 gap-3">
                {[current.team_a_id, current.team_b_id].map((teamId) => {
                  const team = teamById.get(teamId);
                  const color = teamColor(team?.color ?? "#9e9e9e");
                  return (
                    <div key={teamId} className="flex flex-col gap-2">
                      <Button
                        size="lg"
                        className={cn(
                          "h-16 text-lg font-bold",
                          color.ink === "light" ? "text-white" : "text-neutral-900",
                          color.hex === "#ffffff" && "border border-foreground/20",
                        )}
                        style={{ backgroundColor: color.hex }}
                        onClick={() => setPicker({ step: "player", type: "goal", teamId })}
                      >
                        ⚽ Гол
                      </Button>
                      <span className="truncate text-center text-xs text-muted-foreground">{team?.name}</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Button variant="outline" className="px-1 text-sm" onClick={() => setPicker({ step: "player", type: "own_goal", teamId })}>
                          Автогол
                        </Button>
                        <Button variant="outline" className="px-1 text-sm" onClick={() => setPicker({ step: "player", type: "sub", teamId })}>
                          🔄 Замена
                        </Button>
                        <Button variant="outline" className="px-1 text-sm" onClick={() => setPicker({ step: "player", type: "yellow", teamId })}>
                          🟨 Жёлтая
                        </Button>
                        <Button variant="outline" className="px-1 text-sm" onClick={() => setPicker({ step: "player", type: "red", teamId })}>
                          🟥 Красная
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {inPlay && lastEvent && (
              <Button variant="secondary" onClick={() => voidEvent(lastEvent)}>
                <Undo2 aria-hidden />
                Отменить последнее событие
              </Button>
            )}

            {current.status === "finished" && (
              <a
                href={whatsappUrl(
                  matchResultText({ match: current, teams, events, names, url: `${siteUrl}/match/${current.id}` }),
                )}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants(), "w-full bg-[#075E54] text-white hover:bg-[#064c44]")}
              >
                <MessageCircle aria-hidden />
                Поделиться результатом
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {actionError && <Notice variant="error">{actionError}</Notice>}

      {current && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>События матча</CardTitle>
          </CardHeader>
          <CardContent>
            <EventFeed
              events={currentEvents}
              matches={matches}
              teams={teams}
              names={names}
              pendingIds={pendingEventIds}
              // Also after the game: corrections (the game page then offers "Пересчитать").
              onVoid={(e) => setPicker({ step: "void", event: e })}
            />
          </CardContent>
        </Card>
      )}

      {anyFinished && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Таблица вечера</CardTitle>
          </CardHeader>
          <CardContent>
            <StandingsTable rows={standings} />
          </CardContent>
        </Card>
      )}

      {!gameFinished && anyFinished && !anyLive && (
        <Button size="lg" variant="outline" onClick={() => setConfirmFinish("game")}>
          <CircleCheck aria-hidden />
          Завершить игру
        </Button>
      )}

      {!props.offline && <LiveLinkPanel gameId={gameId} token={props.liveToken} siteUrl={siteUrl} />}

      {/* ---------------- Sheets ---------------- */}
      <BottomSheet
        open={picker?.step === "player" || picker?.step === "sub_in"}
        title={
          picker?.step === "player"
            ? `${EVENT_TITLE[picker.type]} · ${teamById.get(picker.teamId)?.name ?? ""}`
            : "Кто выходит?"
        }
        onClose={() => setPicker(null)}
      >
        {picker?.step === "player" && picker.type === "own_goal" && (
          <p className="text-sm text-muted-foreground">
            Гол засчитается команде соперника.
          </p>
        )}
        {(picker?.step === "player" || picker?.step === "sub_in") &&
          rosterFor(
            picker.teamId,
            picker.step === "player" && picker.type === "goal",
            picker.step === "sub_in" ? picker.outId : undefined,
          ).map((p) => (
            <Button
              key={p.id}
              variant="outline"
              className="h-12 justify-start text-base"
              onClick={() => {
                if (picker.step === "sub_in") {
                  addEvent("sub", picker.teamId, picker.outId, { player_in_id: p.id });
                  setPicker(null);
                } else {
                  pickPlayer(p.id);
                }
              }}
            >
              {p.name}
              {picker.step === "player" && picker.type === "goal" && (goalCounts.get(p.id) ?? 0) > 0 && (
                <span className="ml-auto text-sm text-muted-foreground">⚽ {goalCounts.get(p.id)}</span>
              )}
            </Button>
          ))}
        {(picker?.step === "player" || picker?.step === "sub_in") &&
          (teamById.get(picker.teamId)?.players.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">В команде нет игроков — добавьте их в «Командах».</p>
          )}
      </BottomSheet>

      <BottomSheet
        open={assistOpen}
        title="Гол записан. Кто отдал пас?"
        onClose={() => finishAssist(null)}
      >
        {assistOpen && picker?.step === "assist" && (
          <>
            <div className="h-1 overflow-hidden rounded bg-muted" aria-hidden>
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${Math.max(0, ((picker.until - now) / ASSIST_WINDOW_MS) * 100)}%` }}
              />
            </div>
            <Button className="h-12 text-base" onClick={() => finishAssist(null)}>
              Без ассиста
            </Button>
            {rosterFor(picker.teamId, false, picker.scorerId).map((p) => (
              <Button key={p.id} variant="outline" className="h-12 justify-start text-base" onClick={() => finishAssist(p.id)}>
                {p.name}
              </Button>
            ))}
          </>
        )}
      </BottomSheet>

      <BottomSheet open={picker?.step === "void"} title="Отменить событие?" onClose={() => setPicker(null)}>
        {picker?.step === "void" && (
          <>
            <p className="text-sm">
              {describeEvent(picker.event, names)}. Счёт пересчитается, событие останется в истории как
              отменённое.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setPicker(null)}>
                Нет
              </Button>
              <Button variant="destructive" onClick={() => voidEvent(picker.event)}>
                Отменить
              </Button>
            </div>
          </>
        )}
      </BottomSheet>

      <BottomSheet
        open={!!confirmFinish}
        title={confirmFinish === "game" ? "Завершить игру?" : "Завершить матч?"}
        onClose={() => setConfirmFinish(null)}
      >
        <p className="text-sm">
          {confirmFinish === "game"
            ? "Неначатые матчи удалятся, итоги попадут в статистику. Вернуть игру будет нельзя."
            : current && `Итог: ${current.score_a}:${current.score_b}. Завершение можно отменить, пока игра идёт.`}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setConfirmFinish(null)}>
            Нет
          </Button>
          <Button
            disabled={pendingAction}
            onClick={() => {
              if (confirmFinish === "match") {
                timer({ kind: "finish" });
                setConfirmFinish(null);
              } else {
                runAction(
                  async () => {
                    const r = await finishGameAction(gameId);
                    if (r.error) return r;
                    // Statistics + ratings. If this fails, the game page shows "Пересчитать".
                    await fetch(`/api/games/${gameId}/finalize`, { method: "POST" }).catch(() => null);
                    return {};
                  },
                  () => {
                    setConfirmFinish(null);
                    router.push(`/game/${gameId}`);
                  },
                );
              }
            }}
          >
            Завершить
          </Button>
        </div>
      </BottomSheet>

      {current && inPlay && (
        <p className="text-center text-xs text-muted-foreground">
          {statusLabel(current)} · события пишутся с текущей минутой таймера
        </p>
      )}
    </div>
  );
}

function SyncBar({ online, pending }: { online: boolean; pending: number }) {
  const synced = pending === 0;
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium",
        synced ? "bg-primary/10 text-primary" : "bg-amber-500/15 text-amber-800 dark:text-amber-300",
      )}
    >
      {synced ? <CircleCheck className="size-4" aria-hidden /> : <CloudOff className="size-4" aria-hidden />}
      {synced ? "Синхронизировано" : `Не отправлено: ${pending}`}
      {!online && <span className="ml-auto text-xs">нет сети — всё сохранится</span>}
    </div>
  );
}

function describeEvent(e: Pick<LiveEvent, "type" | "player_id">, names: Record<string, string>) {
  const who = names[e.player_id] ?? "игрок";
  const what = { goal: "Гол", own_goal: "Автогол", yellow: "Жёлтая", red: "Красная", sub: "Замена" }[e.type];
  return `${what}: ${who}`;
}

function describeItem(item: QueueItem, names: Record<string, string>) {
  if (item.kind === "event") return describeEvent(item.payload, names);
  if (item.kind === "void") return "отмена события";
  return "команда таймера";
}
