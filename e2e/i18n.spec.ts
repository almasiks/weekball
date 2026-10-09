import { expect, test, type Browser, type Page } from "@playwright/test";
import { createGameTomorrow, createGroup, unique } from "./helpers";

// The switcher in the header: a button that opens a sheet with the three languages.
async function pickLanguage(page: Page, name: string) {
  await page.getByRole("button", { name: /^(Язык|Тіл|Language): / }).click();
  await page.getByRole("radio", { name }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

const phone = async (browser: Browser, locale: string) => (await browser.newContext({ locale })).newPage();

test("the interface follows the phone language, Russian by default", async ({ browser }) => {
  const english = await phone(browser, "en-US");
  await english.goto("/");
  await expect(english.getByRole("heading", { name: "Weekly football without the hassle" })).toBeVisible();
  await expect(english.locator("html")).toHaveAttribute("lang", "en");

  const kazakh = await phone(browser, "kk-KZ");
  await kazakh.goto("/");
  await expect(kazakh.getByRole("link", { name: "Топ құру" })).toBeVisible();

  // A language we don't have falls back to Russian.
  const german = await phone(browser, "de-DE");
  await german.goto("/");
  await expect(german.getByRole("link", { name: "Создать группу" })).toBeVisible();
  await expect(german.locator("html")).toHaveAttribute("lang", "ru");
});

test("the language switcher is remembered and the whole flow works in Kazakh and English", async ({ browser }) => {
  const page = await phone(browser, "ru-RU");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Создать группу" })).toBeVisible();

  // Switch to Kazakh: the page changes at once and stays so after a reload.
  await pickLanguage(page, "Қазақша");
  await expect(page.getByRole("link", { name: "Топ құру" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Топ құру" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "kk");

  // An error raised by the database comes back translated.
  await page.goto("/join/ZZZZ9999");
  await page.getByLabel("Атыңыз").fill("Қонақ");
  await page.getByRole("button", { name: "Топқа қосылу" }).click();
  await expect(page.getByText("Шақыру сілтемесі жарамсыз. Ұйымдастырушыдан жаңасын сұраңыз.")).toBeVisible();

  // Create a group in Kazakh: form labels and the admin page.
  await page.goto("/");
  await page.getByRole("link", { name: "Топ құру" }).click();
  await page.getByLabel("Топ атауы").fill(unique("Тіл"));
  await page.getByLabel("Атыңыз").fill("Ұйымдастырушы");
  await page.getByRole("button", { name: "Топ құру" }).click();
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText("Топ құрылды!")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Негізгі навигация" }).getByRole("link", { name: "Құрам" })).toBeVisible();

  await page.goto("/admin/schedule");
  await expect(page.getByRole("button", { name: "Бір реттік ойын құру" })).toBeVisible();

  // The same screens in English.
  await pickLanguage(page, "English");
  await expect(page.getByText("Games are created automatically two weeks ahead.")).toBeVisible();
  await expect(page.getByRole("option", { name: "Saturday" })).toBeAttached();
  await page.locator("#game-date").fill(
    new Date(Date.now() + 24 * 3600 * 1000).toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" }),
  );
  await page.getByRole("button", { name: "Create one-off game" }).click();
  await expect(page.getByText("The game is created, sign-up is open.")).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "I'm in", exact: true }).click();
  await expect(page.getByRole("button", { name: "I'm in", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Signed up:\s*1\s*of\s*20/)).toBeVisible();
  await expect(page.getByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{1,2} [A-Z][a-z]{2}, 19:00$/)).toBeVisible();
  // The WhatsApp text is in the language of the person who shares.
  await expect(page.getByRole("link", { name: "Share on WhatsApp" })).toHaveAttribute(
    "href",
    /Sign%20up!%201%20of%2020%20so%20far\.%20Link%3A/,
  );

  // Teams: default team names, plural forms and the stats table in English.
  await page.locator('a[href^="/game/"]').first().click();
  await page.getByRole("link", { name: "Make teams" }).click();
  await page.getByRole("button", { name: "2 teams" }).click();
  await expect(page.getByText("Unassigned · 1")).toBeVisible();
  await page.getByRole("button", { name: "Build automatically" }).click();
  await expect(page.getByText("Unassigned · 0")).toBeVisible();
  await expect(page.getByText("Reds", { exact: true })).toBeVisible();
  await expect(page.getByText("1 pl.").first()).toBeVisible();
});

test("the language is kept by the static pages too (offline shell, 404)", async ({ browser }) => {
  const page = await phone(browser, "ru-RU");
  await page.goto("/");
  await pickLanguage(page, "English");
  await expect(page.getByRole("link", { name: "Create a group" })).toBeVisible();

  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: "No internet connection" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("Russian stays exactly as it was for a Russian phone", async ({ browser }) => {
  const page = await phone(browser, "ru-RU");
  await createGroup(page, unique("Рус"), "Организатор");
  await createGameTomorrow(page);
  await page.goto("/");
  await expect(page.getByText(/^(Пн|Вт|Ср|Чт|Пт|Сб|Вс), \d{1,2} [а-я]{3}, 19:00$/)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("button", { name: "Язык: Русский" })).toBeVisible();
  // The current language is the checked one in the sheet.
  await page.getByRole("button", { name: "Язык: Русский" }).click();
  await expect(page.getByRole("radio", { name: "Русский" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Қазақша" })).not.toBeChecked();
});
