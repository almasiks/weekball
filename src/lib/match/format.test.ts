import { describe, expect, it } from "vitest";
import { applyGoalLimit, formatLabel, timeUpAt } from "./format";
import { computeElapsed } from "./timer";
import type { LiveEvent, LiveMatch } from "./types";
import { translator } from "@/lib/i18n";

const base: LiveMatch = {
  id: "m",
  team_a_id: "a",
  team_b_id: "b",
  status: "live",
  period: 1,
  periods: 1,
  period_seconds: 420,
  timer_status: "running",
  timer_started_at: "2026-10-03T14:00:00.000Z",
  timer_elapsed_ms: 0,
  score_a: 0,
  score_b: 0,
  sort_order: 0,
  goal_limit: 2,
  finish_reason: null,
  finish_event_id: null,
};

const ev = (id: string, team: string, second: number, type: LiveEvent["type"] = "goal"): LiveEvent => ({
  id,
  match_id: "m",
  type,
  team_id: team,
  player_id: "p",
  assist_player_id: null,
  player_in_id: null,
  period: 1,
  second,
});

const NOW = "2026-10-03T14:10:00.000Z";

describe("formatLabel", () => {
  it("formats the goal limit with the right Russian form", () => {
    const ru = translator("ru");
    expect(formatLabel(ru, 2, 7)).toBe("до 2 голов · 7 мин");
    expect(formatLabel(ru, 1, 5)).toBe("до 1 гола · 5 мин");
    expect(formatLabel(ru, null, 10)).toBe("без лимита голов · 10 мин");
  });

  it("follows the interface language", () => {
    expect(formatLabel(translator("en"), 1, 5)).toBe("first to 1 goal · 5 min");
    expect(formatLabel(translator("en"), 2, 7)).toBe("first to 2 goals · 7 min");
    expect(formatLabel(translator("kk"), 2, 7)).toBe("2 голға дейін · 7 мин");
    expect(formatLabel(translator("kk"), null, 10)).toBe("гол шегі жоқ · 10 мин");
  });
});

describe("applyGoalLimit", () => {
  it("keeps the match live below the limit", () => {
    expect(applyGoalLimit(base, [ev("g1", "a", 60)], NOW).status).toBe("live");
  });

  it("finishes at the minute of the goal that reaches the limit (own goals count)", () => {
    const m = applyGoalLimit(base, [ev("g1", "a", 60), ev("g2", "b", 100), ev("og", "b", 200, "own_goal")], NOW);
    expect(m).toMatchObject({
      status: "finished",
      timer_status: "finished",
      timer_elapsed_ms: 200_000,
      finish_reason: "goal_limit",
      finish_event_id: "og",
    });
    expect(computeElapsed(m, Date.parse(NOW)).elapsedMs).toBe(200_000); // clock stopped
  });

  it("ignores voided goals and matches without a limit", () => {
    const voided = { ...ev("g2", "a", 90), voided_at: NOW };
    expect(applyGoalLimit(base, [ev("g1", "a", 60), voided], NOW).status).toBe("live");
    expect(applyGoalLimit({ ...base, goal_limit: null }, [ev("g1", "a", 1), ev("g2", "a", 2)], NOW).status).toBe("live");
  });

  it("reopens a match whose winning goal was undone, clock running from that minute", () => {
    const finished: LiveMatch = {
      ...base,
      status: "finished",
      timer_status: "finished",
      timer_started_at: null,
      timer_elapsed_ms: 200_000,
      finish_reason: "goal_limit",
      finish_event_id: "g2",
    };
    const m = applyGoalLimit(finished, [ev("g1", "a", 60)], NOW);
    expect(m).toMatchObject({ status: "live", timer_status: "running", timer_started_at: NOW, finish_event_id: null });
    expect(computeElapsed(m, Date.parse(NOW) + 5000).elapsedMs).toBe(205_000);
  });

  it("does not reopen a match finished by time or manually", () => {
    const byTime: LiveMatch = { ...base, status: "finished", timer_status: "finished", finish_reason: "time" };
    expect(applyGoalLimit(byTime, [], NOW).status).toBe("finished");
  });
});

describe("timeUpAt", () => {
  it("is the moment the running last period reaches its length", () => {
    expect(timeUpAt({ ...base, timer_elapsed_ms: 60_000 })).toBe(Date.parse(base.timer_started_at!) + 360_000);
    expect(timeUpAt({ ...base, timer_status: "paused", timer_started_at: null })).toBeNull();
    expect(timeUpAt({ ...base, periods: 2 })).toBeNull(); // first of two periods: no auto-finish
  });
});
