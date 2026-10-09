import { expect } from "@playwright/test";
import { ADMIN_PIN, createGameTomorrow, enter, enterAsOrganizer, newDevice, open, test, unique } from "./helpers";

test("a new person sees the next game at once; the name is asked only on the first «Иду»", async ({ browser }) => {
  const organizer = await newDevice(browser);
  await enterAsOrganizer(organizer, "Организатор");
  await createGameTomorrow(organizer);
  // Two names in the roster, without the app.
  await organizer.goto("/roster");
  await organizer.getByLabel("Имена — по одному на строку").fill("Азамат\nБекзат");
  await organizer.getByRole("button", { name: "Добавить 2" }).click();
  await expect(organizer.getByText("Добавлено: 2.")).toBeVisible();

  // First visit: no questions, no groups, no Google — the game is right there.
  const player = await newDevice(browser);
  await player.goto("/");
  await expect(player.getByText("Записано 0 / 20")).toBeVisible();
  await expect(player.getByText("Тестовое поле")).toBeVisible();
  await expect(player.getByText("до 2 голов · 7 мин")).toBeVisible();
  await expect(player.getByText(/Как тебя зовут|групп|Google/i)).toHaveCount(0);
  await expect(player.getByRole("navigation", { name: "Основная навигация" })).toBeVisible();
  await expect(player.getByRole("banner").getByRole("link", { name: /.+/ })).toHaveCount(1); // only the logo: no profile yet

  // One big button. The first press asks who it is: the roster names, or a new name.
  const go = player.getByRole("button", { name: "Иду", exact: true });
  expect((await go.boundingBox())!.width).toBeGreaterThan(280); // full width on a phone
  await go.click();
  const sheet = player.getByRole("dialog", { name: "Кто ты?" });
  await expect(sheet.getByRole("button", { name: "Азамат" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Бекзат" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Организатор" })).toHaveCount(0); // has the app already

  // A name that belongs to someone with the app gets a hint.
  const name = unique("Игрок");
  await sheet.getByRole("button", { name: "Меня нет в списке" }).click();
  await sheet.getByLabel("Имя").fill("организатор");
  await sheet.getByRole("button", { name: "Записаться" }).click();
  await expect(sheet.getByText("Такое имя уже есть, добавь фамилию или номер.")).toBeVisible();

  // A free name: signed up straight away, the sheet is gone.
  await sheet.getByLabel("Имя").fill(name);
  await sheet.getByRole("button", { name: "Записаться" }).click();
  await expect(player.getByText("Записано 1 / 20")).toBeVisible();
  await expect(sheet).toHaveCount(0);
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

  // The device is remembered: no question next time.
  await player.reload();
  await expect(player.getByRole("button", { name: "Не иду" })).toBeVisible();
  await expect(player.getByRole("banner").getByRole("link", { name })).toHaveAttribute("href", "/profile");
  await player.getByRole("button", { name: "Не иду" }).click();
  await expect(player.getByText("Записано 0 / 20")).toBeVisible();
  await player.getByRole("button", { name: "Иду", exact: true }).click();
  await expect(player.getByText("Записано 1 / 20")).toBeVisible();
  await expect(player.getByRole("dialog")).toHaveCount(0);

  // Someone from the roster picks their own name: one tap, no typing, no duplicate.
  const azamat = await newDevice(browser);
  await azamat.goto("/");
  await azamat.getByRole("button", { name: "Иду", exact: true }).click();
  await azamat.getByRole("dialog").getByRole("button", { name: "Азамат" }).click();
  await azamat.getByRole("dialog").getByRole("button", { name: "Записаться" }).click();
  await expect(azamat.getByText("Записано 2 / 20")).toBeVisible();
  await expect(azamat.getByRole("listitem").filter({ hasText: "Азамат (вы)" })).toBeVisible();

  // The organizer sees both in the game, and "Азамат" only once in the roster.
  await organizer.goto("/");
  await expect(organizer.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  await organizer.goto("/roster");
  await expect(organizer.getByRole("main").getByRole("link", { name: /^Азамат/ })).toHaveCount(1);
});

test("bottom menu on every page; /admin opens only with the PIN", async ({ browser }) => {
  // A visitor who never said who they are can use every tab.
  const player = await newDevice(browser);
  await open(player);
  const nav = player.getByRole("navigation", { name: "Основная навигация" });

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

  // The profile offers to pick a name, but does not require it.
  await player.goto("/profile");
  await expect(player.getByText("Ты ещё не выбрал имя")).toBeVisible();

  // No admin for a visitor: the admin pages ask for the PIN, a wrong one changes nothing.
  await player.goto("/admin/schedule");
  await expect(player).toHaveURL(/\/admin$/);
  await player.getByLabel("Ваше имя").fill("Хитрец");
  await player.getByLabel("PIN-код").fill("000000");
  await player.getByRole("button", { name: "Войти" }).click();
  await expect(player.getByText("Неверный PIN-код.")).toBeVisible();
  await expect(player.getByRole("link", { name: "Расписание и игры" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Админ" })).toHaveCount(0);

  // "Стать организатором" is tucked away in the profile, not on the home page.
  await enter(player, "Игрок");
  await player.goto("/");
  await expect(player.getByText("Стать организатором")).toHaveCount(0);
  await player.goto("/profile");
  await player.getByRole("link", { name: "Стать организатором" }).click();
  await expect(player.getByLabel("Ваше имя")).toHaveCount(0); // the name is known already
  await player.getByLabel("PIN-код").fill(ADMIN_PIN);
  await player.getByRole("button", { name: "Войти" }).click();
  await expect(player.getByRole("link", { name: "Расписание и игры" })).toBeVisible();
  await expect(nav.getByRole("link")).toHaveText(["Игра", "Матч", "Статистика", "Админ", "Профиль"]);
});
