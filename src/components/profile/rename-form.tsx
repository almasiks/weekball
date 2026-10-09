"use client";

import { useActionState } from "react";
import { renameMeAction } from "@/lib/actions/entry";
import type { FormState } from "@/lib/forms";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/notice";
import { SubmitButton } from "@/components/submit-button";
import { useT } from "@/lib/i18n/client";

export function RenameForm({ name }: { name: string }) {
  const t = useT();
  const [state, formAction] = useActionState<FormState, FormData>(renameMeAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Label htmlFor="profile-name">{t("profile.name")}</Label>
      <div className="flex gap-2">
        <Input id="profile-name" name="name" defaultValue={name} maxLength={40} required autoComplete="given-name" />
        <SubmitButton variant="secondary" pendingText={t("common.saving")}>
          {t("common.save")}
        </SubmitButton>
      </div>
      {state.error && <Notice variant="error">{state.error}</Notice>}
      {state.ok && <Notice variant="success">{t("profile.saved")}</Notice>}
    </form>
  );
}
