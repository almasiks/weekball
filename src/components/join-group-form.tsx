"use client";

import { useActionState } from "react";
import { joinGroupAction, type FormState } from "@/lib/actions/groups";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/notice";
import { SubmitButton } from "@/components/submit-button";

type Props = { code: string; defaultName?: string };

export function JoinGroupForm({ code, defaultName }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(
    joinGroupAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="code" value={code} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="playerName">Ваше имя</Label>
        <Input
          id="playerName"
          name="playerName"
          placeholder="Как вас называть в составе"
          defaultValue={defaultName}
          maxLength={40}
          required
          autoFocus={!defaultName}
          autoComplete="given-name"
        />
      </div>
      {state.error && <Notice variant="error">{state.error}</Notice>}
      <SubmitButton size="lg" pendingText="Вступаем…">
        Вступить в группу
      </SubmitButton>
    </form>
  );
}
