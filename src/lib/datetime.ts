export const DEFAULT_TIMEZONE = "Asia/Almaty";

// 0 = Sunday, matches Postgres extract(dow) and schedules.weekday.
export const WEEKDAYS = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
] as const;

const WEEKDAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] as const;
const MONTHS_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "мая",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
] as const;

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

// "Сб, 4 окт, 19:00" in the given timezone.
export function formatGameDate(iso: string, timeZone: string): string {
  const p = zonedParts(new Date(iso), timeZone);
  return `${WEEKDAYS_SHORT[p.weekday]}, ${p.day} ${MONTHS_SHORT[p.month - 1]}, ${pad(p.hour)}:${pad(p.minute)}`;
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
