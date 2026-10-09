"use client";

import { IdentityPicker } from "@/components/identity-picker";
import { chooseNameAction } from "@/lib/actions/entry";
import { useT } from "@/lib/i18n/client";

// "Кто ты?" in the profile, for a device that has no player yet.
export function ChooseName({ names }: { names: string[] }) {
  const t = useT();
  return <IdentityPicker names={names} submitLabel={t("identity.confirm")} onSubmit={chooseNameAction} />;
}
