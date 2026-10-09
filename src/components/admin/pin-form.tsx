"use client";

import { useActionState } from "react";
import { adminPinAction } from "@/lib/actions/entry";
import type { FormState } from "@/lib/forms";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/notice";
import { SubmitButton } from "@/components/submit-button";
import { useT } from "@/lib/i18n/client";

// Organizer entry. The PIN is checked on the server (ADMIN_PIN); a right one
// re-renders /admin with the organizer screen.
export function PinForm() {
  const t = useT();
  const [state, formAction] = useActionState<FormState, FormData>(adminPinAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-pin">{t("adminPin.label")}</Label>
        <Input
          id="admin-pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={64}
          required
          autoFocus
          className="h-14 text-center text-xl tracking-widest"
        />
      </div>
      {state.error && <Notice variant="error">{state.error}</Notice>}
      <SubmitButton size="lg" pendingText={t("adminPin.pending")}>
        {t("adminPin.submit")}
      </SubmitButton>
    </form>
  );
}
