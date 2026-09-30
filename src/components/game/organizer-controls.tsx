"use client";

import { useState, useTransition } from "react";
import { Ban, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setGameStatusAction } from "@/lib/actions/games";
import type { GameStatus } from "@/lib/supabase/database.types";

type Props = { gameId: string; status: GameStatus };

export function OrganizerControls({ gameId, status }: Props) {
  const [pending, startTransition] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "cancelled" || status === "finished") return null;

  function submit(next: "signup" | "closed" | "cancelled") {
    setError(null);
    startTransition(async () => {
      const result = await setGameStatusAction(gameId, next);
      if (result.error) setError(result.error);
      setConfirmCancel(false);
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">
        Управление игрой
      </h3>
      {status === "signup" && (
        <Button variant="secondary" disabled={pending} onClick={() => submit("closed")}>
          <Lock aria-hidden />
          Закрыть запись
        </Button>
      )}
      {status === "closed" && (
        <Button variant="secondary" disabled={pending} onClick={() => submit("signup")}>
          <LockOpen aria-hidden />
          Открыть запись
        </Button>
      )}
      {confirmCancel ? (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 p-3">
          <p className="text-sm">
            Отменить игру? Вернуть её будет нельзя — игроки увидят, что игра
            отменена.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={pending} onClick={() => setConfirmCancel(false)}>
              Нет
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => submit("cancelled")}>
              Да, отменить
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" className="text-destructive" disabled={pending} onClick={() => setConfirmCancel(true)}>
          <Ban aria-hidden />
          Отменить игру
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
