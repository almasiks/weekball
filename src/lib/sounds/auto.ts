// When the organizer's console plays sounds by itself.
import type { LiveMatch } from "@/lib/match/types";
import { timeUpAt } from "@/lib/match/format";

export const MINUTE_WARNING_MS = 60_000;

/**
 * "Минута!": the running last period has one minute (or less) left.
 * Only for matches longer than 90 s (a 1-minute match would announce it at kick-off).
 */
export function minuteWarningDue(match: LiveMatch, serverNowMs: number): boolean {
  const end = timeUpAt(match);
  if (end === null || match.period_seconds * match.periods <= 90) return false;
  const left = end - serverNowMs;
  return left > 0 && left <= MINUTE_WARNING_MS;
}

/** "Матч завершён!": the match just ended while this console was open, for any reason (also by hand). */
export function matchEnded(before: LiveMatch["status"] | undefined, after: LiveMatch): boolean {
  return (before === "live" || before === "break") && after.status === "finished";
}

/** Final whistle: the match just ended by itself (time up or goal limit). */
export function endedByItself(before: LiveMatch["status"] | undefined, after: LiveMatch): boolean {
  return (
    (before === "live" || before === "break") &&
    after.status === "finished" &&
    (after.finish_reason === "time" || after.finish_reason === "goal_limit")
  );
}
