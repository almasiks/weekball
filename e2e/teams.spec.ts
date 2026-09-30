import { expect, test } from "@playwright/test";
import { createGameTomorrow, createGroup, joinGroup, newDevice, unique } from "./helpers";

test("organizer builds and publishes teams, the player sees their team", async ({ browser }) => {
  const organizer = await newDevice(browser);
  const invite = await createGroup(organizer, unique("Команды"), "Организатор");
  await createGameTomorrow(organizer);
  await organizer.goto("/");
  await organizer.getByRole("button", { name: "Иду", exact: true }).click();
  await expect(organizer.getByText(/Записано\s*1\s*из\s*20/)).toBeVisible();

  const players = [];
  for (let i = 0; i < 3; i++) {
    const page = await newDevice(browser);
    await joinGroup(page, invite, unique(`Игрок${i + 1}`));
    await page.goto("/");
    await page.getByRole("button", { name: "Иду", exact: true }).click();
    await expect(page.getByRole("button", { name: "Иду", exact: true })).toHaveAttribute("aria-pressed", "true");
    players.push(page);
  }

  // Before publishing the player can't see any lineup.
  const player = players[0];
  await player.goto("/");
  await expect(player.getByText(/Ты в команде/)).toHaveCount(0);

  // Organizer: game page -> teams -> 2 teams -> auto -> publish.
  await organizer.goto("/");
  await organizer.locator('a[href^="/game/"]').first().click();
  await organizer.getByRole("link", { name: "Разделить на команды" }).click();
  await organizer.getByRole("button", { name: "2 команды" }).click();
  await expect(organizer.getByText("Красные").first()).toBeVisible();
  await organizer.getByRole("button", { name: "Собрать автоматически" }).click();
  await expect(organizer.getByText("Не распределены · 0")).toBeVisible();
  await organizer.getByRole("button", { name: "Опубликовать" }).click();
  await expect(organizer.getByText("Составы опубликованы")).toBeVisible();

  // The player now sees their own team on the home page.
  await player.goto("/");
  await expect(player.getByText(/Ты в команде «(Красные|Синие)»/)).toBeVisible();
});
