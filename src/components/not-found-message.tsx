"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

export function NotFoundMessage() {
  const t = useT();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-4 pt-16 text-center">
      <p className="text-5xl" aria-hidden>
        🥅
      </p>
      <h1 className="text-xl font-semibold">{t("common.notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("common.notFoundText")}</p>
      <Link href="/" className={buttonVariants({ size: "lg" })}>
        {t("common.home")}
      </Link>
    </main>
  );
}
