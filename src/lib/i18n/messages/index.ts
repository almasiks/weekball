import type { Locale } from "../config";
import type { MessagePaths, MessageTree, Translator } from "../translate";
import { admin } from "./admin";
import { common, install, nav, offline } from "./common";
import { colors, dates, format, positions, share, status } from "./domain";
import { errors } from "./errors";
import { arrival, cards, checkin, game, gameStats } from "./game";
import { adminPin, home, identity, profile } from "./home";
import { live, sounds } from "./live";
import { match } from "./match";
import { roster } from "./roster";
import { schedule } from "./schedule";
import { stats } from "./stats";
import { teams } from "./teams";

// Every namespace in every language. Russian is the source: its shape defines the keys.
const ALL = {
  admin,
  adminPin,
  arrival,
  cards,
  checkin,
  colors,
  common,
  dates,
  errors,
  format,
  game,
  gameStats,
  home,
  identity,
  install,
  live,
  match,
  nav,
  offline,
  positions,
  profile,
  roster,
  schedule,
  share,
  sounds,
  stats,
  status,
  teams,
};

export type Messages = { [K in keyof typeof ALL]: (typeof ALL)[K]["ru"] };
export type MessageKey = MessagePaths<Messages>;
/** The translator used across the app: `t("game.going")`, `t("stats.wins", { count })`, `t.locale`. */
export type T = Translator<MessageKey>;

const cache = new Map<Locale, Messages>();

/** All messages of one language (plain data: safe to pass from server to client). */
export function getMessages(locale: Locale): Messages {
  let messages = cache.get(locale);
  if (!messages) {
    messages = Object.fromEntries(
      Object.entries(ALL).map(([name, byLocale]) => [name, (byLocale as Record<Locale, MessageTree>)[locale]]),
    ) as Messages;
    cache.set(locale, messages);
  }
  return messages;
}
