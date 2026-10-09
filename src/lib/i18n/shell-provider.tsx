"use client";

import { useEffect, useState } from "react";
import { I18nProvider } from "./client";
import { DEFAULT_LOCALE, localeFromCookie, type Locale } from "./config";
import { getMessages } from "./messages";

// Offline shells are static and precached: no server, no cookies at render time.
// They carry every language and switch to the saved one after loading.
export function ShellI18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => {
    const saved = localeFromCookie(document.cookie);
    if (saved && saved !== DEFAULT_LOCALE) queueMicrotask(() => setLocale(saved));
  }, []);
  return (
    <I18nProvider locale={locale} messages={getMessages(locale)}>
      {children}
    </I18nProvider>
  );
}
