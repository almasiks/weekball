// Usable anywhere (server, client, tests): builds a translator without cookies or React.
import type { Locale } from "./config";
import { getMessages, type T } from "./messages";
import { createTranslator } from "./translate";

export type { Locale } from "./config";
export type { MessageKey, T } from "./messages";

const translators = new Map<Locale, T>();

export function translator(locale: Locale): T {
  let t = translators.get(locale);
  if (!t) translators.set(locale, (t = createTranslator(locale, getMessages(locale))));
  return t;
}
