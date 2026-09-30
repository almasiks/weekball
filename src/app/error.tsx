"use client";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/notice";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col gap-4 pt-4">
      <Notice variant="error">
        Не удалось загрузить страницу. Проверьте интернет и попробуйте ещё раз.
      </Notice>
      <Button onClick={reset}>Повторить</Button>
    </div>
  );
}
