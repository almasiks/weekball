import { expect, type Page } from "@playwright/test";
import { createGameTomorrow, enter, enterAsOrganizer, newDevice, test, unique } from "./helpers";

async function scoreGoal(organizer: Page, teamButtonIndex: number) {
  await organizer.getByRole("button", { name: "⚽ Гол" }).nth(teamButtonIndex).click();
  const sheet = organizer.getByRole("dialog");
  await sheet.getByRole("button").nth(1).click(); // first player (0 = "Закрыть")
  await organizer.getByRole("dialog").getByRole("button", { name: "Без ассиста" }).click();
}

test("organizer runs a match (incl. offline goal), stats appear after finishing", async ({ browser }) => {
  const organizer = await newDevice(browser);
  await enterAsOrganizer(organizer, "Организатор");
  await createGameTomorrow(organizer);
  await organizer.goto("/");
  await organizer.getByRole("button", { name: "Иду", exact: true }).click();
  await expect(organizer.getByText("Записано 1 / 20")).toBeVisible();

  const viewer = await newDevice(browser);
  await enter(viewer, unique("Зритель"));
  await viewer.goto("/");
  await viewer.getByRole("button", { name: "Иду", exact: true }).click();
  await expect(viewer.getByRole("button", { name: "Не иду" })).toBeVisible();

  // Teams
  await organizer.goto("/");
  await organizer.locator('a[href^="/game/"]').first().click();
  await organizer.waitForURL(/\/game\/[0-9a-f-]{36}$/);
  const gameUrl = organizer.url();
  await organizer.getByRole("link", { name: "Разделить на команды" }).click();
  await organizer.getByRole("button", { name: "2 команды" }).click();
  await organizer.getByRole("button", { name: "Собрать автоматически" }).click();
  await expect(organizer.getByText("Не распределены · 0")).toBeVisible();

  // Live console: one period, kick-off
  await organizer.goto(gameUrl);
  await organizer.getByRole("link", { name: "Матч", exact: true }).click();
  await organizer.getByRole("button", { name: "Создать матч" }).click();
  await organizer.getByRole("button", { name: "Старт" }).click();
  await expect(organizer.getByRole("button", { name: "Пауза" })).toBeVisible();
  await expect(organizer.getByText("Синхронизировано")).toBeVisible();

  // Goal in two taps (+ "no assist")
  await scoreGoal(organizer, 0);
  await expect(organizer.getByText("Синхронизировано")).toBeVisible();

  // Home: the bright LIVE strip with the score and the running clock, and the line-ups
  // (kick-off publishes them). The strip and the "Матч" tab lead to the live view.
  await viewer.goto("/");
  const live = viewer.getByRole("link", { name: /^Идёт матч: .+ 1:0 .+/ });
  await expect(live).toContainText("LIVE");
  await expect(live).toContainText(/1:0 · \d{2}:\d{2}/);
  await expect(viewer.getByRole("heading", { name: "Составы" })).toBeVisible();
  await live.click();
  await expect(viewer).toHaveURL(/\/match$/);
  await expect(viewer.locator("li", { hasText: "⚽" }).first()).toBeVisible();
  // For the organizer the same tab opens the console.
  const organizerTab = await organizer.context().newPage();
  await organizerTab.goto("/match");
  await expect(organizerTab).toHaveURL(new RegExp(`${new URL(gameUrl).pathname}/live$`));
  await organizerTab.close();

  // The viewer sees it on the game page (Realtime), without reloading.
  await viewer.goto(gameUrl);
  await expect(viewer.locator("li", { hasText: "⚽" }).first()).toBeVisible();

  // Offline goal: queued, then sent when the connection returns.
  await organizer.context().setOffline(true);
  await scoreGoal(organizer, 1);
  await expect(organizer.getByText("Не отправлено: 1")).toBeVisible();
  await organizer.context().setOffline(false);
  await organizer.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(organizer.getByText("Синхронизировано")).toBeVisible({ timeout: 20_000 });
  await expect(viewer.locator("li", { hasText: "⚽" })).toHaveCount(2, { timeout: 20_000 });

  // Undo the last event: the viewer's feed shrinks back to one goal.
  await organizer.getByRole("button", { name: "Отменить последнее событие" }).click();
  await expect(organizer.getByText("Синхронизировано")).toBeVisible();
  await expect(viewer.locator("li", { hasText: "⚽" })).toHaveCount(1, { timeout: 20_000 });

  // Finish the match and the game.
  await organizer.getByRole("button", { name: "Завершить матч" }).click();
  await organizer.getByRole("dialog").getByRole("button", { name: "Завершить" }).click();
  await expect(organizer.getByText(/Матч завершён · завершён вручную/)).toBeVisible();
  await organizer.getByRole("button", { name: "Завершить игру" }).click();
  await organizer.getByRole("dialog").getByRole("button", { name: "Завершить" }).click();
  await expect(organizer).toHaveURL(gameUrl);
  await expect(organizer.getByRole("heading", { name: "Итоги" })).toBeVisible();
  await expect(organizer.getByText("Лучший бомбардир вечера")).toBeVisible();
  // finalize ran: no "statistics not updated" banner
  await expect(organizer.getByText("Статистика и рейтинги по этой игре не обновлены.")).toHaveCount(0);

  // Stats: the scorer is on the leaderboard, ratings exist.
  await organizer.goto("/stats?tab=scorers");
  await expect(organizer.locator("tbody tr")).toHaveCount(1);
  await organizer.goto("/stats?tab=rating");
  await expect(organizer.locator("tbody tr")).toHaveCount(2);

  // Correction after the game: void the goal, recalculate -> gone from the stats.
  await organizer.goto(gameUrl);
  await organizer.getByRole("link", { name: "Исправить события" }).click();
  await organizer.getByRole("button", { name: /^Отменить: / }).first().click();
  await organizer.getByRole("dialog").getByRole("button", { name: "Отменить" }).click();
  await expect(organizer.getByText("Синхронизировано")).toBeVisible();
  await organizer.goto(gameUrl);
  await expect(organizer.getByText("Статистика и рейтинги по этой игре не обновлены.")).toBeVisible();
  await organizer.getByRole("button", { name: "Пересчитать" }).click();
  await expect(organizer.getByText("Статистика и рейтинги по этой игре не обновлены.")).toHaveCount(0);
  await organizer.goto("/stats?tab=scorers");
  await expect(organizer.getByText("Голов пока нет.")).toBeVisible();
});
