import type { PlayerPosition } from "@/lib/supabase/database.types";

export const POSITIONS: { value: PlayerPosition; label: string; short: string }[] = [
  { value: "gk", label: "Вратарь", short: "ВРТ" },
  { value: "def", label: "Защитник", short: "ЗАЩ" },
  { value: "mid", label: "Полузащитник", short: "ПЗ" },
  { value: "fwd", label: "Нападающий", short: "НАП" },
];

export function positionShort(position: PlayerPosition | null): string | null {
  return POSITIONS.find((p) => p.value === position)?.short ?? null;
}

export function positionLabel(position: PlayerPosition | null): string {
  return POSITIONS.find((p) => p.value === position)?.label ?? "Не указана";
}
