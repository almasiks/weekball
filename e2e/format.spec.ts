import { expect, test, type Page } from "@playwright/test";
import { createGameTomorrow, createGroup, joinGroup, newDevice, unique } from "./helpers";

async function scoreGoal(organizer: Page, teamButtonIndex: number) {
  await organizer.getByRole("button", { name: "⚽ Гол" }).nth(teamButtonIndex).click();
  await organizer.getByRole("dialog").getByRole("button").nth(1).click();
  await organizer.getByRole("dialog").getByRole("button", { name: "Без ассиста" }).click();
}

test("match format: goal limit ends the match, undo reopens it, time runs out", async ({ browser }) => {
  test.setTimeout(240_000);
  const organizer = await newDevice(browser);
  const invite = await createGroup(organizer, unique("Формат"), "Организатор");
  await createGameTomorrow(organizer); // default format from the form: 2 goals, 7 min
  await organizer.goto("/");
  await organizer.getByRole("button", { name: "Иду", exact: true }).click();
  await expect(organizer.getByText(/Записано\s*1\s*из\s*20/)).toBeVisible();

  const viewer = await newDevice(browser);
  await joinGroup(viewer, invite, unique("Зритель"));
  await viewer.goto("/");
  await viewer.getByRole("button", { name: "Иду", exact: true }).click();
  await expect(viewer.getByRole("button", { name: "Иду", exact: true })).toHaveAttribute("aria-pressed", "true");

  await organizer.goto("/");
  await organizer.locator('a[href^="/game/"]').first().click();
  await organizer.waitForURL(/\/game\/[0-9a-f-]{36}$/);
  const gameUrl = organizer.url();
  await expect(organizer.getByText("до 2 голов · 7 мин")).toBeVisible();
  await organizer.getByRole("link", { name: "Разделить на команды" }).click();
  await organizer.getByRole("button", { name: "2 команды" }).click();
  await organizer.getByRole("button", { name: "Собрать автоматически" }).click();
  await expect(organizer.getByText("Не распределены · 0")).toBeVisible();

  // --- Goal limit
  await organizer.goto(`${gameUrl}/live`);
  await organizer.getByRole("button", { name: "Создать матч" }).click();
  await organizer.getByRole("button", { name: "Старт" }).click();
  await expect(organizer.getByText("до 2 голов · 7 мин").first()).toBeVisible();
  await scoreGoal(organizer, 0);
  await expect(organizer.getByRole("button", { name: "Завершить матч" })).toBeVisible();
  await scoreGoal(organizer, 0);
  await expect(organizer.getByText(/Матч завершён · по лимиту голов/)).toBeVisible();
  await expect(organizer.getByText("Синхронизировано")).toBeVisible();

  // Spectators see it finished (Realtime).
  await viewer.goto(gameUrl);
  await expect(viewer.getByText("Матч завершён")).toBeVisible();

  // Wrong winning goal -> undo -> the match continues.
  await organizer.getByRole("button", { name: "Отменить последний гол" }).click();
  await expect(organizer.getByRole("button", { name: "Пауза" })).toBeVisible();
  await expect(organizer.getByText("Синхронизировано")).toBeVisible();
  await expect(viewer.getByText("Матч завершён")).toHaveCount(0, { timeout: 15_000 });

  // A real winning goal, then "Следующий матч".
  await scoreGoal(organizer, 1);
  await scoreGoal(organizer, 1);
  await expect(organizer.getByText(/Матч завершён · по лимиту голов/)).toBeVisible();
  await expect(organizer.getByText("Синхронизировано")).toBeVisible();
  await organizer.getByRole("button", { name: "Следующий матч" }).click();
  await organizer.getByRole("button", { name: "Создать" }).click();
  await expect(organizer.getByRole("button", { name: "Старт" })).toBeVisible();

  // --- Time runs out: 1-minute matches, 0:0 -> draw.
  await organizer.goto(gameUrl);
  await organizer.getByRole("button", { name: "Редактировать игру" }).click();
  await organizer.getByLabel("Длительность, мин").fill("1");
  await organizer.getByRole("button", { name: "Сохранить" }).click();
  await expect(organizer.getByRole("dialog")).toBeHidden();

  await organizer.goto(`${gameUrl}/live`);
  await expect(organizer.getByText("до 2 голов · 1 мин").first()).toBeVisible();
  await organizer.getByRole("button", { name: "Старт" }).click();
  await expect(organizer.getByText(/Матч завершён · время вышло · ничья/)).toBeVisible({ timeout: 90_000 });
  await expect(organizer.getByText("Синхронизировано")).toBeVisible();

  // Standings count it: 2 matches finished (1 win + 1 draw).
  await organizer.goto(gameUrl);
  await expect(organizer.getByRole("cell", { name: "4" }).or(organizer.getByRole("cell", { name: "1" })).first()).toBeVisible();
});
