// Dictionary lookup with {placeholders} and plural forms. Messages are plain
// data (no functions), so a dictionary can be passed from server to client.
import { LOCALE_TAGS, type Locale } from "./config";

/** Plural forms chosen by Intl.PluralRules from the `count` parameter. */
export type Plural = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };
export type MessageTree = { [key: string]: string | Plural | MessageTree };

type Leaf = string | Plural;
/** Same shape as T, any wording: what a translation of T must look like. */
export type SameShape<T> = T extends string ? string : T extends Plural ? Plural : { [K in keyof T]: SameShape<T[K]> };
/** "game.signup.going" for every message of T. */
export type MessagePaths<T> = {
  [K in keyof T & string]: T[K] extends Leaf ? K : `${K}.${MessagePaths<T[K]>}`;
}[keyof T & string];

export type Params = Record<string, string | number>;

export type Translator<Key extends string = string> = {
  (key: Key, params?: Params): string;
  locale: Locale;
};

const rules = new Map<Locale, Intl.PluralRules>();
function pluralRules(locale: Locale) {
  let r = rules.get(locale);
  if (!r) rules.set(locale, (r = new Intl.PluralRules(LOCALE_TAGS[locale])));
  return r;
}

const isPlural = (v: unknown): v is Plural =>
  typeof v === "object" && v !== null && typeof (v as Plural).other === "string";

export function createTranslator<Key extends string = string>(locale: Locale, messages: MessageTree): Translator<Key> {
  const t = ((key: string, params?: Params) => {
    let node: string | Plural | MessageTree | undefined = messages;
    for (const part of key.split(".")) {
      node = typeof node === "object" && node !== null ? (node as MessageTree)[part] : undefined;
    }
    let text: string;
    if (typeof node === "string") text = node;
    else if (isPlural(node)) {
      const form = pluralRules(locale).select(Number(params?.count ?? 0));
      text = node[form] ?? node.other;
    } else return key; // missing message: show the key rather than crash
    return params ? text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : text;
  }) as unknown as Translator<Key>;
  t.locale = locale;
  return t;
}

/** One namespace in all languages; the compiler checks that kk/en have exactly the keys of ru. */
export function defineMessages<T extends MessageTree>(messages: { ru: T; kk: SameShape<T>; en: SameShape<T> }) {
  return messages;
}
