import { expect } from "@playwright/test";
import { createGameTomorrow, enter, enterAsOrganizer, test, unique } from "./helpers";

// Needs the production build (`npm run build && npm run start`): the service
// worker is generated at build time.
test.use({ serviceWorkers: "allow" });

test("the match console reopens offline and keeps accepting events", async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const organizer = await context.newPage();
  await enterAsOrganizer(organizer, "Организатор");
  await createGameTomorrow(organizer);
  await organizer.goto("/");
  await organizer.getByRole("button", { name: "Иду", exact: true }).click();
  await expect(organizer.getByText("Записано 1 / 20")).toBeVisible();

  const player = await (await browser.newContext()).newPage();
  await enter(player, unique("Игрок"));
  await player.goto("/");
  await player.getByRole("button", { name: "Иду", exact: true }).click();
  await expect(player.getByRole("button", { name: "Не иду" })).toBeVisible();

  await organizer.goto("/");
  await organizer.locator('a[href^="/game/"]').first().click();
  await organizer.waitForURL(/\/game\/[0-9a-f-]{36}$/);
  const gameUrl = organizer.url();
  await organizer.getByRole("link", { name: "Разделить на команды" }).click();
  await organizer.getByRole("button", { name: "2 команды" }).click();
  await organizer.getByRole("button", { name: "Собрать автоматически" }).click();
  await expect(organizer.getByText("Не распределены · 0")).toBeVisible();

  await organizer.goto(`${gameUrl}/live`);
  await organizer.getByRole("button", { name: "Создать матч" }).click();
  await organizer.getByRole("button", { name: "Старт" }).click();
  await expect(organizer.getByRole("button", { name: "Пауза" })).toBeVisible();
  await expect(organizer.getByText("Синхронизировано")).toBeVisible();

  // The service worker is installed and controls the page; the snapshot is saved.
  await organizer.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await organizer.reload();
  await expect(organizer.getByRole("button", { name: "Пауза" })).toBeVisible();
  expect(await organizer.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // Offline reload: the precached shell restores the console from IndexedDB.
  await context.setOffline(true);
  await organizer.reload();
  await expect(organizer.getByText(/Нет сети — показано последнее сохранённое состояние/)).toBeVisible();
  await expect(organizer.getByRole("button", { name: "Пауза" })).toBeVisible();

  // Record a goal offline.
  await organizer.getByRole("button", { name: "⚽ Гол" }).first().click();
  await organizer.getByRole("dialog").getByRole("button").nth(1).click();
  await organizer.getByRole("dialog").getByRole("button", { name: "Без ассиста" }).click();
  await expect(organizer.getByText("Не отправлено: 1")).toBeVisible();

  // Back online: the queued goal is sent.
  await context.setOffline(false);
  await organizer.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(organizer.getByText("Синхронизировано")).toBeVisible({ timeout: 20_000 });

  // It really reached the server: the player sees the goal on the game page.
  await player.goto(gameUrl);
  await expect(player.locator("li", { hasText: "⚽" })).toHaveCount(1, { timeout: 20_000 });

  // Other pages offline show the offline page, not a browser error.
  await context.setOffline(true);
  await organizer.goto("/stats").catch(() => null);
  await expect(organizer.getByText("Нет подключения к интернету")).toBeVisible();
  await context.setOffline(false);
});
