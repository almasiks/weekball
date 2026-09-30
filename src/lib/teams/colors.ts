// Bib palette. Stored in DB as lowercase hex; everything else is looked up here.
export type TeamColor = {
  hex: string;
  label: string; // colour name
  teamName: string; // default team name
  emoji: string; // for WhatsApp text
  ink: "light" | "dark"; // text colour on top of the bib colour
};

export const TEAM_COLORS: TeamColor[] = [
  { hex: "#e53935", label: "Красный", teamName: "Красные", emoji: "🔴", ink: "light" },
  { hex: "#1e88e5", label: "Синий", teamName: "Синие", emoji: "🔵", ink: "light" },
  { hex: "#43a047", label: "Зелёный", teamName: "Зелёные", emoji: "🟢", ink: "light" },
  { hex: "#fdd835", label: "Жёлтый", teamName: "Жёлтые", emoji: "🟡", ink: "dark" },
  { hex: "#fb8c00", label: "Оранжевый", teamName: "Оранжевые", emoji: "🟠", ink: "dark" },
  { hex: "#ffffff", label: "Белый", teamName: "Белые", emoji: "⚪", ink: "dark" },
  { hex: "#212121", label: "Чёрный", teamName: "Чёрные", emoji: "⚫", ink: "light" },
  { hex: "#ec407a", label: "Розовый", teamName: "Розовые", emoji: "🩷", ink: "light" },
  { hex: "#8e24aa", label: "Фиолетовый", teamName: "Фиолетовые", emoji: "🟣", ink: "light" },
];

const FALLBACK: TeamColor = {
  hex: "#9e9e9e",
  label: "Серый",
  teamName: "Команда",
  emoji: "⬜",
  ink: "dark",
};

export function teamColor(hex: string): TeamColor {
  return TEAM_COLORS.find((c) => c.hex === hex.toLowerCase()) ?? { ...FALLBACK, hex };
}

// First palette colour not used yet in this game.
export function nextFreeColor(usedHexes: string[]): TeamColor | null {
  const used = new Set(usedHexes.map((h) => h.toLowerCase()));
  return TEAM_COLORS.find((c) => !used.has(c.hex)) ?? null;
}
