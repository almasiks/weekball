import { describe, expect, it } from "vitest";
import { endedByItself, minuteWarningDue } from "./auto";
import { checkSoundFile } from "./builtin";
import type { LiveMatch } from "@/lib/match/types";

const START = Date.parse("2026-10-03T14:00:00.000Z");
const match: LiveMatch = {
  id: "m",
  team_a_id: "a",
  team_b_id: "b",
  status: "live",
  period: 1,
  periods: 1,
  period_seconds: 420,
  timer_status: "running",
  timer_started_at: new Date(START).toISOString(),
  timer_elapsed_ms: 0,
  score_a: 0,
  score_b: 0,
  sort_order: 0,
  goal_limit: 2,
};

describe("minuteWarningDue", () => {
  it("fires in the last minute of a running match", () => {
    expect(minuteWarningDue(match, START + 359_000)).toBe(false); // 61 s left
    expect(minuteWarningDue(match, START + 360_000)).toBe(true); // 60 s left
    expect(minuteWarningDue(match, START + 419_000)).toBe(true);
    expect(minuteWarningDue(match, START + 420_000)).toBe(false); // time is up
  });

  it("counts time already played before a pause", () => {
    const resumed = { ...match, timer_elapsed_ms: 300_000, timer_started_at: new Date(START).toISOString() };
    expect(minuteWarningDue(resumed, START + 59_000)).toBe(false);
    expect(minuteWarningDue(resumed, START + 61_000)).toBe(true);
  });

  it("stays quiet when paused, finished or for very short matches", () => {
    expect(minuteWarningDue({ ...match, timer_status: "paused", timer_started_at: null }, START + 400_000)).toBe(false);
    expect(minuteWarningDue({ ...match, status: "finished", timer_status: "finished" }, START + 400_000)).toBe(false);
    expect(minuteWarningDue({ ...match, period_seconds: 60 }, START + 10_000)).toBe(false);
  });
});

describe("endedByItself", () => {
  it("is true only for a live -> finished transition by time or goal limit", () => {
    const finished = (reason: LiveMatch["finish_reason"]) => ({
      ...match,
      status: "finished" as const,
      finish_reason: reason,
    });
    expect(endedByItself("live", finished("time"))).toBe(true);
    expect(endedByItself("live", finished("goal_limit"))).toBe(true);
    expect(endedByItself("live", finished("manual"))).toBe(false);
    expect(endedByItself("finished", finished("time"))).toBe(false); // already over when the page opened
    expect(endedByItself(undefined, finished("time"))).toBe(false);
  });
});

describe("checkSoundFile", () => {
  it("accepts mp3/m4a/wav up to 2 MB", () => {
    expect(checkSoundFile({ name: "Goal.MP3", size: 1000 })).toEqual({ contentType: "audio/mpeg", ext: "mp3" });
    expect(checkSoundFile({ name: "a.m4a", size: 1000 })).toEqual({ contentType: "audio/mp4", ext: "m4a" });
    expect(checkSoundFile({ name: "a.ogg", size: 1000 })).toBe("Поддерживаются mp3, m4a и wav.");
    expect(checkSoundFile({ name: "a.wav", size: 3 * 1024 * 1024 })).toBe("Файл больше 2 МБ.");
  });
});
