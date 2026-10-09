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

  // --- The organizer changes the statistics after the game.
  const recalculated = () =>
    organizer.waitForResponse((r) => r.url().includes("/finalize") && r.request().method() === "POST" && r.ok());

  // Remove a wrong goal: gone from the stats, ratings recalculated by themselves.
  await organizer.goto(gameUrl);
  await organizer.getByRole("link", { name: "Исправить события" }).click();
  let done = recalculated();
  await organizer.getByRole("button", { name: /^Отменить: / }).first().click();
  await organizer.getByRole("dialog").getByRole("button", { name: "Отменить" }).click();
  await done;
  await organizer.goto("/stats?tab=scorers");
  await expect(organizer.getByText("Голов пока нет.")).toBeVisible();

  // Add a forgotten goal with an assist at minute 3: the score, the events and the stats change.
  await organizer.goto(`${gameUrl}/live`);
  // Hidden until asked for: nobody adds a goal by habit after the whistle.
  await expect(organizer.getByRole("button", { name: "⚽ Гол" })).toHaveCount(0);
  await organizer.getByRole("button", { name: "Исправить матч" }).click();
  await expect(organizer.getByRole("button", { name: "🔄 Замена" })).toHaveCount(0); // not a correction
  await organizer.getByLabel("Минута матча").fill("3");
  done = recalculated();
  await organizer.getByRole("button", { name: "⚽ Гол" }).nth(1).click();
  const scorerSheet = organizer.getByRole("dialog");
  const scorer = (await scorerSheet.getByRole("button").nth(1).innerText()).trim();
  await scorerSheet.getByRole("button").nth(1).click();
  // The other player of that team made the pass, unless the scorer is alone in it.
  const assistSheet = organizer.getByRole("dialog");
  await assistSheet.getByRole("button").nth(1).click();
  await done;

  await organizer.goto(gameUrl);
  await expect(organizer.getByText("Статистика и рейтинги по этой игре не обновлены.")).toHaveCount(0);
  await expect(organizer.locator("li", { hasText: "⚽" }).filter({ hasText: "3'" })).toBeVisible();
  await organizer.goto("/stats?tab=scorers");
  await expect(organizer.locator("tbody tr")).toHaveCount(1);
  await expect(organizer.locator("tbody tr").first()).toContainText(scorer.split("\n")[0]);

  // A player has no way to do that.
  await viewer.goto(`${gameUrl}/live`);
  await expect(viewer.getByText("Исправить матч")).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "⚽ Гол" })).toHaveCount(0);

  // --- Numbers by hand, right in "Статистика" (the pencil in a row).
  const edits = organizer.getByRole("button", { name: /^Изменить статистику: / });
  const firstRow = (page: Page) => page.locator("tbody tr").first();
  const save = async (fields: Record<string, string>) => {
    const sheet = organizer.getByRole("dialog");
    for (const [label, value] of Object.entries(fields)) await sheet.getByLabel(label, { exact: true }).fill(value);
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await expect(sheet).toHaveCount(0);
  };
  await organizer.goto("/stats?tab=scorers");
  await expect(organizer.locator("tbody tr")).toHaveCount(1);
  await edits.first().click();
  await expect(organizer.getByRole("dialog").getByLabel("Голы", { exact: true })).toHaveValue("1"); // what the matches give
  await save({ Голы: "7", Передачи: "4", Победы: "3" });
  await expect(firstRow(organizer).getByRole("cell").nth(1)).toHaveText("7");
  await expect(firstRow(organizer).getByLabel("цифры изменены вручную")).toBeVisible();

  // Someone who is not in this table yet: from "Остальные игроки".
  await organizer.getByText(/^Остальные игроки/).click();
  await edits.last().click();
  await save({ Голы: "9" });
  await expect(organizer.locator("tbody tr")).toHaveCount(2);
  await expect(firstRow(organizer).getByRole("cell").nth(1)).toHaveText("9");

  // Bad input is refused with a hint.
  await edits.first().click();
  await organizer.getByRole("dialog").getByLabel("Голы", { exact: true }).fill("-2");
  await organizer.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
  await expect(organizer.getByRole("dialog").getByText("Впишите целые числа от 0 до 9999.")).toBeVisible();
  await organizer.getByRole("dialog").getByRole("button", { name: "Закрыть" }).first().click();

  // Everybody sees the new numbers (also in the other tabs and the profile); only the organizer can edit.
  await viewer.goto("/stats?tab=scorers");
  await expect(viewer.locator("tbody tr")).toHaveCount(2);
  await expect(firstRow(viewer).getByRole("cell").nth(1)).toHaveText("9");
  await expect(viewer.getByRole("button", { name: /^Изменить статистику/ })).toHaveCount(0);
  await viewer.goto("/stats?tab=assists");
  await expect(firstRow(viewer).getByRole("cell").nth(1)).toHaveText("4");

  // "Последние 10 игр" shows the matches only, and offers no editing.
  await organizer.goto("/stats?tab=scorers&period=10");
  await expect(firstRow(organizer).getByRole("cell").nth(1)).toHaveText("1");
  await expect(edits).toHaveCount(0);
  await expect(organizer.getByText("Менять цифры можно в режиме «Всё время».")).toBeVisible();

  // Back to what the matches give.
  await organizer.goto("/stats?tab=scorers");
  await edits.first().click();
  await organizer.getByRole("dialog").getByRole("button", { name: "Вернуть подсчитанное по матчам" }).click();
  await expect(organizer.getByRole("dialog")).toHaveCount(0);
  // The first row was the player with 9 hand-set goals and none in matches: gone from the scorers.
  await expect(organizer.locator("tbody tr")).toHaveCount(1);
  await expect(firstRow(organizer).getByRole("cell").nth(1)).toHaveText("7");
  await expect(firstRow(organizer).getByLabel("цифры изменены вручную")).toBeVisible();

  // The table with the pencils fits a 375 px phone.
  await organizer.setViewportSize({ width: 375, height: 700 });
  expect(await organizer.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const pencil = await edits.first().boundingBox();
  expect(pencil!.x + pencil!.width).toBeLessThanOrEqual(375);
  expect(pencil!.width).toBeGreaterThanOrEqual(44);
});
