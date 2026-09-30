import { expect, type Browser, type Page } from "@playwright/test";

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36).slice(-4)}`;

/** Fresh phone-like browser context = a new device with no session. */
export async function newDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

/** Organizer creates a group; returns the invite link. */
export async function createGroup(page: Page, groupName: string, organizerName: string) {
  await page.goto("/");
  await page.getByRole("link", { name: "Создать группу" }).click();
  await page.getByLabel("Название группы").fill(groupName);
  await page.getByLabel("Ваше имя").fill(organizerName);
  await page.getByRole("button", { name: "Создать группу" }).click();
  await expect(page).toHaveURL(/\/admin/);
  const invite = (await page.getByLabel("Ссылка-приглашение").textContent())?.trim();
  expect(invite).toMatch(/\/join\/[A-Z0-9]{8}$/);
  return invite!;
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

/** A player opens the invite link on their phone and joins. */
export async function joinGroup(page: Page, invite: string, name: string) {
  await page.goto(new URL(invite).pathname);
  await page.getByLabel("Ваше имя").fill(name);
  await page.getByRole("button", { name: "Вступить в группу" }).click();
  await expect(page).toHaveURL(/\/members/);
}
