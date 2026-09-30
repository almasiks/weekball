import { expect, test } from "@playwright/test";
import { createGameTomorrow, createGroup, joinGroup, newDevice, unique } from "./helpers";

test("organizer creates a group, a player joins by link and signs up", async ({ browser }) => {
  const organizer = await newDevice(browser);
  const invite = await createGroup(organizer, unique("Суббота"), "Организатор");
  await createGameTomorrow(organizer);

  const player = await newDevice(browser);
  const name = unique("Игрок");
  await joinGroup(player, invite, name);
  await expect(player.getByText(name)).toBeVisible();

  // Signs up for the next game on the home page.
  await player.goto("/");
  await player.getByRole("button", { name: "Иду", exact: true }).click();
  await expect(player.getByRole("button", { name: "Иду", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(player.getByText(/Записано\s*1\s*из\s*20/)).toBeVisible();

  // The session survives a reload.
  await player.reload();
  await expect(player.getByRole("button", { name: "Иду", exact: true })).toHaveAttribute("aria-pressed", "true");

  // The organizer sees the player in the members list and in the game.
  await organizer.goto("/members");
  await expect(organizer.getByText(name)).toBeVisible();
  await organizer.goto("/");
  await expect(organizer.getByText(name)).toBeVisible();
});
