"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Re-runs the statistics / rating recalculation (POST /api/games/[id]/finalize).
export function RecalcButton({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/games/${gameId}/finalize`, { method: "POST" });
        if (!res.ok) throw new Error(String(res.status));
        router.refresh();
      } catch {
        setError("Не получилось. Проверьте интернет и попробуйте ещё раз.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" disabled={pending} onClick={run}>
        <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden />
        {pending ? "Пересчитываем…" : "Пересчитать"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
