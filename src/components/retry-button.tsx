"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

export function RetryButton() {
  const t = useT();
  return (
    <Button size="lg" onClick={() => window.location.reload()}>
      <RotateCw aria-hidden />
      {t("common.tryAgain")}
    </Button>
  );
}
