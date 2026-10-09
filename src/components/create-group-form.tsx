"use client";

import { useActionState } from "react";
import { createGroupAction } from "@/lib/actions/groups";
import type { FormState } from "@/lib/forms";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/notice";
import { SubmitButton } from "@/components/submit-button";
import { useT } from "@/lib/i18n/client";

export function CreateGroupForm({ defaultName }: { defaultName?: string }) {
  const t = useT();
  const [state, formAction] = useActionState<FormState, FormData>(
    createGroupAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="groupName">{t("start.groupName")}</Label>
        <Input
          id="groupName"
          name="groupName"
          placeholder={t("start.groupNamePlaceholder")}
          maxLength={60}
          required
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="playerName">{t("start.yourName")}</Label>
        <Input
          id="playerName"
          name="playerName"
          placeholder={t("start.yourNamePlaceholder")}
          defaultValue={defaultName}
          maxLength={40}
          required
          autoComplete="given-name"
        />
      </div>
      {state.error && <Notice variant="error">{state.error}</Notice>}
      <SubmitButton size="lg" pendingText={t("start.creating")}>
        {t("start.submit")}
      </SubmitButton>
    </form>
  );
}
