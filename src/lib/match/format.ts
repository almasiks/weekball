// Match format: "up to N goals" and/or "N minutes", whichever comes first.
import { computeScore } from "./score";
import type { LiveEvent, LiveMatch } from "./types";

export const DEFAULT_GOAL_LIMIT = 2;
export const DEFAULT_MATCH_MINUTES = 7;

/** "до 2 голов · 7 мин", "до 1 гола · 5 мин", "без лимита голов · 10 мин". */
export function formatLabel(goalLimit: number | null | undefined, minutes: number): string {
  const goals =
    goalLimit == null ? "без лимита голов" : `до ${goalLimit} ${goalLimit === 1 ? "гола" : "голов"}`;
  return `${goals} · ${minutes} мин`;
}

export function matchFormatLabel(match: Pick<LiveMatch, "goal_limit" | "period_seconds" | "periods">): string {
  const minutes = Math.round((match.period_seconds * match.periods) / 60);
  return formatLabel(match.goal_limit, minutes);
}

type Event = Pick<LiveEvent, "id" | "match_id" | "type" | "team_id" | "second" | "voided_at">;

/**
 * Optimistic mirror of the database rules (add_event / void_event), so the
 * console shows the right state before the server confirms (or while offline):
 * - a goal reaching the limit finishes the match at the minute of that goal;
 * - if the goal that finished it is gone (undone), the match is live again.
 * `events` are in the order they were recorded. `reopenAtIso`: when the winning
 * goal was undone (null = don't reopen: the server will tell).
 */
export function applyGoalLimit<T extends LiveMatch>(match: T, events: Event[], reopenAtIso: string | null): T {
  const own = events.filter((e) => e.match_id === match.id && !e.voided_at);

  // Reopen: finished by a goal that no longer exists.
  if (
    reopenAtIso &&
    match.status === "finished" &&
    match.finish_reason === "goal_limit" &&
    match.finish_event_id &&
    !own.some((e) => e.id === match.finish_event_id)
  ) {
    return {
      ...match,
      status: "live",
      timer_status: "running",
      timer_started_at: reopenAtIso,
      finish_reason: null,
      finish_event_id: null,
    };
  }

  if (match.goal_limit == null || (match.status !== "live" && match.status !== "break")) return match;

  const running: Event[] = [];
  for (const e of own) {
    running.push(e);
    if (e.type !== "goal" && e.type !== "own_goal") continue;
    const { a, b } = computeScore(match, running);
    if (Math.max(a, b) >= match.goal_limit) {
      return {
        ...match,
        status: "finished",
        timer_status: "finished",
        timer_elapsed_ms: e.second * 1000,
        timer_started_at: null,
        finish_reason: "goal_limit",
        finish_event_id: e.id,
      };
    }
  }
  return match;
}

/** Server time (ms) at which the running last period reaches its length, or null. */
export function timeUpAt(match: LiveMatch): number | null {
  if (match.status !== "live" || match.timer_status !== "running" || !match.timer_started_at) return null;
  if (match.period < match.periods) return null;
  return Date.parse(match.timer_started_at) + (match.period_seconds * 1000 - Number(match.timer_elapsed_ms));
}

export function finishReasonLabel(reason: LiveMatch["finish_reason"]): string | null {
  if (reason === "goal_limit") return "по лимиту голов";
  if (reason === "time") return "время вышло";
  if (reason === "manual") return "завершён вручную";
  return null;
}
