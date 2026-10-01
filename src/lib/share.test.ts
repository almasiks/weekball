import { describe, expect, it } from "vitest";
import { bestPlayersText, gameSummaryText, rankBestPlayers, teamsShareText, whatsappUrl } from "./share";

const startsAt = "2026-10-03T14:00:00Z"; // Сб 19:00 in Almaty
const timezone = "Asia/Almaty";
const url = "https://example.com/game/1";

const row = (name: string, goals: number, assists: number, wins: number, own_goals = 0) => ({
  name,
  goals,
  assists,
  wins,
  own_goals,
});

describe("rankBestPlayers", () => {
  it("orders by goals + assists, then goals, wins and fewer own goals", () => {
    const ranked = rankBestPlayers([
      row("Пётр", 1, 1, 0),
      row("Иван", 2, 0, 1),
      row("Олег", 0, 0, 3),
      row("Саша", 2, 0, 1, 1),
      row("Никто", 0, 0, 0),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Иван", "Саша", "Пётр", "Олег"]);
  });

  it("drops players without goals, assists and wins and respects the limit", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(`P${i}`, 8 - i, 0, 0));
    expect(rankBestPlayers([...rows, row("Zero", 0, 0, 0)])).toHaveLength(5);
    expect(rankBestPlayers([row("Zero", 0, 0, 0)])).toEqual([]);
  });
});

describe("share texts", () => {
  it("best players: MVP line and numbered list", () => {
    const text = bestPlayersText({
      startsAt,
      timezone,
      mvp: "Иван",
      players: [row("Иван", 3, 1, 2), row("Пётр", 0, 0, 1)],
      url,
    });
    expect(text).toContain("🏅 Лучшие игроки: Сб, 3 окт, 19:00");
    expect(text).toContain("⭐ Игрок вечера: Иван");
    expect(text).toContain("1. Иван — 3 ⚽, 1 🅰️, побед: 2");
    expect(text).toContain("2. Пётр — побед: 1");
    expect(text.endsWith(`Ссылка: ${url}`)).toBe(true);
  });

  it("evening summary includes MVP and top scorer when known", () => {
    const text = gameSummaryText({
      startsAt,
      timezone,
      teams: [
        { id: "a", name: "Красные", color: "#ef4444" },
        { id: "b", name: "Синие", color: "#3b82f6" },
      ],
      matches: [{ id: "m", team_a_id: "a", team_b_id: "b", score_a: 2, score_b: 1, status: "finished" }],
      standings: [],
      url,
      mvp: "Иван",
      topScorers: [{ name: "Иван", goals: 2 }],
    });
    expect(text).toContain("Красные 2:1 Синие");
    expect(text).toContain("⭐ Игрок вечера: Иван");
    expect(text).toContain("⚽ Бомбардир: Иван — 2");
  });

  it("teams text lists everyone, wa.me link is encoded", () => {
    const text = teamsShareText({
      startsAt,
      timezone,
      url,
      teams: [{ emoji: "🔴", name: "Красные", players: ["Иван", "Пётр"] }],
    });
    expect(text).toContain("🔴 Красные: Иван, Пётр");
    expect(whatsappUrl("a b&c")).toBe("https://wa.me/?text=a%20b%26c");
  });
});
