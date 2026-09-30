"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setMyPositionAction } from "@/lib/actions/teams";
import { POSITIONS } from "@/lib/positions";
import type { PlayerPosition } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

// Player picks their own position; tapping the selected one clears it.
export function PositionPicker({ position }: { position: PlayerPosition | null }) {
  const [pending, startTransition] = useTransition();
  const [current, setOptimistic] = useOptimistic(position);
  const [error, setError] = useState<string | null>(null);

  function pick(value: PlayerPosition) {
    const next = value === current ? null : value;
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      const result = await setMyPositionAction(next);
      if (result.error) setError(result.error);
    });
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Моя позиция</legend>
      <div className="grid grid-cols-2 gap-2">
        {POSITIONS.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-pressed={current === p.value}
            disabled={pending}
            onClick={() => pick(p.value)}
            className={cn(
              "min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors",
              current === p.value
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </fieldset>
  );
}
