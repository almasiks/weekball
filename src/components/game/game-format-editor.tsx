"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormatFields } from "@/components/format-fields";
import { Notice } from "@/components/notice";
import { SubmitButton } from "@/components/submit-button";
import { saveGameFormatAction } from "@/lib/actions/games";
import { formatLabel } from "@/lib/match/format";
import type { FormState } from "@/lib/forms";

type Props = { gameId: string; goalLimit: number | null; matchMinutes: number; autoSounds: boolean };

// Organizer: the match format of this game (copied from the schedule, editable per game).
export function GameFormatEditor({ gameId, goalLimit, matchMinutes, autoSounds }: Props) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await saveGameFormatAction(prev, formData);
    if (result.ok) setEditing(false);
    return result;
  }, {});

  if (!editing) {
    return (
      <div className="flex min-h-12 items-center gap-2 rounded-xl bg-card px-4 text-sm ring-1 ring-foreground/10">
        <span className="flex-1">
          <span className="text-muted-foreground">Формат матча: </span>
          <span className="font-medium">{formatLabel(goalLimit, matchMinutes)}</span>
          <span className="text-muted-foreground"> · автозвуки {autoSounds ? "вкл." : "выкл."}</span>
        </span>
        <Button variant="ghost" size="icon" aria-label="Изменить формат матча" onClick={() => setEditing(true)}>
          <Pencil aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <input type="hidden" name="gameId" value={gameId} />
      <FormatFields idPrefix="game-format" goalLimit={goalLimit} matchMinutes={matchMinutes} />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="autoSounds"
          defaultChecked={autoSounds}
          className="size-5 accent-primary"
        />
        Автозвуки: «Минута!» за минуту до конца и финальный свисток
      </label>
      <p className="text-xs text-muted-foreground">Изменение касается матчей, которые ещё не начались.</p>
      {state.error && <Notice variant="error">{state.error}</Notice>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => setEditing(false)}>
          Отмена
        </Button>
        <SubmitButton pendingText="Сохраняем…">Сохранить</SubmitButton>
      </div>
    </form>
  );
}
