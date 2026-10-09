"use client";

import { useActionState, useState } from "react";
import { Check, Search } from "lucide-react";
import { joinGroupAction } from "@/lib/actions/groups";
import type { FormState } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/notice";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

type Props = {
  code: string;
  defaultName?: string;
  // Roster names without an account: "Это я".
  claimable: { id: string; name: string }[];
};

export function JoinGroupForm({ code, defaultName, claimable }: Props) {
  const t = useT();
  const [state, formAction] = useActionState<FormState, FormData>(joinGroupAction, {});
  const [mode, setMode] = useState<"pick" | "new">(claimable.length ? "pick" : "new");
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const visible = claimable.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="code" value={code} />
      {mode === "pick" ? (
        <>
          <input type="hidden" name="claimPlayerId" value={picked ?? ""} />
          {claimable.length > 8 && (
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
          <ul className="grid max-h-[50dvh] grid-cols-2 gap-2 overflow-y-auto" aria-label={t("join.pickLabel")}>
            {visible.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={picked === p.id}
                  onClick={() => setPicked(p.id)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium",
                    picked === p.id ? "border-primary bg-primary/10" : "bg-background",
                  )}
                >
                  {picked === p.id && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                  <span className="truncate">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {state.error && <Notice variant="error">{state.error}</Notice>}
          <SubmitButton size="lg" disabled={!picked} pendingText={t("join.signingIn")}>
            {t("join.itsMe")}
          </SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setMode("new")}>
            {t("join.notInList")}
          </Button>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="playerName">{t("start.yourName")}</Label>
            <Input
              id="playerName"
              name="playerName"
              placeholder={t("start.yourNamePlaceholder")}
              defaultValue={defaultName}
              maxLength={40}
              required
              autoFocus={!defaultName}
              autoComplete="given-name"
            />
          </div>
          {state.error && <Notice variant="error">{state.error}</Notice>}
          <SubmitButton size="lg" pendingText={t("join.joining")}>
            {t("join.submit")}
          </SubmitButton>
          {claimable.length > 0 && (
            <Button type="button" variant="ghost" onClick={() => setMode("pick")}>
              {t("join.findMe")}
            </Button>
          )}
        </>
      )}
    </form>
  );
}
