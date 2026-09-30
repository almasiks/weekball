"use client";

import { useCallback, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScheduleForm } from "@/components/schedule/schedule-form";
import { toggleScheduleAction } from "@/lib/actions/games";
import { WEEKDAYS, formatTime } from "@/lib/datetime";
import { formatLabel } from "@/lib/match/format";
import type { ScheduleRow } from "@/lib/supabase/database.types";

export function ScheduleItem({ schedule }: { schedule: ScheduleRow }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const closeEditor = useCallback(() => setEditing(false), []);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await toggleScheduleAction(schedule.id, !schedule.is_active);
      if (result.error) setError(result.error);
    });
  }

  return (
    <li className="flex flex-col gap-3 py-3">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">
            {WEEKDAYS[schedule.weekday]}, {formatTime(schedule.start_time)}
          </span>
          <span className="text-sm text-muted-foreground">
            {[schedule.place, `до ${schedule.max_players} игроков`, formatLabel(schedule.goal_limit, schedule.match_minutes)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <Badge variant={schedule.is_active ? "secondary" : "outline"}>
          {schedule.is_active ? "Активно" : "Отключено"}
        </Badge>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <ScheduleForm schedule={schedule} onSaved={closeEditor} />
          <Button variant="ghost" onClick={closeEditor}>
            Отмена
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Изменить
          </Button>
          <Button variant="outline" disabled={pending} onClick={toggle}>
            {schedule.is_active ? "Отключить" : "Включить"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}
