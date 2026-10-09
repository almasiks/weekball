import { describe, expect, it } from "vitest";
import {
  applyTimerCommand,
  clockOffset,
  computeElapsed,
  displayClock,
  eventMinute,
  formatClock,
  type TimerFields,
} from "./timer";
import { computeScore, computeStandings } from "./score";
import { OutboxQueue, memoryStorage, shouldRetry, type QueueItem, type SendResult } from "./queue";

const T0 = Date.parse("2026-10-03T14:00:00.000Z");
const sec = (s: number) => T0 + s * 1000;

const scheduled: TimerFields = {
  status: "scheduled",
  period: 1,
  periods: 2,
  period_seconds: 600,
  timer_status: "idle",
  timer_started_at: null,
  timer_elapsed_ms: 0,
};

describe("computeElapsed", () => {
  it("is 0 before the start", () => {
    expect(computeElapsed(scheduled, sec(100)).elapsedMs).toBe(0);
  });

  it("counts from the start timestamp while running", () => {
    const live = applyTimerCommand(scheduled, { kind: "start" }, sec(0));
    expect(computeElapsed(live, sec(95)).elapsedMs).toBe(95_000);
    expect(formatClock(computeElapsed(live, sec(95)).elapsedMs)).toBe("01:35");
  });

  it("freezes on pause and continues after resume", () => {
    let s = applyTimerCommand(scheduled, { kind: "start" }, sec(0));
    s = applyTimerCommand(s, { kind: "pause" }, sec(60));
    expect(computeElapsed(s, sec(500)).elapsedMs).toBe(60_000); // paused: time does not move
    s = applyTimerCommand(s, { kind: "resume" }, sec(500));
    expect(computeElapsed(s, sec(530)).elapsedMs).toBe(90_000);
  });

  it("resets for the next period after a break", () => {
    let s = applyTimerCommand(scheduled, { kind: "start" }, sec(0));
    s = applyTimerCommand(s, { kind: "break", period: 1 }, sec(610));
    expect(s.status).toBe("break");
    expect(computeElapsed(s, sec(900)).elapsedMs).toBe(610_000);
    s = applyTimerCommand(s, { kind: "next_period", period: 2 }, sec(900));
    expect(s.period).toBe(2);
    expect(computeElapsed(s, sec(930)).elapsedMs).toBe(30_000);
  });

  it("keeps running into added time and shows +mm:ss", () => {
    const s = applyTimerCommand(scheduled, { kind: "start" }, sec(0));
    const e = computeElapsed(s, sec(672));
    expect(e.isOvertime).toBe(true);
    expect(e.running).toBe(true);
    expect(displayClock(e)).toEqual({ main: "10:00", added: "+01:12" });
    expect(displayClock(computeElapsed(s, sec(599)))).toEqual({ main: "09:59", added: null });
  });

  it("applies the device clock offset", () => {
    const s = applyTimerCommand(scheduled, { kind: "start" }, sec(0));
    // Device clock is 3 s behind the server: offset = +3000.
    expect(computeElapsed(s, sec(10) - 3000, 3000).elapsedMs).toBe(10_000);
    expect(clockOffset(new Date(sec(10)).toISOString(), sec(10) - 3100, sec(10) - 2900)).toBe(3000);
  });

  it("ignores repeated commands like the server does", () => {
    const s = applyTimerCommand(scheduled, { kind: "start" }, sec(0));
    expect(applyTimerCommand(s, { kind: "start" }, sec(50))).toBe(s);
    const b = applyTimerCommand(s, { kind: "break", period: 1 }, sec(600));
    expect(applyTimerCommand(b, { kind: "break", period: 1 }, sec(700))).toBe(b);
    const p2 = applyTimerCommand(b, { kind: "next_period", period: 2 }, sec(700));
    expect(applyTimerCommand(p2, { kind: "next_period", period: 2 }, sec(800))).toBe(p2);
    expect(applyTimerCommand(p2, { kind: "break", period: 2 }, sec(900))).toBe(p2); // last period
  });
});

describe("eventMinute", () => {
  it("labels minutes and added time", () => {
    expect(eventMinute(1, 0, 600)).toBe("1'");
    expect(eventMinute(1, 125, 600)).toBe("3'");
    expect(eventMinute(2, 59, 600)).toBe("11'");
    expect(eventMinute(1, 650, 600)).toBe("10+1'");
  });
});

describe("score and standings", () => {
  const A = { id: "a", name: "Красные", color: "#e53935" };
  const B = { id: "b", name: "Синие", color: "#1e88e5" };
  const C = { id: "c", name: "Зелёные", color: "#43a047" };

  it("counts own goals for the opponent and skips voided events", () => {
    const match = { id: "m", team_a_id: "a", team_b_id: "b" };
    const events = [
      { match_id: "m", type: "goal", team_id: "a" },
      { match_id: "m", type: "own_goal", team_id: "a" },
      { match_id: "m", type: "goal", team_id: "b", voided_at: "2026-10-03T14:00:00Z" },
      { match_id: "m", type: "yellow", team_id: "b" },
      { match_id: "other", type: "goal", team_id: "a" },
    ] as const;
    expect(computeScore(match, [...events])).toEqual({ a: 1, b: 1 });
  });

  it("awards 3/1/0 and sorts by points, goal difference, goals for", () => {
    const rows = computeStandings([A, B, C], [
      { team_a_id: "a", team_b_id: "b", score_a: 2, score_b: 1, status: "finished" },
      { team_a_id: "a", team_b_id: "c", score_a: 0, score_b: 0, status: "finished" },
      { team_a_id: "b", team_b_id: "c", score_a: 3, score_b: 0, status: "finished" },
      { team_a_id: "a", team_b_id: "b", score_a: 5, score_b: 0, status: "live" }, // ignored
    ]);
    expect(rows.map((r) => [r.name, r.points, r.goal_diff])).toEqual([
      ["Красные", 4, 1],
      ["Синие", 3, 2],
      ["Зелёные", 1, -3],
    ]);
  });

  it("breaks ties by goal difference, then goals for, then team order", () => {
    const rows = computeStandings([A, B, C], [
      { team_a_id: "a", team_b_id: "c", score_a: 1, score_b: 0, status: "finished" },
      { team_a_id: "b", team_b_id: "c", score_a: 3, score_b: 2, status: "finished" },
    ]);
    // A and B: 3 pts, +1; B scored more.
    expect(rows.map((r) => r.name)).toEqual(["Синие", "Красные", "Зелёные"]);
    const draw = computeStandings([A, B], []);
    expect(draw.map((r) => r.name)).toEqual(["Красные", "Синие"]);
  });
});

describe("OutboxQueue", () => {
  const item = (id: string, extra: Partial<QueueItem> = {}): QueueItem =>
    ({
      id,
      kind: "void",
      matchId: "m",
      eventId: id,
      createdAt: 0,
      status: "pending",
      ...extra,
    }) as QueueItem;

  function setup(results: Record<string, SendResult[]>) {
    const sent: string[] = [];
    const storage = memoryStorage();
    const queue = new OutboxQueue(storage, async (i) => {
      sent.push(i.id);
      const list = results[i.id];
      return list && list.length ? list.shift()! : { ok: true };
    });
    return { queue, sent, storage };
  }

  it("sends in order and empties the queue", async () => {
    const { queue, sent, storage } = setup({});
    await queue.init();
    await queue.enqueue(item("1"));
    await queue.enqueue(item("2"));
    await queue.enqueue(item("3"));
    await queue.flush();
    expect(sent).toEqual(["1", "2", "3"]);
    expect(storage.data).toEqual([]);
  });

  it("ignores duplicate ids", async () => {
    const { queue, sent } = setup({});
    await queue.enqueue(item("1"));
    await queue.enqueue(item("1"));
    await queue.flush();
    expect(sent).toEqual(["1"]);
  });

  it("stops on a network error, keeps order, and resumes later", async () => {
    const { queue, sent, storage } = setup({ "2": [{ ok: false, retry: true, error: "offline" }] });
    for (const id of ["1", "2", "3"]) await queue.enqueue(item(id));
    await queue.flush();
    expect(sent).toEqual(["1", "2"]);
    expect(storage.data.map((i) => i.id)).toEqual(["2", "3"]);
    await queue.flush(); // back online
    expect(sent).toEqual(["1", "2", "2", "3"]);
    expect(storage.data).toEqual([]);
  });

  it("marks validation errors as rejected without blocking the rest", async () => {
    const { queue, sent, storage } = setup({ "2": [{ ok: false, retry: false, error: "player_not_in_team" }] });
    for (const id of ["1", "2", "3"]) await queue.enqueue(item(id));
    await queue.flush();
    expect(sent).toEqual(["1", "2", "3"]);
    expect(storage.data).toMatchObject([{ id: "2", status: "rejected", error: "player_not_in_team" }]);
    await queue.flush();
    expect(sent).toEqual(["1", "2", "3"]); // rejected items are not resent
  });

  it("treats a thrown sender as a network error", async () => {
    const storage = memoryStorage();
    const queue = new OutboxQueue(storage, async () => {
      throw new TypeError("Failed to fetch");
    });
    await queue.enqueue(item("1"));
    await queue.flush();
    expect(storage.data).toMatchObject([{ id: "1", status: "pending" }]);
  });

  it("holds an item until its hold time, and lets it be edited meanwhile", async () => {
    const { queue, sent, storage } = setup({});
    await queue.enqueue(item("1", { holdUntil: 5_000 }));
    await queue.enqueue(item("2"));
    await queue.flush(1_000);
    expect(sent).toEqual([]); // order is kept: "2" waits behind the held "1"
    await queue.update("1", (i) => ({ ...i, holdUntil: undefined, error: "edited" }));
    await queue.flush(1_000);
    expect(sent).toEqual(["1", "2"]);
    expect(storage.data).toEqual([]);
  });

  it("restores pending items after a reload", async () => {
    const storage = memoryStorage([item("1"), item("2")]);
    const sent: string[] = [];
    const queue = new OutboxQueue(storage, async (i) => {
      sent.push(i.id);
      return { ok: true };
    });
    await queue.init();
    expect(queue.snapshot.map((i) => i.id)).toEqual(["1", "2"]);
    await queue.flush();
    expect(sent).toEqual(["1", "2"]);
  });

  it("classifies errors", () => {
    expect(shouldRetry({ message: "TypeError: Failed to fetch", code: "" })).toBe(true);
    expect(shouldRetry({ code: "PGRST301" })).toBe(true); // JWT expired
    expect(shouldRetry({ code: "08006" })).toBe(true);
    expect(shouldRetry({ code: "22023", message: "player_not_in_team" })).toBe(false);
    expect(shouldRetry({ code: "P0001", message: "match_not_live" })).toBe(false);
  });
});

describe("correctionTime", () => {
  // Imported lazily to keep the import list above untouched.
  it("turns a typed minute into period + second that eventMinute shows back", async () => {
    const { correctionTime, eventMinute } = await import("./timer");
    const one = { periods: 1, period_seconds: 420 }; // 7 minutes
    for (const minute of [1, 4, 7]) {
      const at = correctionTime(minute, one);
      expect(at.period).toBe(1);
      expect(eventMinute(at.period, at.second, one.period_seconds)).toBe(`${minute}'`);
    }
    // After the end: added time of the last period.
    const late = correctionTime(9, one);
    expect(eventMinute(late.period, late.second, one.period_seconds)).toBe("7+2'");
    // Two periods of 10 minutes: minute 14 is in the second one.
    const two = { periods: 2, period_seconds: 600 };
    expect(correctionTime(14, two)).toEqual({ period: 2, second: 210 });
    expect(eventMinute(2, 210, 600)).toBe("14'");
    // Nonsense input never produces a negative time.
    expect(correctionTime(0, one)).toEqual({ period: 1, second: 30 });
    expect(correctionTime(-5, one)).toEqual({ period: 1, second: 30 });
  });
});
