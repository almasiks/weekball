"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Pencil,
  Shuffle,
  Sparkles,
  Swords,
  Timer,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/notice";
import { BottomSheet } from "@/components/bottom-sheet";
import { PlayerChip, type ChipPlayer } from "@/components/teams/player-chip";
import { TeamEditor } from "@/components/teams/team-editor";
import { TeamHeader } from "@/components/teams/team-header";
import { ShareTeamsButton } from "@/components/teams/share-teams-button";
import { QuickAddPlayer } from "@/components/teams/quick-add-player";
import {
  addLatePlayerAction,
  autoBuildAction,
  movePlayerAction,
  setLockedAction,
  setPublishedAction,
  setTeamCountAction,
  startDraftAction,
  type ActionResult,
} from "@/lib/actions/teams";
import { strengthGapPercent, suggestTeamCount } from "@/lib/teams/balance";
import { playerStrength } from "@/lib/teams/strength";
import type { GameView, TeamView } from "@/lib/games";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

const UNASSIGNED = "unassigned";

type Props = {
  view: GameView;
  shareUrl: string;
};

type Move = { playerId: string; teamId: string | null };

export function TeamsBoard({ view, shareUrl }: Props) {
  const { game, teams, going } = view;
  const tr = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [menuPlayerId, setMenuPlayerId] = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Server truth: playerId -> teamId. Optimistic layer for instant drag & drop.
  const serverMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const p of going) map[p.playerId] = null;
    for (const t of teams) for (const p of t.players) map[p.playerId] = t.team.id;
    return map;
  }, [going, teams]);
  const [assignment, applyMove] = useOptimistic(serverMap, (state, move: Move) => ({
    ...state,
    [move.playerId]: move.teamId,
  }));

  const meta = useMemo(() => {
    const map = new Map<string, ChipPlayer>();
    for (const p of going) map.set(p.playerId, p);
    for (const t of teams) for (const p of t.players) map.set(p.playerId, p);
    return map;
  }, [going, teams]);

  const columns = teams.map((t) => {
    const players = going
      .filter((p) => assignment[p.playerId] === t.team.id)
      .map((p) => meta.get(p.playerId)!);
    return { view: t, players, strength: players.reduce((s, p) => s + playerStrength(p), 0) };
  });
  // Pool: "only present" (default as soon as someone is checked in) or everyone signed up.
  const presentCount = going.filter((p) => p.arrival === "arrived").length;
  const [poolMode, setPoolMode] = useState<"present" | "all" | null>(null);
  const presentOnly = (poolMode ?? (presentCount > 0 ? "present" : "all")) === "present";
  const allUnassigned = going.filter((p) => !assignment[p.playerId]).map((p) => meta.get(p.playerId)!);
  const unassigned = presentOnly ? allUnassigned.filter((p) => p.arrival === "arrived") : allUnassigned;
  const assignedCount = going.length - allUnassigned.length;
  const gap = columns.length >= 2 ? strengthGapPercent(columns.map((c) => c.strength)) : null;
  const suggestion = suggestTeamCount(going.length);
  const published = !!game.teams_published_at;
  const captainIds = new Set(teams.map((t) => t.team.captain_id).filter(Boolean));

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  function move(playerId: string, teamId: string | null) {
    if (assignment[playerId] === teamId) return;
    setMenuPlayerId(null);
    setError(null);
    startTransition(async () => {
      applyMove({ playerId, teamId });
      const result = await movePlayerAction(game.id, playerId, teamId);
      if (result.error) setError(result.error);
    });
  }

  // Touch: short press on the grip starts a drag; the rest of the page scrolls normally.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
  );

  function onDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }
  function onDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    if (!event.over) return;
    const target = String(event.over.id);
    move(String(event.active.id), target === UNASSIGNED ? null : target);
  }

  const menuPlayer = menuPlayerId ? meta.get(menuPlayerId) : null;
  const menuTeamId = menuPlayerId ? assignment[menuPlayerId] : null;
  const draggingPlayer = draggingId ? meta.get(draggingId) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Team count */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">{tr("teams.teamCount")}</h2>
          <span className="text-sm text-muted-foreground">
            {tr("teams.goingCount", { count: going.length })}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={tr("teams.teamCount")}>
          {([2, 3] as const).map((count) => (
            <Button
              key={count}
              variant={teams.length === count ? "default" : "outline"}
              aria-pressed={teams.length === count}
              disabled={pending}
              onClick={() => run(() => setTeamCountAction(game.id, count))}
            >
              {tr("game.teamsCount", { count })}
            </Button>
          ))}
        </div>
        {going.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {suggestion.options
              .map((o) => tr("teams.sizeOption", { teams: o.teams, sizes: formatSizes(o.sizes) }))
              .join(tr("teams.or"))}
            {" · "}
            {tr("teams.suggest", { count: suggestion.recommended })}
          </p>
        )}
      </section>

      {teams.length === 0 ? (
        <Notice>{tr("teams.pickCount")}</Notice>
      ) : (
        <>
          {/* Actions */}
          <section className="grid grid-cols-2 gap-2">
            <Button
              className="col-span-2"
              size="lg"
              disabled={pending || going.length === 0}
              onClick={() =>
                run(() => autoBuildAction(game.id, Math.floor(Math.random() * 2 ** 31), presentOnly))
              }
            >
              {assignedCount > captainIds.size ? <Shuffle aria-hidden /> : <Sparkles aria-hidden />}
              {assignedCount > captainIds.size ? tr("teams.rebuild") : tr("teams.autoBuild")}
            </Button>
            <Button
              variant="outline"
              disabled={pending || unassigned.length === 0}
              onClick={() => run(() => startDraftAction(game.id))}
            >
              <Swords aria-hidden />
              {tr("teams.draft")}
            </Button>
            <Button
              variant={published ? "secondary" : "outline"}
              disabled={pending}
              onClick={() => run(() => setPublishedAction(game.id, !published))}
            >
              {published ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              {published ? tr("teams.hide") : tr("teams.publish")}
            </Button>
          </section>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className={published ? "font-medium text-primary" : "text-muted-foreground"}>
              {published ? tr("teams.published") : tr("teams.notPublished")}
            </span>
            {gap !== null && assignedCount > 0 && (
              <span
                className={cn(
                  "font-medium",
                  gap <= 10 ? "text-primary" : "text-amber-700 dark:text-amber-400",
                )}
              >
                {tr("teams.gap", { gap })}
              </span>
            )}
          </div>

          {error && <Notice variant="error">{error}</Notice>}

          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={tr("teams.poolLabel")}>
            {(
              [
                ["present", tr("teams.presentOnly", { count: presentCount })],
                ["all", tr("teams.allSigned", { count: going.length })],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={(mode === "present") === presentOnly}
                onClick={() => setPoolMode(mode)}
                className={cn(
                  "min-h-11 rounded-lg border px-2 text-sm font-medium",
                  (mode === "present") === presentOnly ? "border-primary bg-primary/10 text-primary" : "bg-background",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <QuickAddPlayer gameId={game.id} />

          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            {/* Unassigned */}
            <DropZone id={UNASSIGNED} className="rounded-xl border border-dashed p-2">
              <h3 className="flex items-center gap-1.5 px-1 pb-1 text-sm font-medium">
                <Users className="size-4" aria-hidden />
                {tr("teams.unassignedCount", { count: unassigned.length })}
              </h3>
              {unassigned.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted-foreground">
                  {presentOnly && allUnassigned.length > 0
                    ? tr("teams.allPresentIn", { count: allUnassigned.length })
                    : tr("teams.allIn")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {unassigned.map((p) => (
                    <li key={p.playerId}>
                      <DraggableChip
                        player={p}
                        onTap={() => setMenuPlayerId(p.playerId)}
                        trailing={
                          <Button
                            variant="secondary"
                            className="shrink-0 px-3 text-sm"
                            disabled={pending}
                            onClick={() => run(() => addLatePlayerAction(game.id, p.playerId))}
                          >
                            <UserPlus aria-hidden />
                            {tr("teams.addLate")}
                          </Button>
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </DropZone>

            {/* Teams */}
            {columns.map(({ view: t, players, strength }) => (
              <DropZone
                key={t.team.id}
                id={t.team.id}
                className="overflow-hidden rounded-xl ring-1 ring-foreground/10"
              >
                <TeamHeader
                  t={tr}
                  name={t.team.name}
                  color={t.color}
                  count={players.length}
                  strength={strength}
                  captainName={t.team.captain_id ? meta.get(t.team.captain_id)?.name : null}
                  trailing={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-inherit hover:bg-black/10"
                      aria-label={tr("teams.editTeam", { name: t.team.name })}
                      onClick={() => setEditingTeamId(editingTeamId === t.team.id ? null : t.team.id)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                  }
                />
                {editingTeamId === t.team.id && (
                  <TeamEditor
                    gameId={game.id}
                    team={t}
                    usedColors={teams.map((x) => x.team.color)}
                    going={going}
                    onDone={() => setEditingTeamId(null)}
                  />
                )}
                <ul className="flex min-h-14 flex-col gap-1 p-2">
                  {players.length === 0 && (
                    <li className="px-1 py-2 text-sm text-muted-foreground">
                      {tr("teams.dropHere")}
                    </li>
                  )}
                  {players.map((p) => (
                    <li key={p.playerId}>
                      <DraggableChip
                        player={p}
                        isCaptain={t.team.captain_id === p.playerId}
                        onTap={() => setMenuPlayerId(p.playerId)}
                      />
                    </li>
                  ))}
                </ul>
              </DropZone>
            ))}

            <DragOverlay>
              {draggingPlayer && (
                <PlayerChip player={draggingPlayer} className="shadow-lg ring-2 ring-primary" />
              )}
            </DragOverlay>
          </DndContext>

          {teams.length >= 2 && assignedCount > 0 && (
            <Link
              href={`/game/${game.id}/live`}
              className={cn(buttonVariants({ size: "lg" }), "h-14 w-full text-base")}
            >
              <Timer aria-hidden />
              {game.status === "live" ? tr("game.runMatch") : tr("teams.startMatch")}
            </Link>
          )}

          <ShareTeamsButton
            t={tr}
            startsAt={game.starts_at}
            timezone={game.timezone}
            url={shareUrl}
            teams={columns.map(({ view: t, players }) => ({
              emoji: t.color.emoji,
              name: t.team.name,
              players: players.map((p) => p.name),
            }))}
          />
        </>
      )}

      <BottomSheet
        open={!!menuPlayer}
        title={menuPlayer ? tr("teams.moveTitle", { name: menuPlayer.name }) : ""}
        onClose={() => setMenuPlayerId(null)}
      >
        {menuPlayer && (
          <>
            {teams.map((t: TeamView) => (
              <Button
                key={t.team.id}
                variant={menuTeamId === t.team.id ? "secondary" : "outline"}
                className="justify-start"
                disabled={pending || menuTeamId === t.team.id}
                onClick={() => move(menuPlayer.playerId, t.team.id)}
              >
                <span
                  aria-hidden
                  className="size-4 rounded-full border border-foreground/20"
                  style={{ backgroundColor: t.color.hex }}
                />
                {t.team.name}
                {menuTeamId === t.team.id && tr("teams.hereNow")}
              </Button>
            ))}
            <Button
              variant="outline"
              className="justify-start"
              disabled={pending || !menuTeamId}
              onClick={() => move(menuPlayer.playerId, null)}
            >
              <Users aria-hidden />
              {tr("teams.unassigned")}
            </Button>
            {menuTeamId ? (
              <Button
                variant="ghost"
                className="justify-start"
                disabled={pending}
                onClick={() => {
                  const id = menuPlayer.playerId;
                  setMenuPlayerId(null);
                  run(() => setLockedAction(game.id, id, !menuPlayer.isLocked));
                }}
              >
                {menuPlayer.isLocked ? <LockOpen aria-hidden /> : <Lock aria-hidden />}
                {menuPlayer.isLocked ? tr("teams.unlock") : tr("teams.lock")}
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="justify-start"
                disabled={pending}
                onClick={() => {
                  const id = menuPlayer.playerId;
                  setMenuPlayerId(null);
                  run(() => addLatePlayerAction(game.id, id));
                }}
              >
                <UserPlus aria-hidden />
                {tr("teams.addToSmallest")}
              </Button>
            )}
          </>
        )}
      </BottomSheet>
    </div>
  );
}

function formatSizes(sizes: number[]) {
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  return min === max ? String(min) : `${min}–${max}`;
}

function DropZone({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={cn(className, isOver && "ring-2 ring-primary")}>
      {children}
    </section>
  );
}

function DraggableChip({
  player,
  isCaptain,
  onTap,
  trailing,
}: {
  player: ChipPlayer;
  isCaptain?: boolean;
  onTap: () => void;
  trailing?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: player.playerId,
  });
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <PlayerChip
        player={player}
        isCaptain={isCaptain}
        onTap={onTap}
        trailing={trailing}
        handle={{ ref: setActivatorNodeRef, ...attributes, ...listeners }}
      />
    </div>
  );
}
