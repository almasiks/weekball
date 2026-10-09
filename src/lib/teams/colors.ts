import type { MessageKey, T } from "@/lib/i18n";
import { colors } from "@/lib/i18n/messages/domain";

// Bib palette. Stored in DB as lowercase hex; everything else is looked up here.
// Names of the colour and of the default team are translated: colorLabel / defaultTeamName.
export type TeamColor = {
  hex: string;
  key: keyof typeof colors.ru; // i18n key: colors.<key>.label / .team
  emoji: string; // for WhatsApp text
  ink: "light" | "dark"; // text colour on top of the bib colour
};

export const TEAM_COLORS: TeamColor[] = [
  { hex: "#e53935", key: "red", emoji: "🔴", ink: "light" },
  { hex: "#1e88e5", key: "blue", emoji: "🔵", ink: "light" },
  { hex: "#43a047", key: "green", emoji: "🟢", ink: "light" },
  { hex: "#fdd835", key: "yellow", emoji: "🟡", ink: "dark" },
  { hex: "#fb8c00", key: "orange", emoji: "🟠", ink: "dark" },
  { hex: "#ffffff", key: "white", emoji: "⚪", ink: "dark" },
  { hex: "#212121", key: "black", emoji: "⚫", ink: "light" },
  { hex: "#ec407a", key: "pink", emoji: "🩷", ink: "light" },
  { hex: "#8e24aa", key: "purple", emoji: "🟣", ink: "light" },
];

const FALLBACK: TeamColor = { hex: "#9e9e9e", key: "grey", emoji: "⬜", ink: "dark" };

export function teamColor(hex: string): TeamColor {
  return TEAM_COLORS.find((c) => c.hex === hex.toLowerCase()) ?? { ...FALLBACK, hex };
}

/** "Красный" / "Қызыл" / "Red". */
export function colorLabel(t: T, hex: string): string {
  return t(`colors.${teamColor(hex).key}.label` as MessageKey);
}

/** "Красные" / "Қызылдар" / "Reds": the name a team gets until somebody renames it. */
export function defaultTeamName(t: T, hex: string): string {
  return t(`colors.${teamColor(hex).key}.team` as MessageKey);
}

// A team may have been created in another language, so every language counts.
const DEFAULT_NAMES = new Set(Object.values(colors).flatMap((byKey) => Object.values(byKey).map((c) => c.team)));

/** True for an untouched default name (in any language): safe to rename with the colour. */
export function isDefaultTeamName(name: string): boolean {
  return DEFAULT_NAMES.has(name.trim());
}

// First palette colour not used yet in this game.
export function nextFreeColor(usedHexes: string[]): TeamColor | null {
  const used = new Set(usedHexes.map((h) => h.toLowerCase()));
  return TEAM_COLORS.find((c) => !used.has(c.hex)) ?? null;
}
