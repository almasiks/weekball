"use client";

import { useState, useTransition } from "react";
import { Plus, Shuffle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/notice";
import { selectClassName } from "@/components/schedule/schedule-form";
import {
  createMatchAction,
  deleteMatchAction,
  generateRoundRobinAction,
  updateMatchSettingsAction,
} from "@/lib/actions/matches";
import type { LiveMatch, LiveTeam } from "@/lib/match/types";
import { statusLabel } from "@/components/match/scoreboard";
import { teamColor } from "@/lib/teams/colors";
import { cn } from "@/lib/utils";

type Props = {
  gameId: string;
  teams: LiveTeam[];
  matches: LiveMatch[];
  currentId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
};

function Settings({
  periods,
  minutes,
  onPeriods,
  onMinutes,
  idPrefix,
}: {
  periods: number;
  minutes: number;
  onPeriods: (v: number) => void;
  onMinutes: (v: number) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-periods`}>Таймов</Label>
        <select
          id={`${idPrefix}-periods`}
          className={selectClassName}
          value={periods}
          onChange={(e) => onPeriods(Number(e.target.value))}
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-minutes`}>Минут в тайме</Label>
        <Input
          id={`${idPrefix}-minutes`}
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          value={minutes}
          onChange={(e) => onMinutes(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

export function MatchSetup({ gameId, teams, matches, currentId, onSelect, disabled }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [periods, setPeriods] = useState(2);
  const [minutes, setMinutes] = useState(20);
  const [adding, setAdding] = useState(false);
  const [teamA, setTeamA] = useState(teams[0]?.id ?? "");
  const [teamB, setTeamB] = useState(teams[1]?.id ?? "");
  const current = matches.find((m) => m.id === currentId);
  const [editPeriods, setEditPeriods] = useState(current?.periods ?? 2);
  const [editMinutes, setEditMinutes] = useState(Math.round((current?.period_seconds ?? 1200) / 60));
  const [editingFor, setEditingFor] = useState(current?.id);
  const teamById = new Map(teams.map((t) => [t.id, t]));

  // Reset the settings editor when another match is selected.
  if (current && editingFor !== current.id) {
    setEditingFor(current.id);
    setEditPeriods(current.periods);
    setEditMinutes(Math.round(current.period_seconds / 60));
  }

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else after?.();
    });
  }

  if (teams.length < 2) {
    return <Notice>Сначала разделите игроков хотя бы на 2 команды.</Notice>;
  }

  const seconds = (m: number) => Math.round(Math.min(60, Math.max(1, m || 1)) * 60);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Матчи</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {matches.length === 0 ? (
          <>
            <Settings
              periods={periods}
              minutes={minutes}
              onPeriods={setPeriods}
              onMinutes={setMinutes}
              idPrefix="new"
            />
            <Button
              size="lg"
              disabled={pending || disabled}
              onClick={() => run(() => generateRoundRobinAction(gameId, periods, seconds(minutes)))}
            >
              <Shuffle aria-hidden />
              {teams.length === 2 ? "Создать матч" : `Сгенерировать матчи (${(teams.length * (teams.length - 1)) / 2})`}
            </Button>
          </>
        ) : (
          <ul className="flex flex-col gap-1.5" aria-label="Выбор матча">
            {matches.map((m) => {
              const a = teamById.get(m.team_a_id);
              const b = teamById.get(m.team_b_id);
              const selected = m.id === currentId;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(m.id)}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm",
                      selected ? "border-primary bg-primary/10" : "bg-background",
                    )}
                  >
                    <Dot color={a?.color} />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {a?.name} <span className="tabular-nums">{m.score_a}:{m.score_b}</span> {b?.name}
                    </span>
                    <Dot color={b?.color} />
                    <span className="shrink-0 text-xs text-muted-foreground">{statusLabel(m)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {current?.status === "scheduled" && !disabled && (
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Настройки матча</p>
            <Settings
              periods={editPeriods}
              minutes={editMinutes}
              onPeriods={setEditPeriods}
              onMinutes={setEditMinutes}
              idPrefix="edit"
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() => run(() => deleteMatchAction(gameId, current.id))}
              >
                <Trash2 aria-hidden />
                Удалить
              </Button>
              <Button
                variant="secondary"
                disabled={
                  pending ||
                  (editPeriods === current.periods && seconds(editMinutes) === current.period_seconds)
                }
                onClick={() =>
                  run(() => updateMatchSettingsAction(gameId, current.id, editPeriods, seconds(editMinutes)))
                }
              >
                Сохранить
              </Button>
            </div>
          </div>
        )}

        {matches.length > 0 && !disabled && (
          adding ? (
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  [teamA, setTeamA, "Команда 1"],
                  [teamB, setTeamB, "Команда 2"],
                ].map(([value, setter, label]) => (
                  <select
                    key={label as string}
                    aria-label={label as string}
                    className={selectClassName}
                    value={value as string}
                    onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
              <Settings periods={periods} minutes={minutes} onPeriods={setPeriods} onMinutes={setMinutes} idPrefix="add" />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setAdding(false)}>
                  Отмена
                </Button>
                <Button
                  disabled={pending || teamA === teamB}
                  onClick={() =>
                    run(() => createMatchAction(gameId, teamA, teamB, periods, seconds(minutes)), () => setAdding(false))
                  }
                >
                  Добавить
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus aria-hidden />
              Ещё матч
            </Button>
          )
        )}

        {error && <Notice variant="error">{error}</Notice>}
      </CardContent>
    </Card>
  );
}

function Dot({ color }: { color?: string }) {
  return (
    <span
      aria-hidden
      className="size-3 shrink-0 rounded-full border border-foreground/20"
      style={{ backgroundColor: teamColor(color ?? "#9e9e9e").hex }}
    />
  );
}
