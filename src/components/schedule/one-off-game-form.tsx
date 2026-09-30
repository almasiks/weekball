"use client";

import { useActionState, useEffect, useRef } from "react";
import { createGameAction } from "@/lib/actions/games";
import type { FormState } from "@/lib/forms";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/notice";
import { SubmitButton } from "@/components/submit-button";

export function OneOffGameForm({ today }: { today: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    createGameAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="game-date">Дата</Label>
          <Input id="game-date" name="date" type="date" min={today} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="game-time">Время</Label>
          <Input id="game-time" name="time" type="time" defaultValue="19:00" required />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="game-place">Место</Label>
        <Input id="game-place" name="place" maxLength={120} placeholder="Например, поле на Абая" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="game-max">Лимит игроков</Label>
        <Input
          id="game-max"
          name="maxPlayers"
          type="number"
          inputMode="numeric"
          min={2}
          max={100}
          defaultValue={20}
          required
        />
      </div>
      {state.error && <Notice variant="error">{state.error}</Notice>}
      {state.ok && <Notice variant="success">Игра создана, запись открыта.</Notice>}
      <SubmitButton pendingText="Создаём…">Создать разовую игру</SubmitButton>
    </form>
  );
}
