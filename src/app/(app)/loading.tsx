"use client";

import { useT } from "@/lib/i18n/client";

export default function Loading() {
  const t = useT();
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={t("common.loading")}>
      <div className="h-7 w-2/3 animate-pulse rounded-md bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
