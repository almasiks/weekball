"use client";

import { useActionState, useEffect, useRef } from "react";
import { createScheduleAction, updateScheduleAction } from "@/lib/actions/games";
import type { FormState } from "@/lib/forms";
import type { ScheduleRow } from "@/lib/supabase/database.types";
import { WEEKDAY_NUMBERS, formatTime, weekdayName } from "@/lib/datetime";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/notice";
import { FormatFields } from "@/components/format-fields";
import { SubmitButton } from "@/components/submit-button";
import { useT } from "@/lib/i18n/client";

export const selectClassName =
  "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type Props = { schedule?: ScheduleRow; onSaved?: () => void };

export function ScheduleForm({ schedule, onSaved }: Props) {
  const t = useT();
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
          <Label htmlFor={`${idPrefix}-weekday`}>{t("schedule.day")}</Label>
          <select
            id={`${idPrefix}-weekday`}
            name="weekday"
            defaultValue={schedule?.weekday ?? 6}
            className={selectClassName}
          >
            {WEEKDAY_NUMBERS.map((day) => (
              <option key={day} value={day}>
                {weekdayName(t, day)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-time`}>{t("schedule.time")}</Label>
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
        <Label htmlFor={`${idPrefix}-place`}>{t("schedule.place")}</Label>
        <Input
          id={`${idPrefix}-place`}
          name="place"
          maxLength={120}
          placeholder={t("schedule.placePlaceholder")}
          defaultValue={schedule?.place ?? ""}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-max`}>{t("schedule.maxPlayers")}</Label>
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
      <SubmitButton pendingText={t("common.saving")}>
        {schedule ? t("common.save") : t("schedule.add")}
      </SubmitButton>
    </form>
  );
}
