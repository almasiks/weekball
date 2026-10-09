import { execFileSync } from "node:child_process";
import { expect, test as base, type Browser, type Page } from "@playwright/test";

// The organizer PIN of the local stack (ADMIN_PIN in .env.local).
export const ADMIN_PIN = process.env.E2E_ADMIN_PIN ?? "246810";

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36).slice(-4)}`;

/**
 * The app has one group for everybody, so tests would see each other's games and
 * players. Every test starts from an empty database instead. This talks to the
 * LOCAL Supabase container by name, so it can never touch a cloud database.
 */
export function resetDatabase() {
  const sql = [
    "truncate public.players cascade", // cascades to groups, games, signups, teams, matches, sounds…
    "delete from auth.users",
    "insert into public.groups (id, name) values ('00000000-0000-4000-8000-000000000001', 'Weekly Football') on conflict (id) do nothing",
  ].join("; ");
  execFileSync("docker", ["exec", "supabase_db_weekball", "psql", "-U", "postgres", "-d", "postgres", "-q", "-c", sql], {
    stdio: ["ignore", "ignore", "pipe"],
  });
}

/** `test` with a clean database before each test. */
export const test = base.extend<{ cleanDatabase: void }>({
  cleanDatabase: [
    async ({}, use) => {
      resetDatabase();
      await use();
    },
    { auto: true },
  ],
});

/** Fresh phone-like browser context = a new device with no session. */
export async function newDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

/** First visit: "Как тебя зовут?" -> the home page with the next game. */
export async function enter(page: Page, name: string) {
  await page.goto("/");
  await page.getByLabel("Имя").fill(name);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeVisible();
}

/** Enters with a name, then becomes the organizer with the PIN. */
export async function enterAsOrganizer(page: Page, name: string) {
  await enter(page, name);
  await page.goto("/admin");
  await page.getByLabel("PIN-код").fill(ADMIN_PIN);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("link", { name: "Расписание и игры" })).toBeVisible();
}

/** Organizer creates a one-off game tomorrow at 19:00. */
export async function createGameTomorrow(page: Page) {
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Almaty",
  });
  await page.goto("/admin/schedule");
  await page.locator("#game-date").fill(tomorrow);
  await page.locator("#game-place").fill("Тестовое поле");
  await page.getByRole("button", { name: "Создать разовую игру" }).click();
  await expect(page.getByText("Игра создана, запись открыта.")).toBeVisible();
}
