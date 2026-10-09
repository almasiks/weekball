import type { MessageKey, T } from "@/lib/i18n";

// Postgres exception codes raised by our RPCs -> user-facing messages.
// The texts live in i18n/messages/errors.ts, keyed by the code.
function known(t: T, code: string): string | null {
  if (code === "default") return null;
  const key = `errors.${code}`;
  const text = t(key as MessageKey);
  return text === key ? null : text;
}

export function errorMessage(t: T, code: string): string {
  return known(t, code) ?? t("errors.default");
}

export function toMessage(t: T, error: { message?: string } | null | undefined): string {
  for (const word of error?.message?.match(/[a-z_]+/g) ?? []) {
    const text = known(t, word);
    if (text) return text;
  }
  return t("errors.default");
}
