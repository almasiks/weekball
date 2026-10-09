"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

// Re-runs the statistics / rating recalculation (POST /api/games/[id]/finalize).
export function RecalcButton({ gameId }: { gameId: string }) {
  const t = useT();
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
        setError(t("game.recalcFailed"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" disabled={pending} onClick={run}>
        <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden />
        {pending ? t("game.recalculating") : t("game.recalc")}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
