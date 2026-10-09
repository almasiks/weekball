"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import type { Locale } from "./config";
import type { Messages, T } from "./messages";
import { createTranslator } from "./translate";

const I18nContext = createContext<T | null>(null);

// The (app) layout passes the messages of one language from the server,
// so the other languages are not downloaded.
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  const t = useMemo(() => createTranslator(locale, messages) as T, [locale, messages]);
  // The root layout is static (<html lang="ru">), so the real language is set here.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT(): T {
  const t = useContext(I18nContext);
  if (!t) throw new Error("useT() needs <I18nProvider> above it (see the (app) and (shell) layouts).");
  return t;
}

export function useLocale(): Locale {
  return useT().locale;
}
