"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BottomSheet } from "@/components/bottom-sheet";
import { quickAddPlayerAction } from "@/lib/actions/teams";
import { useT } from "@/lib/i18n/client";

// "Добавить нового игрока" in the team builder: created as present, appears in "Не распределены".
export function QuickAddPlayer({ gameId }: { gameId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [regular, setRegular] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean) return;
    setError(null);
    startTransition(async () => {
      const r = await quickAddPlayerAction(gameId, clean, regular);
      if (r.error) setError(r.error);
      else {
        setName("");
        setRegular(true);
        setOpen(false);
      }
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden />
        {t("checkin.addNew")}
      </Button>
      <BottomSheet open={open} title={t("checkin.newPlayer")} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="quick-player">{t("checkin.name")}</Label>
          <Input
            id="quick-player"
            value={name}
            maxLength={40}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={regular}
            onChange={(e) => setRegular(e.target.checked)}
            className="size-5 accent-primary"
          />
          {t("checkin.addToRoster")}
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button size="lg" disabled={pending || !name.trim()} onClick={add}>
          {t("teams.quickAdd")}
        </Button>
      </BottomSheet>
    </>
  );
}
