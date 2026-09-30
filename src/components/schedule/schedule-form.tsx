"use client";

import { useActionState, useEffect, useRef } from "react";
import { createScheduleAction, updateScheduleAction } from "@/lib/actions/games";
import type { FormState } from "@/lib/forms";
import type { ScheduleRow } from "@/lib/supabase/database.types";
import { WEEKDAYS, formatTime } from "@/lib/datetime";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/notice";
import { FormatFields } from "@/components/format-fields";
import { SubmitButton } from "@/components/submit-button";

export const selectClassName =
  "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type Props = { schedule?: ScheduleRow; onSaved?: () => void };

export function ScheduleForm({ schedule, onSaved }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(
    schedule ? updateScheduleAction : createScheduleAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const idPrefix = schedule ? `s-${schedule.id}` : "s-new";

  useEffect(() => {
    if (!state.ok) return;
    if (!schedule) formRef.current?.reset();
    onSaved?.();
  }, [state, schedule, onSaved]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      {schedule && <input type="hidden" name="scheduleId" value={schedule.id} />}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-weekday`}>День</Label>
          <select
            id={`${idPrefix}-weekday`}
            name="weekday"
            defaultValue={schedule?.weekday ?? 6}
            className={selectClassName}
          >
            {WEEKDAYS.map((label, i) => (
              <option key={label} value={i}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-time`}>Время</Label>
          <Input
            id={`${idPrefix}-time`}
            name="startTime"
            type="time"
            required
            defaultValue={schedule ? formatTime(schedule.start_time) : "19:00"}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-place`}>Место</Label>
        <Input
          id={`${idPrefix}-place`}
          name="place"
          maxLength={120}
          placeholder="Например, поле на Абая"
          defaultValue={schedule?.place ?? ""}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-max`}>Лимит игроков</Label>
        <Input
          id={`${idPrefix}-max`}
          name="maxPlayers"
          type="number"
          inputMode="numeric"
          min={2}
          max={100}
          required
          defaultValue={schedule?.max_players ?? 20}
        />
      </div>
      <FormatFields
        idPrefix={idPrefix}
        goalLimit={schedule ? schedule.goal_limit : undefined}
        matchMinutes={schedule?.match_minutes}
      />
      {state.error && <Notice variant="error">{state.error}</Notice>}
      <SubmitButton pendingText="Сохраняем…">
        {schedule ? "Сохранить" : "Добавить расписание"}
      </SubmitButton>
    </form>
  );
}
