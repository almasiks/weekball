"use client";

import { useActionState } from "react";
import { createGroupAction, type FormState } from "@/lib/actions/groups";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/notice";
import { SubmitButton } from "@/components/submit-button";

export function CreateGroupForm({ defaultName }: { defaultName?: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    createGroupAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="groupName">Название группы</Label>
        <Input
          id="groupName"
          name="groupName"
          placeholder="Футбол по субботам"
          maxLength={60}
          required
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="playerName">Ваше имя</Label>
        <Input
          id="playerName"
          name="playerName"
          placeholder="Как вас называть в составе"
          defaultValue={defaultName}
          maxLength={40}
          required
          autoComplete="given-name"
        />
      </div>
      {state.error && <Notice variant="error">{state.error}</Notice>}
      <SubmitButton size="lg" pendingText="Создаём…">
        Создать группу
      </SubmitButton>
    </form>
  );
}
