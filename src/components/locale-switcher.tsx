"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Globe } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { useT } from "@/lib/i18n/client";
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALE_SHORT, LOCALES, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

function saveLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

// Language of this device. Saved in a cookie so the server renders the right language at once.
export function LocaleSwitcher() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    setOpen(false);
    if (next === t.locale) return;
    saveLocale(next);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <button
        type="button"
        aria-label={`${t("common.language")}: ${LOCALE_NAMES[t.locale]}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-11 shrink-0 items-center gap-1.5 rounded-full px-1 text-sm font-semibold transition-opacity",
          pending && "opacity-60",
        )}
      >
        <span className="flex h-8 items-center gap-1.5 rounded-full border bg-muted/60 px-2.5 text-foreground/80">
          <Globe className="size-4 text-primary" aria-hidden />
          {LOCALE_SHORT[t.locale]}
        </span>
      </button>

      <BottomSheet open={open} title={t("common.language")} onClose={() => setOpen(false)}>
        <div role="radiogroup" aria-label={t("common.language")} className="flex flex-col gap-2 pb-1">
          {LOCALES.map((locale) => {
            const selected = locale === t.locale;
            return (
              <button
                key={locale}
                type="button"
                role="radio"
                aria-checked={selected}
                lang={locale}
                onClick={() => choose(locale)}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-xl border px-3 text-left transition-colors",
                  selected ? "border-primary bg-primary/10" : "bg-background hover:bg-muted/60",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {LOCALE_SHORT[locale]}
                </span>
                <span className="flex-1 text-base font-medium">{LOCALE_NAMES[locale]}</span>
                {selected && <Check className="size-5 text-primary" aria-hidden />}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}
