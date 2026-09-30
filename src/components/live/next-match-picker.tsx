"use client";

import { useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { selectClassName } from "@/components/schedule/schedule-form";
import { createMatchAction } from "@/lib/actions/matches";
import type { LiveMatch, LiveTeam } from "@/lib/match/types";

type Props = {
  gameId: string;
  teams: LiveTeam[];
  lastMatch: LiveMatch;
  onCreated: (matchId: string) => void;
};

// Winner stays on (on a draw: the first team), the team that rested comes in.
function suggestPair(teams: LiveTeam[], last: LiveMatch): [string, string] {
  const stays = last.score_b > last.score_a ? last.team_b_id : last.team_a_id;
  const other = last.score_b > last.score_a ? last.team_a_id : last.team_b_id;
  const rested = teams.find((t) => t.id !== last.team_a_id && t.id !== last.team_b_id);
  return [stays, rested?.id ?? other];
}

export function NextMatchPicker({ gameId, teams, lastMatch, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [[teamA, teamB], setPair] = useState(() => suggestPair(teams, lastMatch));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button
        size="lg"
        onClick={() => {
          setPair(suggestPair(teams, lastMatch));
          setOpen(true);
        }}
      >
        Следующий матч
        <ChevronRight aria-hidden />
      </Button>
    );
  }

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createMatchAction(gameId, teamA, teamB);
      if (result.error || !result.id) setError(result.error ?? "Не удалось создать матч.");
      else {
        setOpen(false);
        onCreated(result.id);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Следующий матч</p>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["next-a", "Команда 1", teamA, (v: string) => setPair([v, teamB])],
            ["next-b", "Команда 2", teamB, (v: string) => setPair([teamA, v])],
          ] as const
        ).map(([id, label, value, set]) => (
          <div key={id} className="flex flex-col gap-1">
            <Label htmlFor={id} className="text-xs text-muted-foreground">
              {label}
            </Label>
            <select id={id} className={selectClassName} value={value} onChange={(e) => set(e.target.value)}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
          Отмена
        </Button>
        <Button disabled={pending || teamA === teamB} onClick={create}>
          Создать
        </Button>
      </div>
    </div>
  );
}
