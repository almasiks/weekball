import type { MessageKey, T } from "@/lib/i18n";

export const DEFAULT_TIMEZONE = "Asia/Almaty";

// 0 = Sunday, matches Postgres extract(dow) and schedules.weekday.
export const WEEKDAY_NUMBERS = [0, 1, 2, 3, 4, 5, 6] as const;

/** "Суббота" / "Сенбі" / "Saturday". */
export function weekdayName(t: T, weekday: number): string {
  return t(`dates.weekday.${weekday}` as MessageKey);
}

type ZonedParts = {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
};

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return {
    year,
    month,
    day,
    hour: get("hour"),
    minute: get("minute"),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

// "Сб, 4 окт, 19:00" in the given timezone, in the language of `t`.
export function formatGameDate(t: T, iso: string, timeZone: string): string {
  const p = zonedParts(new Date(iso), timeZone);
  const weekday = t(`dates.weekdayShort.${p.weekday}` as MessageKey);
  const month = t(`dates.monthShort.${p.month}` as MessageKey);
  return `${weekday}, ${p.day} ${month}, ${pad(p.hour)}:${pad(p.minute)}`;
}

// "19:00" from a Postgres time value like "19:00:00".
export function formatTime(time: string): string {
  return time.slice(0, 5);
}

// Local wall-clock date + time in `timeZone` -> UTC Date.
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);

  const offsetAt = (instant: number) => {
    const p = zonedParts(new Date(instant), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - instant;
  };

  // Two passes handle DST boundaries in zones that have them.
  let result = asUtc - offsetAt(asUtc);
  result = asUtc - offsetAt(result);
  return new Date(result);
}

// UTC instant -> { date: "YYYY-MM-DD", time: "HH:MM" } in `timeZone` (form defaults).
export function utcToZonedInputs(iso: string, timeZone: string): { date: string; time: string } {
  const p = zonedParts(new Date(iso), timeZone);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

// Today's date "YYYY-MM-DD" in the given timezone (for <input type="date"> defaults).
export function todayInZone(timeZone: string): string {
  const p = zonedParts(new Date(), timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
