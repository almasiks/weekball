"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_GOAL_LIMIT, DEFAULT_MATCH_MINUTES } from "@/lib/match/format";

type Props = {
  idPrefix: string;
  goalLimit?: number | null; // null = no limit
  matchMinutes?: number;
};

// Match format inside a form: fields goalLimit / noGoalLimit / matchMinutes.
export function FormatFields({ idPrefix, goalLimit, matchMinutes }: Props) {
  const [noLimit, setNoLimit] = useState(goalLimit === null);

  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">Формат матча</legend>
      <div className="grid grid-cols-2 items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-goals`}>Лимит голов</Label>
          <Input
            id={`${idPrefix}-goals`}
            name="goalLimit"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            defaultValue={goalLimit ?? DEFAULT_GOAL_LIMIT}
            disabled={noLimit}
            required={!noLimit}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-minutes`}>Длительность, мин</Label>
          <Input
            id={`${idPrefix}-minutes`}
            name="matchMinutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            defaultValue={matchMinutes ?? DEFAULT_MATCH_MINUTES}
            required
          />
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="noGoalLimit"
          checked={noLimit}
          onChange={(e) => setNoLimit(e.target.checked)}
          className="size-5 accent-primary"
        />
        Без лимита голов
      </label>
      <p className="text-xs text-muted-foreground">
        Матч заканчивается, когда команда забила лимит голов или вышло время — что раньше.
      </p>
    </fieldset>
  );
}
