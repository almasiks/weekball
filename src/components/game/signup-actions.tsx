"use client";

import { useState, useTransition } from "react";
import { Check, Clock, LoaderCircle, MapPinCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setArrivalAction, setSignupAction } from "@/lib/actions/games";
import type { ArrivalStatus, SignupStatus } from "@/lib/supabase/database.types";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const LATE_OPTIONS = [5, 10, 15, 30];

type Props = {
  gameId: string;
  status: SignupStatus | null;
  arrival: ArrivalStatus;
  lateMinutes: number | null;
  // Sign-up is open: "Иду" / "Не иду" are available.
  canSignup: boolean;
};

// The main button of the game card. Not signed up: one big "Иду".
// Signed up: "Не иду" and, for players in the squad, "Опаздываю" / "Я на месте" next to it.
export function SignupActions({ gameId, status, arrival, lateMinutes, canSignup }: Props) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [pickingLate, setPickingLate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isIn = status === "going" || status === "waitlist";
  const inSquad = status === "going";

  function signup(wantsToCome: boolean) {
    setError(null);
    setBusy(wantsToCome ? "in" : "out");
    startTransition(async () => {
      const result = await setSignupAction(gameId, wantsToCome);
      if (result.error) setError(result.error);
      setBusy(null);
      setPickingLate(false);
    });
  }

  function arrive(next: ArrivalStatus, minutes?: number) {
    setError(null);
    startTransition(async () => {
      const result = await setArrivalAction(gameId, next, minutes);
      if (result.error) setError(result.error);
      else setPickingLate(false);
    });
  }

  if (!isIn && !canSignup) return null;

  return (
    <div className="flex flex-col gap-2">
      {!isIn ? (
        <Button size="lg" className="h-14 w-full text-lg" disabled={pending} onClick={() => signup(true)}>
          {busy === "in" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          {t("game.in")}
        </Button>
      ) : (
        <div className={cn("grid gap-2", inSquad && canSignup ? "grid-cols-3" : inSquad ? "grid-cols-2" : "grid-cols-1")}>
          {canSignup && (
            <Button
              variant="outline"
              className="h-12 px-1 text-sm"
              disabled={pending}
              onClick={() => signup(false)}
            >
              {busy === "out" ? <LoaderCircle className="animate-spin" aria-hidden /> : <X aria-hidden />}
              {t("game.out")}
            </Button>
          )}
          {inSquad && (
            <>
              <Button
                variant={arrival === "late" || pickingLate ? "secondary" : "outline"}
                className="h-12 px-1 text-sm"
                aria-expanded={pickingLate}
                disabled={pending}
                onClick={() => setPickingLate((v) => !v)}
              >
                <Clock aria-hidden />
                {t("arrival.late")}
              </Button>
              <Button
                variant={arrival === "arrived" ? "default" : "outline"}
                className="h-12 px-1 text-sm"
                aria-pressed={arrival === "arrived"}
                disabled={pending}
                onClick={() => arrive("arrived")}
              >
                <MapPinCheck aria-hidden />
                {t("arrival.here")}
              </Button>
            </>
          )}
        </div>
      )}

      {inSquad && pickingLate && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t("arrival.howLate")}</p>
          <div className="grid grid-cols-4 gap-2">
            {LATE_OPTIONS.map((minutes) => (
              <Button
                key={minutes}
                variant={arrival === "late" && lateMinutes === minutes ? "default" : "outline"}
                disabled={pending}
                onClick={() => arrive("late", minutes)}
              >
                {minutes}
              </Button>
            ))}
          </div>
        </div>
      )}

      {inSquad && arrival !== "pending" && (
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {arrival === "arrived" ? t("arrival.youArrived") : t("arrival.youLate", { minutes: lateMinutes ?? 0 })}
          </span>
          <Button variant="ghost" className="text-sm text-muted-foreground" disabled={pending} onClick={() => arrive("pending")}>
            {t("arrival.reset")}
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
