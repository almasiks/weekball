"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setSignupAction } from "@/lib/actions/games";
import type { SignupStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

type Props = { gameId: string; current: SignupStatus | null };

export function SignupButtons({ gameId, current }: Props) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isIn = current === "going" || current === "waitlist";
  const isOut = current === "declined";

  function submit(wantsToCome: boolean) {
    setError(null);
    setTarget(wantsToCome);
    startTransition(async () => {
      const result = await setSignupAction(gameId, wantsToCome);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="lg"
          variant={isIn ? "default" : "outline"}
          aria-pressed={isIn}
          disabled={pending}
          onClick={() => submit(true)}
        >
          {pending && target === true ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <Check aria-hidden />
          )}
          {t("game.in")}
        </Button>
        <Button
          size="lg"
          variant="outline"
          aria-pressed={isOut}
          disabled={pending}
          onClick={() => submit(false)}
          className={cn(
            isOut &&
              "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15",
          )}
        >
          {pending && target === false ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <X aria-hidden />
          )}
          {t("game.out")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
