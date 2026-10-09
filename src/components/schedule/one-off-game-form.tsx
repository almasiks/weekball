"use client";

import { useActionState, useEffect, useRef } from "react";
import { createGameAction } from "@/lib/actions/games";
import type { FormState } from "@/lib/forms";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/notice";
import { FormatFields } from "@/components/format-fields";
import { SubmitButton } from "@/components/submit-button";
import { useT } from "@/lib/i18n/client";

export function OneOffGameForm({ today }: { today: string }) {
  const t = useT();
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
          <Label htmlFor="game-date">{t("schedule.date")}</Label>
          <Input id="game-date" name="date" type="date" min={today} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="game-time">{t("schedule.time")}</Label>
          <Input id="game-time" name="time" type="time" defaultValue="19:00" required />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="game-place">{t("schedule.place")}</Label>
        <Input id="game-place" name="place" maxLength={120} placeholder={t("schedule.placePlaceholder")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="game-max">{t("schedule.maxPlayers")}</Label>
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
      <FormatFields idPrefix="game" />
      {state.error && <Notice variant="error">{state.error}</Notice>}
      {state.ok && <Notice variant="success">{t("schedule.created")}</Notice>}
      <SubmitButton pendingText={t("schedule.creating")}>{t("schedule.createOneOff")}</SubmitButton>
    </form>
  );
}
