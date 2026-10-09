"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPlayerStatsAction, setPlayerStatsAction, type PlayerTotals } from "@/lib/actions/stats";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";

const FIELDS: { key: keyof PlayerTotals; label: MessageKey }[] = [
  { key: "goals", label: "stats.col.goals.title" },
  { key: "assists", label: "stats.col.assists.title" },
  { key: "wins", label: "gameStats.col.wins.label" },
  { key: "draws", label: "gameStats.col.draws.label" },
  { key: "losses", label: "gameStats.col.losses.label" },
  { key: "yellows", label: "stats.col.yellows.title" },
  { key: "reds", label: "stats.col.reds.title" },
];

type Props = { playerId: string; name: string; totals: PlayerTotals; adjusted: boolean };

// Organizer only: the pencil in a row of "Статистика" opens the player's all-time
// totals as plain numbers. What is typed is what the tables show.
export function StatsEditor({ playerId, name, totals, adjusted }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<keyof PlayerTotals, string>>(() => toText(totals));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function show() {
    setValues(toText(totals));
    setError(null);
    setOpen(true);
  }

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  function save() {
    const next = {} as PlayerTotals;
    for (const { key } of FIELDS) {
      const n = Number(values[key]);
      if (values[key].trim() === "" || !Number.isInteger(n) || n < 0 || n > 9999) {
        setError(t("stats.editInvalid"));
        return;
      }
      next[key] = n;
    }
    run(() => setPlayerStatsAction(playerId, next));
  }

  return (
    <>
      <Button variant="ghost" size="icon" aria-label={t("stats.editFor", { name })} onClick={show}>
        <Pencil aria-hidden />
      </Button>
      <BottomSheet open={open} title={name} onClose={() => setOpen(false)}>
        <p className="text-sm text-muted-foreground">{t("stats.editText")}</p>
        {/* noValidate: our own hint instead of the browser bubble */}
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {FIELDS.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <Label htmlFor={`stat-${playerId}-${key}`}>{t(label)}</Label>
                <Input
                  id={`stat-${playerId}-${key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={9999}
                  value={values[key]}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          {error && <Notice variant="error">{error}</Notice>}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? t("common.saving") : t("common.save")}
          </Button>
          {adjusted && (
            <Button
              type="button"
              variant="ghost"
              className="text-sm text-muted-foreground"
              disabled={pending}
              onClick={() => run(() => resetPlayerStatsAction(playerId))}
            >
              {t("stats.editReset")}
            </Button>
          )}
        </form>
      </BottomSheet>
    </>
  );
}

function toText(totals: PlayerTotals) {
  return Object.fromEntries(FIELDS.map(({ key }) => [key, String(totals[key])])) as Record<keyof PlayerTotals, string>;
}
