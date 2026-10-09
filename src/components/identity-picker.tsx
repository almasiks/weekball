"use client";

import { useState, useTransition } from "react";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/notice";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type Props = {
  // Roster names nobody has taken yet (added by the organizer).
  names: string[];
  submitLabel: string;
  // Returns an error text, or nothing when it worked (the page then re-renders).
  onSubmit: (name: string) => Promise<{ error?: string }>;
};

// "Кто ты?" — asked only when it is needed (the first "Иду"), never on entry.
// Pick yourself in the roster, or type a name if you are not there.
export function IdentityPicker({ names, submitLabel, onSubmit }: Props) {
  const t = useT();
  const [mode, setMode] = useState<"pick" | "new">(names.length ? "pick" : "new");
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const name = mode === "pick" ? picked : typed.trim();
  const visible = names.filter((n) => n.toLowerCase().includes(query.trim().toLowerCase()));

  function submit() {
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(name);
      if (result.error) setError(result.error);
    });
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {mode === "pick" ? (
        <>
          <p className="text-sm text-muted-foreground">{t("identity.pickText")}</p>
          {names.length > 8 && (
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                aria-label={t("common.searchByName")}
                placeholder={t("common.searchByName")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          )}
          <ul className="grid max-h-[40dvh] grid-cols-2 gap-2 overflow-y-auto" aria-label={t("identity.pickLabel")}>
            {visible.map((n) => (
              <li key={n}>
                <button
                  type="button"
                  aria-pressed={picked === n}
                  onClick={() => setPicked(n)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium",
                    picked === n ? "border-primary bg-primary/10" : "bg-background",
                  )}
                >
                  {picked === n && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                  <span className="truncate">{n}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="identity-name">{t("identity.name")}</Label>
          <Input
            id="identity-name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t("identity.placeholder")}
            maxLength={40}
            autoFocus
            autoComplete="given-name"
            className="h-12 text-base"
          />
          <p className="text-xs text-muted-foreground">{t("identity.newText")}</p>
        </div>
      )}

      {error && <Notice variant="error">{error}</Notice>}

      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending || !name}>
        {pending ? t("identity.pending") : submitLabel}
      </Button>

      {names.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setError(null);
            setMode(mode === "pick" ? "new" : "pick");
          }}
        >
          {mode === "pick" ? t("identity.notInList") : t("identity.backToList")}
        </Button>
      )}
    </form>
  );
}
