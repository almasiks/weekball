import { describe, expect, it } from "vitest";
import { formatGameDate } from "@/lib/datetime";
import { errorMessage, toMessage } from "@/lib/errors";
import { gameShareText } from "@/lib/share";
import { defaultTeamName, isDefaultTeamName } from "@/lib/teams/colors";
import { LOCALES, localeFromCookie, matchLocale } from "./config";
import { translator } from "./index";
import { getMessages } from "./messages";
import { createTranslator, type MessageTree, type Plural } from "./translate";

const isPlural = (v: unknown): v is Plural => typeof v === "object" && v !== null && typeof (v as Plural).other === "string";

/** Every message of a tree as [path, text] (plural forms: one entry per form). */
function flatten(tree: MessageTree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") return [[path, value] as [string, string]];
    if (isPlural(value)) return Object.entries(value).map(([form, text]) => [`${path}#${form}`, text] as [string, string]);
    return flatten(value, path);
  });
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("language detection", () => {
  it("picks the first supported language of the phone", () => {
    expect(matchLocale("kk-KZ,kk;q=0.9,ru;q=0.8,en;q=0.7")).toBe("kk");
    expect(matchLocale("en-US,en;q=0.9")).toBe("en");
    expect(matchLocale("de-DE,de;q=0.9,en;q=0.5")).toBe("en");
    expect(matchLocale("ru-RU")).toBe("ru");
  });

  it("falls back to Russian", () => {
    expect(matchLocale(null)).toBe("ru");
    expect(matchLocale("")).toBe("ru");
    expect(matchLocale("de-DE,fr;q=0.8")).toBe("ru");
  });

  it("respects quality values, not the order", () => {
    expect(matchLocale("ru;q=0.5,en;q=0.9")).toBe("en");
  });

  it("reads the saved language from a cookie string", () => {
    expect(localeFromCookie("a=1; locale=kk; b=2")).toBe("kk");
    expect(localeFromCookie("locale=en")).toBe("en");
    expect(localeFromCookie("locale=de")).toBeNull();
    expect(localeFromCookie("mylocale=en")).toBeNull();
    expect(localeFromCookie("")).toBeNull();
  });
});

describe("translator", () => {
  const t = createTranslator("ru", {
    hello: "Привет, {name}!",
    nested: { deep: "глубоко" },
    goals: { one: "{count} гол", few: "{count} гола", many: "{count} голов", other: "{count} гола" },
  });

  it("looks up nested keys and fills placeholders", () => {
    expect(t("hello", { name: "Иван" })).toBe("Привет, Иван!");
    expect(t("nested.deep")).toBe("глубоко");
  });

  it("chooses the Russian plural form by the count", () => {
    expect([1, 2, 5, 11, 21, 22, 25].map((count) => t("goals", { count }))).toEqual([
      "1 гол",
      "2 гола",
      "5 голов",
      "11 голов",
      "21 гол",
      "22 гола",
      "25 голов",
    ]);
  });

  it("uses 'other' when a language has no such form", () => {
    const kk = createTranslator("kk", { goals: { other: "{count} гол" } });
    expect(kk("goals", { count: 1 })).toBe("1 гол");
    expect(kk("goals", { count: 5 })).toBe("5 гол");
  });

  it("returns the key for a missing message and keeps unknown placeholders", () => {
    expect(t("no.such.key")).toBe("no.such.key");
    expect(t("hello", { other: "x" })).toBe("Привет, {name}!");
  });
});

describe("translations", () => {
  const ru = flatten(getMessages("ru") as unknown as MessageTree);

  it.each(LOCALES.filter((l) => l !== "ru"))("%s has every Russian message, none empty", (locale) => {
    const other = new Map(flatten(getMessages(locale) as unknown as MessageTree));
    const keysOf = (entries: Iterable<string>) => new Set([...entries].map((k) => k.split("#")[0]));
    expect([...keysOf(other.keys())].sort()).toEqual([...keysOf(ru.map(([k]) => k))].sort());
    expect([...other].filter(([, text]) => !text.trim()).map(([k]) => k)).toEqual([]);
  });

  it.each(LOCALES.filter((l) => l !== "ru"))("%s uses the same {placeholders} as Russian", (locale) => {
    const byKey = (entries: [string, string][]) => {
      const map = new Map<string, Set<string>>();
      for (const [path, text] of entries) {
        const key = path.split("#")[0];
        map.set(key, new Set([...(map.get(key) ?? []), ...placeholders(text)]));
      }
      return map;
    };
    const expected = byKey(ru);
    const mismatched = [...byKey(flatten(getMessages(locale) as unknown as MessageTree))]
      .filter(([key, names]) => [...names].sort().join() !== [...(expected.get(key) ?? [])].sort().join())
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it("every plural form of a language keeps the placeholders of that message", () => {
    for (const locale of LOCALES) {
      const forms = flatten(getMessages(locale) as unknown as MessageTree).filter(([path]) => path.includes("#"));
      const byKey = new Map<string, string[]>();
      for (const [path, text] of forms) {
        const key = path.split("#")[0];
        byKey.set(key, [...(byKey.get(key) ?? []), placeholders(text).join()]);
      }
      const uneven = [...byKey].filter(([, sets]) => new Set(sets).size > 1).map(([key]) => `${locale}:${key}`);
      expect(uneven).toEqual([]);
    }
  });
});

describe("texts in each language", () => {
  const startsAt = "2026-10-03T14:00:00Z"; // Saturday 19:00 in Almaty

  it("formats the game date", () => {
    expect(formatGameDate(translator("ru"), startsAt, "Asia/Almaty")).toBe("Сб, 3 окт, 19:00");
    expect(formatGameDate(translator("kk"), startsAt, "Asia/Almaty")).toBe("Сб, 3 қаз, 19:00");
    expect(formatGameDate(translator("en"), startsAt, "Asia/Almaty")).toBe("Sat, 3 Oct, 19:00");
  });

  it("builds the WhatsApp text in the language of the person who shares", () => {
    const game = {
      startsAt,
      timezone: "Asia/Almaty",
      place: "Abay",
      status: "signup" as const,
      goingCount: 12,
      maxPlayers: 20,
      url: "https://x.test/game/1",
    };
    expect(gameShareText(translator("ru"), game)).toBe(
      "Сб, 3 окт, 19:00, Abay. Записываемся! Уже 12 из 20. Ссылка: https://x.test/game/1",
    );
    expect(gameShareText(translator("en"), game)).toBe(
      "Sat, 3 Oct, 19:00, Abay. Sign up! 12 of 20 so far. Link: https://x.test/game/1",
    );
    expect(gameShareText(translator("kk"), game)).toContain("Сілтеме: https://x.test/game/1");
  });

  it("maps database error codes, with a default for unknown ones", () => {
    expect(errorMessage(translator("ru"), "signup_closed")).toBe("Запись на эту игру закрыта.");
    expect(errorMessage(translator("en"), "signup_closed")).toBe("Sign-up for this game is closed.");
    expect(toMessage(translator("en"), { message: 'new row violates "x": not_organizer' })).toBe(
      "Only the organizer can do this.",
    );
    expect(toMessage(translator("kk"), { message: "something unexpected" })).toBe(
      translator("kk")("errors.default"),
    );
    expect(toMessage(translator("ru"), null)).toBe("Что-то пошло не так. Попробуйте ещё раз.");
    // "default" in an error text must not be read as a code.
    expect(toMessage(translator("ru"), { message: "default" })).toBe("Что-то пошло не так. Попробуйте ещё раз.");
  });

  it("recognizes a default team name created in any language", () => {
    expect(defaultTeamName(translator("ru"), "#e53935")).toBe("Красные");
    expect(defaultTeamName(translator("en"), "#E53935")).toBe("Reds");
    expect(isDefaultTeamName("Қызылдар")).toBe(true);
    expect(isDefaultTeamName(" Reds ")).toBe(true);
    expect(isDefaultTeamName("Дворовые")).toBe(false);
  });
});
