import { expect, test } from "@playwright/test";
import { createGameTomorrow, createGroup, unique } from "./helpers";

const NAMES = [
  "Азамат", "Бекзат", "Данияр", "Ерлан", "Жандос", "Ильяс", "Канат", "Марат", "Нурлан", "Олжас",
  "Руслан", "Санжар", "Тимур", "Улан", "Хасан", "Шынгыс", "Арман", "Бахыт", "Дамир", "Ержан",
];

// "Играю один": only the organizer has the app, the others are names in the roster.
test("solo organizer: roster, check-in (offline too), quick add, teams from present, claim", async ({ browser }) => {
  const context = await browser.newContext();
  const organizer = await context.newPage();
  const invite = await createGroup(organizer, unique("Состав"), "Организатор");
  await createGameTomorrow(organizer);

  // --- 20 names at once; a duplicate is highlighted
  await organizer.goto("/roster");
  await organizer.getByLabel("Имена — по одному на строку").fill([...NAMES, "азамат"].join("\n"));
  await expect(organizer.getByRole("list", { name: "Предпросмотр" }).getByLabel(/уже|дубл|повтор/i)).not.toHaveCount(0);
  await organizer.getByLabel("Имена — по одному на строку").fill(NAMES.join("\n"));
  await organizer.getByRole("button", { name: "Добавить 20" }).click();
  await expect(organizer.getByText("Добавлено: 20.")).toBeVisible();
  await expect(organizer.getByRole("link", { name: "Шынгыс" })).toBeVisible();

  // --- Check-in: big checkboxes, counter updates at once
  await organizer.goto("/");
  await organizer.locator('a[href^="/game/"]').first().click();
  await organizer.waitForURL(/\/game\/[0-9a-f-]{36}$/);
  const gameUrl = organizer.url();
  await organizer.getByRole("link", { name: "Отметить пришедших" }).click();
  await expect(organizer.getByText(/Пришло 0/)).toBeVisible();
  for (const name of NAMES.slice(0, 4)) {
    await organizer.getByRole("checkbox", { name: new RegExp(name) }).click();
  }
  await expect(organizer.getByText(/Пришло 4/)).toBeVisible();
  await expect(organizer.getByText("сохранено")).toBeVisible();

  // Offline: the tap is queued and the counter still moves.
  await context.setOffline(true);
  await organizer.getByRole("checkbox", { name: /Жандос/ }).click();
  await expect(organizer.getByText(/Пришло 5/)).toBeVisible();
  await expect(organizer.getByText("не отправлено: 1")).toBeVisible();
  await context.setOffline(false);
  await organizer.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(organizer.getByText("сохранено")).toBeVisible({ timeout: 20_000 });

  // Quick add of a one-off player: 2 taps after typing the name.
  await organizer.getByRole("button", { name: "Добавить нового игрока" }).click();
  await organizer.getByLabel("Имя").fill("Гость Петя");
  await organizer.getByLabel("Добавить в постоянный состав").uncheck();
  await organizer.getByRole("button", { name: "Добавить и отметить" }).click();
  await expect(organizer.getByText(/Пришло 6/)).toBeVisible();
  await expect(organizer.getByText("сохранено")).toBeVisible({ timeout: 20_000 });

  // The server really has them (survives a reload).
  await organizer.reload();
  await expect(organizer.getByText(/Пришло 6/)).toBeVisible();

  // --- Teams from the present players only
  await organizer.getByRole("link", { name: "К командам" }).click();
  await organizer.getByRole("button", { name: "2 команды" }).click();
  await expect(organizer.getByRole("button", { name: /Только пришедшие · 6/ })).toHaveAttribute("aria-pressed", "true");
  await organizer.getByRole("button", { name: "Собрать автоматически" }).click();
  await expect(organizer.getByText("Не распределены · 0")).toBeVisible();
  const share = organizer.getByRole("link", { name: "Поделиться составами в WhatsApp" });
  await expect(share).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);

  // --- Game screen: stats table + cards
  await organizer.goto(gameUrl);
  await expect(organizer.getByRole("heading", { name: "Статистика игры" })).toBeVisible();
  await expect(organizer.getByRole("table").getByText("Гость Петя")).toBeVisible();
  for (const card of ["Лучшие игроки", "Редактировать игру", "Сбросить результаты", "Инфо", "Удалить игру"]) {
    await expect(organizer.getByRole("button", { name: card })).toBeVisible();
  }

  // --- A real person claims their name and keeps the history
  const phone = await (await browser.newContext()).newPage();
  await phone.goto(new URL(invite).pathname);
  await phone.getByRole("button", { name: "Азамат", exact: true }).click();
  await phone.getByRole("button", { name: "Это я" }).click();
  await expect(phone).toHaveURL(/\/roster/);
  await phone.goto(gameUrl);
  await expect(phone.getByText(/Ты в команде|Азамат/).first()).toBeVisible();

  // The claimed name is no longer offered to others.
  const other = await (await browser.newContext()).newPage();
  await other.goto(new URL(invite).pathname);
  await expect(other.getByRole("button", { name: "Бекзат", exact: true })).toBeVisible();
  await expect(other.getByRole("button", { name: "Азамат", exact: true })).toHaveCount(0);
});
