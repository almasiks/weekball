"use client";

import { useState, useTransition } from "react";
import { TriangleAlert, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/notice";
import { addPlayersAction } from "@/lib/actions/roster";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase().replace(/ё/g, "е");

type Props = { groupId: string; existingNames: string[] };

// Paste many names (one per line) -> preview with possible duplicates -> add.
export function AddPlayersForm({ groupId, existingNames }: Props) {
  const t = useT();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);

  const existing = new Set(existingNames.map(norm));
  const names = text
    .split(/\r?\n/)
    .map((n) => n.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const seen = new Map<string, number>();
  names.forEach((n) => seen.set(norm(n), (seen.get(norm(n)) ?? 0) + 1));
  const preview = names.map((n) => ({
    name: n,
    duplicate: existing.has(norm(n)) ? t("roster.dupExists") : (seen.get(norm(n)) ?? 0) > 1 ? t("roster.dupRepeated") : null,
  }));
  const dupCount = preview.filter((p) => p.duplicate).length;

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const r = await addPlayersAction(groupId, text);
      if (r.error) setMessage({ error: r.error });
      else {
        setMessage({ ok: t("roster.added", { count: r.added ?? 0 }) });
        setText("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="roster-names">{t("roster.namesLabel")}</Label>
        <textarea
          id="roster-names"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={"Азамат\nБекзат\nДанияр"}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </div>

      {preview.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-muted-foreground">
            {t("roster.willAdd", { count: preview.length })}
            {dupCount > 0 && t("roster.possibleDups", { count: dupCount })}
          </p>
          <ul className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto" aria-label={t("roster.preview")}>
            {preview.map((p, i) => (
              <li
                key={`${p.name}-${i}`}
                title={p.duplicate ?? undefined}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm",
                  p.duplicate && "border-amber-500/60 bg-amber-500/10 text-amber-800 dark:text-amber-300",
                )}
              >
                {p.duplicate && <TriangleAlert className="size-3.5" aria-label={p.duplicate} />}
                {p.name}
              </li>
            ))}
          </ul>
          {dupCount > 0 && (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {t("roster.dupHint")}
            </p>
          )}
        </div>
      )}

      {message?.error && <Notice variant="error">{message.error}</Notice>}
      {message?.ok && <Notice variant="success">{message.ok}</Notice>}
      <Button size="lg" disabled={pending || preview.length === 0} onClick={submit}>
        <UserPlus aria-hidden />
        {preview.length ? t("roster.addCount", { count: preview.length }) : t("roster.add")}
      </Button>
    </div>
  );
}
