"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setPlayerLevelAction } from "@/lib/actions/teams";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

const LEVELS = [1, 2, 3, 4, 5];

export function LevelPicker({ playerId, level, name }: { playerId: string; level: number; name: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [current, setOptimistic] = useOptimistic(level);
  const [error, setError] = useState<string | null>(null);

  function pick(next: number) {
    if (next === current) return;
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      const result = await setPlayerLevelAction(playerId, next);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div role="radiogroup" aria-label={t("common.levelOf", { name })} className="flex gap-1.5">
        {LEVELS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={current === value}
            disabled={pending}
            onClick={() => pick(value)}
            className={cn(
              "flex h-11 min-w-11 flex-1 items-center justify-center rounded-lg border text-sm font-semibold transition-colors",
              current === value
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted",
            )}
          >
            {value}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
