// Shapes shared by the organizer console, member pages and the public live page.
// Field names follow the DB columns so server rows can be passed through as-is.

export type MatchStatus = "scheduled" | "live" | "break" | "finished";
export type TimerStatus = "idle" | "running" | "paused" | "finished";
export type EventType = "goal" | "own_goal" | "yellow" | "red" | "sub";

export type LiveMatch = {
  id: string;
  team_a_id: string;
  team_b_id: string;
  status: MatchStatus;
  period: number;
  periods: number;
  period_seconds: number;
  timer_status: TimerStatus;
  timer_started_at: string | null;
  timer_elapsed_ms: number;
  score_a: number;
  score_b: number;
  sort_order: number;
  // Match format / how it ended (optional: the public live page doesn't send them).
  goal_limit?: number | null;
  finish_reason?: "manual" | "goal_limit" | "time" | null;
  finish_event_id?: string | null;
};

export type LiveEvent = {
  id: string;
  match_id: string;
  type: EventType;
  team_id: string;
  player_id: string;
  assist_player_id: string | null;
  player_in_id: string | null;
  period: number;
  second: number;
  voided_at?: string | null;
};

export type LiveTeam = {
  id: string;
  name: string;
  color: string;
  players: { id: string; name: string }[];
};

export type StandingRow = {
  team_id: string;
  name: string;
  color: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
};
