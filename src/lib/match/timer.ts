// Timer math from timestamps (never from ticks stored in the DB).
// Mirrors the SQL timer_* functions so offline commands can be applied optimistically.
import type { LiveMatch } from "./types";

export type TimerFields = Pick<
  LiveMatch,
  "status" | "period" | "periods" | "period_seconds" | "timer_status" | "timer_started_at" | "timer_elapsed_ms"
>;

export type Elapsed = {
  elapsedMs: number; // time in the current period
  periodMs: number; // regulation length of a period
  overtimeMs: number; // time past the regulation length (added time)
  isOvertime: boolean;
  running: boolean;
};

/** offsetMs = server clock − device clock, measured once at load. */
export function computeElapsed(state: TimerFields, nowMs: number, offsetMs = 0): Elapsed {
  const serverNow = nowMs + offsetMs;
  const running = state.timer_status === "running" && !!state.timer_started_at;
  const live = running ? Math.max(0, serverNow - Date.parse(state.timer_started_at!)) : 0;
  const elapsedMs = Number(state.timer_elapsed_ms) + live;
  const periodMs = state.period_seconds * 1000;
  const overtimeMs = Math.max(0, elapsedMs - periodMs);
  return { elapsedMs, periodMs, overtimeMs, isOvertime: elapsedMs >= periodMs, running };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "мм:сс" (minutes may exceed 59). */
export function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Clock shown to people: stops at the period length and shows "+мм:сс" after it. */
export function displayClock(e: Elapsed): { main: string; added: string | null } {
  return e.isOvertime
    ? { main: formatClock(e.periodMs), added: `+${formatClock(e.overtimeMs)}` }
    : { main: formatClock(e.elapsedMs), added: null };
}

/** Clock offset from one round trip: server time is assumed to be taken mid-flight. */
export function clockOffset(serverIso: string, sentAtMs: number, receivedAtMs: number): number {
  return Date.parse(serverIso) - (sentAtMs + receivedAtMs) / 2;
}

/** Minute label for an event: "12'" or, in added time, "20+2'". */
export function eventMinute(period: number, second: number, periodSeconds: number): string {
  const periodMinutes = Math.round(periodSeconds / 60);
  const before = (period - 1) * periodMinutes;
  if (second >= periodSeconds) {
    return `${before + periodMinutes}+${Math.floor((second - periodSeconds) / 60) + 1}'`;
  }
  return `${before + Math.floor(second / 60) + 1}'`;
}

export type TimerCommand =
  | { kind: "start" }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "break"; period: number }
  | { kind: "next_period"; period: number }
  | { kind: "finish" };

/** Same transitions as the SQL functions; repeated commands are no-ops. */
export function applyTimerCommand<T extends TimerFields>(state: T, cmd: TimerCommand, atMs: number): T {
  const at = new Date(atMs).toISOString();
  const accumulated = () =>
    Number(state.timer_elapsed_ms) +
    (state.timer_status === "running" && state.timer_started_at
      ? Math.max(0, atMs - Date.parse(state.timer_started_at))
      : 0);

  switch (cmd.kind) {
    case "start":
      if (state.status !== "scheduled") return state;
      return { ...state, status: "live", timer_status: "running", period: 1, timer_started_at: at, timer_elapsed_ms: 0 };
    case "pause":
      if (state.timer_status !== "running") return state;
      return { ...state, timer_status: "paused", timer_elapsed_ms: accumulated(), timer_started_at: null };
    case "resume":
      if (state.status !== "live" || state.timer_status !== "paused") return state;
      return { ...state, timer_status: "running", timer_started_at: at };
    case "break":
      if (state.status !== "live" || state.period !== cmd.period || state.period >= state.periods) return state;
      return { ...state, status: "break", timer_status: "paused", timer_elapsed_ms: accumulated(), timer_started_at: null };
    case "next_period":
      if (state.status !== "break" || state.period !== cmd.period - 1) return state;
      return { ...state, status: "live", timer_status: "running", period: cmd.period, timer_elapsed_ms: 0, timer_started_at: at };
    case "finish":
      if (state.status === "finished" || state.status === "scheduled") return state;
      return { ...state, status: "finished", timer_status: "finished", timer_elapsed_ms: accumulated(), timer_started_at: null };
  }
}
