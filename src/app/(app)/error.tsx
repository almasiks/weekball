"use client";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/notice";
import { useT } from "@/lib/i18n/client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4 pt-4">
      <Notice variant="error">{t("common.pageError")}</Notice>
      <Button onClick={reset}>{t("common.retry")}</Button>
    </div>
  );
}
