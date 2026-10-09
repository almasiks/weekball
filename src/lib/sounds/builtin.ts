// Built-in sound buttons. Voice phrases use speechSynthesis, whistles are
// synthesized with Web Audio. A group can replace any of them with a file.
// Button names and spoken phrases are translated (builtinLabel / builtinSpeech);
// `label` and `text` below are the Russian originals, used when the phone has
// no voice for the interface language.
import { LOCALE_TAGS } from "@/lib/i18n/config";
import type { MessageKey, T } from "@/lib/i18n";

export type BuiltinKey = "minute" | "out" | "whistle" | "final" | "finished";

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
  { key: "finished", label: "Матч завершён!", kind: "speech", text: "Матч завершён!" },
];

// Seconds of each blast: short = one blast; final = short, short, long.
export const WHISTLE_PATTERNS: Record<"short" | "final", number[]> = {
  short: [0.35],
  final: [0.25, 0.25, 0.9],
};

export const MAX_SOUND_BYTES = 2 * 1024 * 1024;

const TYPES: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav" };

/** Name of a built-in button in the interface language. */
export function builtinLabel(t: T, key: BuiltinKey): string {
  return t(`sounds.builtin.${key}` as MessageKey);
}

/** What the phone says for a voice button, and in which language. */
export function builtinSpeech(t: T, key: BuiltinKey): { text: string; lang: string } | undefined {
  if (key !== "minute" && key !== "out" && key !== "finished") return undefined;
  return { text: t(`sounds.speech.${key}` as MessageKey), lang: LOCALE_TAGS[t.locale] };
}

/** Allowed upload: mp3 / m4a / wav up to 2 MB. Returns the content type or the key of an error message. */
export function checkSoundFile(
  file: { name: string; size: number },
): { contentType: string; ext: string } | MessageKey {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!TYPES[ext]) return "sounds.error.type";
  if (file.size > MAX_SOUND_BYTES) return "sounds.error.size";
  if (file.size === 0) return "sounds.error.empty";
  return { contentType: TYPES[ext], ext };
}
