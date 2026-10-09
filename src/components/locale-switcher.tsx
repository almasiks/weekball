"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { isLocale, LOCALE_COOKIE, LOCALE_NAMES, LOCALE_SHORT, LOCALES } from "@/lib/i18n/config";

// Language of this device. Saved in a cookie so the server renders the right language at once.
export function LocaleSwitcher() {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    if (!isLocale(next) || next === t.locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <label className="relative flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg px-2 text-sm font-medium text-muted-foreground focus-within:ring-3 focus-within:ring-ring/50">
      <span aria-hidden>{LOCALE_SHORT[t.locale]}</span>
      <select
        aria-label={t("common.language")}
        value={t.locale}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {LOCALE_NAMES[locale]}
          </option>
        ))}
      </select>
    </label>
  );
}
