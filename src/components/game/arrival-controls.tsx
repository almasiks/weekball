"use client";

import { useState, useTransition } from "react";
import { Clock, MapPinCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setArrivalAction } from "@/lib/actions/games";
import type { ArrivalStatus } from "@/lib/supabase/database.types";
import { useT } from "@/lib/i18n/client";

const LATE_OPTIONS = [5, 10, 15, 30];

type Props = {
  gameId: string;
  arrival: ArrivalStatus;
  lateMinutes: number | null;
};

export function ArrivalControls({ gameId, arrival, lateMinutes }: Props) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [pickingLate, setPickingLate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(next: ArrivalStatus, minutes?: number) {
    setError(null);
    startTransition(async () => {
      const result = await setArrivalAction(gameId, next, minutes);
      if (result.error) setError(result.error);
      else setPickingLate(false);
    });
  }

  return (
    <section
      aria-labelledby={`arrival-${gameId}`}
      className="flex flex-col gap-3 rounded-lg border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={`arrival-${gameId}`} className="font-medium">
          {t("arrival.title")}
        </h2>
        <span className="text-sm text-muted-foreground">
          {arrival === "arrived" && t("arrival.youArrived")}
          {arrival === "late" && t("arrival.youLate", { minutes: lateMinutes ?? 0 })}
          {arrival === "pending" && t("arrival.notMarked")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={arrival === "late" || pickingLate ? "secondary" : "outline"}
          aria-expanded={pickingLate}
          disabled={pending}
          onClick={() => setPickingLate((v) => !v)}
        >
          <Clock aria-hidden />
          {t("arrival.late")}
        </Button>
        <Button
          variant={arrival === "arrived" ? "default" : "outline"}
          aria-pressed={arrival === "arrived"}
          disabled={pending}
          onClick={() => submit("arrived")}
        >
          <MapPinCheck aria-hidden />
          {t("arrival.here")}
        </Button>
      </div>

      {pickingLate && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t("arrival.howLate")}</p>
          <div className="grid grid-cols-4 gap-2">
            {LATE_OPTIONS.map((minutes) => (
              <Button
                key={minutes}
                variant={
                  arrival === "late" && lateMinutes === minutes
                    ? "default"
                    : "outline"
                }
                disabled={pending}
                onClick={() => submit("late", minutes)}
              >
                {minutes}
              </Button>
            ))}
          </div>
        </div>
      )}

      {arrival !== "pending" && (
        <Button
          variant="ghost"
          className="text-sm text-muted-foreground"
          disabled={pending}
          onClick={() => submit("pending")}
        >
          {t("arrival.reset")}
        </Button>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
