"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/notice";
import { PlayerChip } from "@/components/teams/player-chip";
import { TeamHeader } from "@/components/teams/team-header";
import { draftPickAction, endDraftAction } from "@/lib/actions/teams";
import { draftTeamIndex } from "@/lib/teams/draft";
import type { GameView } from "@/lib/games";

type Props = { view: GameView; userId: string | null; isOrganizer: boolean };

export function DraftPanel({ view, userId, isOrganizer }: Props) {
  const { game, teams, unassigned } = view;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const current = teams[draftTeamIndex(game.draft_turn, teams.length)];
  const captain = current?.team.captain_id
    ? view.going.find((p) => p.playerId === current.team.captain_id)
    : null;
  const isMyTurn = !!current && current.team.captain_id === userId;
  const canPick = isMyTurn || isOrganizer;

  function pick(playerId: string) {
    setError(null);
    startTransition(async () => {
      const result = await draftPickAction(game.id, playerId);
      if (result.error) setError(result.error);
    });
  }

  function end() {
    startTransition(async () => {
      const result = await endDraftAction(game.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {current && (
        <section
          aria-live="polite"
          className="flex flex-col gap-1 rounded-xl p-4"
          style={{ backgroundColor: `${current.color.hex}22` }}
        >
          <span className="text-sm text-muted-foreground">Ход {game.draft_turn + 1}</span>
          <span className="text-lg font-semibold">
            {current.color.emoji} Выбирают «{current.team.name}»
          </span>
          <span className="text-sm">
            {isMyTurn
              ? "Ваш ход — выберите игрока ниже."
              : captain
                ? `Капитан: ${captain.name}`
                : "Капитана нет — выбирает организатор."}
          </span>
        </section>
      )}

      {error && <Notice variant="error">{error}</Notice>}

      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-muted-foreground">
          Ещё не выбраны · {unassigned.length}
        </h2>
        {unassigned.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Все выбраны.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {unassigned.map((p) => (
              <li key={p.playerId}>
                <PlayerChip
                  player={p}
                  trailing={
                    canPick && (
                      <Button className="shrink-0" disabled={pending} onClick={() => pick(p.playerId)}>
                        Выбрать
                      </Button>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-3">
        {teams.map((t) => (
          <section key={t.team.id} className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <TeamHeader
              name={t.team.name}
              color={t.color}
              count={t.players.length}
              captainName={
                t.team.captain_id
                  ? view.going.find((p) => p.playerId === t.team.captain_id)?.name
                  : null
              }
              highlight={t.team.id === current?.team.id}
            />
            <ul className="flex flex-col gap-1 p-2">
              {t.players.length === 0 ? (
                <li className="px-1 py-2 text-sm text-muted-foreground">Пока никого</li>
              ) : (
                t.players.map((p) => (
                  <li key={p.playerId}>
                    <PlayerChip player={p} isCaptain={t.team.captain_id === p.playerId} showArrival={false} />
                  </li>
                ))
              )}
            </ul>
          </section>
        ))}
      </div>

      {isOrganizer && (
        <Button variant="outline" disabled={pending} onClick={end}>
          <Flag aria-hidden />
          Завершить драфт
        </Button>
      )}
    </div>
  );
}
