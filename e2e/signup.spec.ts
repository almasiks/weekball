import { expect } from "@playwright/test";
import { ADMIN_PIN, createGameTomorrow, enter, enterAsOrganizer, newDevice, test, unique } from "./helpers";

test("a new person enters a name, sees the next game and signs up", async ({ browser }) => {
  const organizer = await newDevice(browser);
  await enterAsOrganizer(organizer, "Организатор");
  await createGameTomorrow(organizer);

  // First visit: nothing but "Как тебя зовут?" — no groups, no Google.
  const player = await newDevice(browser);
  const name = unique("Игрок");
  await player.goto("/");
  await expect(player.getByRole("navigation", { name: "Основная навигация" })).toHaveCount(0);
  await expect(player.getByText(/групп|Google/i)).toHaveCount(0);
  await expect(player.getByText("Как тебя зовут?")).toBeVisible();

  // A taken name gets a hint instead of a second "Организатор".
  await player.getByLabel("Имя").fill("организатор");
  await player.getByRole("button", { name: "Войти" }).click();
  await expect(player.getByText("Такое имя уже есть, добавь фамилию или номер.")).toBeVisible();

  // With a free name the next game is right there, with one big button.
  await player.getByLabel("Имя").fill(name);
  await player.getByRole("button", { name: "Войти" }).click();
  await expect(player.getByText("Записано 0 / 20")).toBeVisible();
  await expect(player.getByText("Тестовое поле")).toBeVisible();
  await expect(player.getByText("до 2 голов · 7 мин")).toBeVisible();
  const go = player.getByRole("button", { name: "Иду", exact: true });
  expect((await go.boundingBox())!.width).toBeGreaterThan(280); // full width on a phone
  await go.click();
  await expect(player.getByText("Записано 1 / 20")).toBeVisible();
  await expect(go).toHaveCount(0);
  for (const label of ["Не иду", "Опаздываю", "Я на месте"]) {
    await expect(player.getByRole("button", { name: label })).toBeVisible();
  }

  // Statuses in the list: going -> late -> here.
  const row = player.getByRole("listitem").filter({ hasText: name });
  await expect(row.getByText("идёт")).toBeVisible();
  await player.getByRole("button", { name: "Опаздываю" }).click();
  await player.getByRole("button", { name: "10", exact: true }).click();
  await expect(row.getByText("опаздывает ~10 мин")).toBeVisible();
  await player.getByRole("button", { name: "Я на месте" }).click();
  await expect(row.getByText("на месте")).toBeVisible();

  // The device is remembered.
  await player.reload();
  await expect(player.getByRole("button", { name: "Не иду" })).toBeVisible();
  await expect(player.getByRole("link", { name })).toHaveAttribute("href", "/profile");

  // The organizer sees the player in the roster and in the game, in real time.
  await organizer.goto("/roster");
  await expect(organizer.getByRole("link", { name })).toBeVisible();
  await organizer.goto("/");
  await expect(organizer.getByRole("listitem").filter({ hasText: name })).toBeVisible();

  // "Не иду" takes the player out again.
  await player.getByRole("button", { name: "Не иду" }).click();
  await expect(player.getByRole("button", { name: "Иду", exact: true })).toBeVisible();
  await expect(player.getByText("Записано 0 / 20")).toBeVisible();
});

test("bottom menu on every page; /admin opens only with the PIN", async ({ browser }) => {
  const player = await newDevice(browser);
  await enter(player, "Игрок");
  const nav = player.getByRole("navigation", { name: "Основная навигация" });

  // Player tabs.
  await expect(nav.getByRole("link")).toHaveText(["Игра", "Матч", "Статистика", "История", "Профиль"]);
  for (const [tab, url] of [
    ["Матч", /\/match$/],
    ["Статистика", /\/stats/],
    ["История", /\/history$/],
    ["Профиль", /\/profile$/],
    ["Игра", /\/$/],
  ] as const) {
    await nav.getByRole("link", { name: tab }).click();
    await expect(player).toHaveURL(url);
    await expect(nav.getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
    await expect(nav).toBeVisible();
  }
  // It fits a 375 px phone without horizontal scrolling.
  await player.setViewportSize({ width: 375, height: 700 });
  expect(await player.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  // No admin for a player: the admin pages ask for the PIN, a wrong one changes nothing.
  await player.goto("/admin/schedule");
  await expect(player).toHaveURL(/\/admin$/);
  await player.getByLabel("PIN-код").fill("000000");
  await player.getByRole("button", { name: "Войти" }).click();
  await expect(player.getByText("Неверный PIN-код.")).toBeVisible();
  await expect(player.getByRole("link", { name: "Расписание и игры" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Админ" })).toHaveCount(0);

  // "Стать организатором" is tucked away in the profile, not on the home page.
  await player.goto("/");
  await expect(player.getByText("Стать организатором")).toHaveCount(0);
  await player.goto("/profile");
  await player.getByRole("link", { name: "Стать организатором" }).click();
  await player.getByLabel("PIN-код").fill(ADMIN_PIN);
  await player.getByRole("button", { name: "Войти" }).click();
  await expect(player.getByRole("link", { name: "Расписание и игры" })).toBeVisible();
  await expect(nav.getByRole("link")).toHaveText(["Игра", "Матч", "Статистика", "Админ", "Профиль"]);
});
