"use client";

import { useActionState } from "react";
import { enterAction } from "@/lib/actions/entry";
import type { FormState } from "@/lib/forms";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/notice";
import { SubmitButton } from "@/components/submit-button";
import { useT } from "@/lib/i18n/client";

// First visit: one field. The page re-renders with the game as soon as the name is accepted.
export function EnterForm() {
  const t = useT();
  const [state, formAction] = useActionState<FormState, FormData>(enterAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="enter-name">{t("enter.name")}</Label>
        <Input
          id="enter-name"
          name="name"
          placeholder={t("enter.placeholder")}
          maxLength={40}
          required
          autoFocus
          autoComplete="given-name"
          className="h-14 text-lg"
        />
      </div>
      {state.error && <Notice variant="error">{state.error}</Notice>}
      <SubmitButton size="lg" className="h-14 text-base" pendingText={t("enter.pending")}>
        {t("enter.submit")}
      </SubmitButton>
    </form>
  );
}
