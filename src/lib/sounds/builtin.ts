// Built-in sound buttons. Voice phrases use speechSynthesis (ru-RU), whistles
// are synthesized with Web Audio. A group can replace any of them with a file.
export type BuiltinKey = "minute" | "out" | "whistle" | "final";

export type BuiltinSound = {
  key: BuiltinKey;
  label: string;
  kind: "speech" | "whistle";
  // speech: the phrase; whistle: the blast pattern
  text?: string;
  pattern?: "short" | "final";
};

export const BUILTIN_SOUNDS: BuiltinSound[] = [
  { key: "minute", label: "Минута!", kind: "speech", text: "Минута!" },
  { key: "out", label: "До аута!", kind: "speech", text: "Играем до аута!" },
  { key: "whistle", label: "Свисток", kind: "whistle", pattern: "short" },
  { key: "final", label: "Финальный свисток", kind: "whistle", pattern: "final" },
];

// Seconds of each blast: short = one blast; final = short, short, long.
export const WHISTLE_PATTERNS: Record<"short" | "final", number[]> = {
  short: [0.35],
  final: [0.25, 0.25, 0.9],
};

export const MAX_SOUND_BYTES = 2 * 1024 * 1024;

const TYPES: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav" };

/** Allowed upload: mp3 / m4a / wav up to 2 MB. Returns the content type or an error. */
export function checkSoundFile(file: { name: string; size: number }): { contentType: string; ext: string } | string {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!TYPES[ext]) return "Поддерживаются mp3, m4a и wav.";
  if (file.size > MAX_SOUND_BYTES) return "Файл больше 2 МБ.";
  if (file.size === 0) return "Файл пустой.";
  return { contentType: TYPES[ext], ext };
}
