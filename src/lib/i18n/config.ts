// Interface languages. Russian is the source language and the fallback.
export const LOCALES = ["ru", "kk", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALE_COOKIE = "locale";

// Names are shown in their own language so anyone can find theirs.
export const LOCALE_NAMES: Record<Locale, string> = { ru: "Русский", kk: "Қазақша", en: "English" };
export const LOCALE_SHORT: Record<Locale, string> = { ru: "RU", kk: "KK", en: "EN" };

// BCP 47 tags for Intl (plural rules) and speechSynthesis.
export const LOCALE_TAGS: Record<Locale, string> = { ru: "ru-RU", kk: "kk-KZ", en: "en-GB" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** First supported language of an Accept-Language header ("kk-KZ,ru;q=0.9" -> "kk"). */
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  const wanted = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0], q: q === undefined ? 1 : Number(q) || 0 };
    })
    .filter((x) => x.lang)
    .sort((a, b) => b.q - a.q);
  for (const { lang } of wanted) {
    // "kz" is not a language code, but phones and people use it for Kazakh.
    const code = lang === "kz" ? "kk" : lang;
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}

/** Value of the language cookie in a `document.cookie` / Cookie header string. */
export function localeFromCookie(cookie: string | null | undefined): Locale | null {
  for (const part of (cookie ?? "").split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === LOCALE_COOKIE) return isLocale(value) ? value : null;
  }
  return null;
}
