"use client";

import { WifiOff } from "lucide-react";
import { RetryButton } from "@/components/retry-button";
import { useT } from "@/lib/i18n/client";

// Text of the precached offline page, in the language saved on the device.
export function OfflineMessage() {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-4 pt-10 text-center">
      <WifiOff className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">{t("offline.title")}</h1>
      <p className="text-muted-foreground">{t("offline.text")}</p>
      <RetryButton />
    </div>
  );
}
