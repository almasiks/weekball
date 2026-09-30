export type FormState = { error?: string; ok?: boolean };

export function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export function readInt(formData: FormData, key: string) {
  const value = Number.parseInt(readText(formData, key), 10);
  return Number.isFinite(value) ? value : null;
}
