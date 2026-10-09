"use client";

import { useActionState } from "react";
import { setMemberRoleAction } from "@/lib/actions/groups";
import type { FormState } from "@/lib/forms";
import type { MemberRole } from "@/lib/supabase/database.types";
import { SubmitButton } from "@/components/submit-button";
import { useT } from "@/lib/i18n/client";

type Props = { playerId: string; currentRole: MemberRole; disabled?: boolean };

export function MemberRoleButton({ playerId, currentRole, disabled }: Props) {
  const t = useT();
  const [state, formAction] = useActionState<FormState, FormData>(
    setMemberRoleAction,
    {},
  );
  const nextRole: MemberRole =
    currentRole === "organizer" ? "player" : "organizer";

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="role" value={nextRole} />
      <SubmitButton
        variant={nextRole === "organizer" ? "secondary" : "ghost"}
        className="text-sm"
        disabled={disabled}
      >
        {nextRole === "organizer" ? t("admin.makeOrganizer") : t("admin.removeOrganizer")}
      </SubmitButton>
      {state.error && (
        <p className="max-w-48 text-right text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
