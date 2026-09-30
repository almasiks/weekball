import { expect, test, type Page } from "@playwright/test";
import { createGameTomorrow, createGroup, joinGroup, unique } from "./helpers";

// Needs the production build (service worker for the offline part).
test.use({ serviceWorkers: "allow" });

/** A tiny valid WAV (0.2 s, 440 Hz). */
function wav(): Buffer {
  const rate = 8000;
  const samples = rate / 5;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

type Played = { key: string; source: string };
const played = (page: Page) => page.evaluate(() => (window as unknown as { __sounds: Played[] }).__sounds);

async function upload(page: Page, target: string, name?: string) {
  await page.locator("#sound-file").setInputFiles({ name: "sound.wav", mimeType: "audio/wav", buffer: wav() });
  await page.getByLabel("Куда").selectOption({ label: target });
  if (name) await page.getByLabel("Название кнопки").fill(name);
  await page.getByRole("button", { name: "Загрузить", exact: true }).click();
  await expect(page.getByRole("button", { name: "Загрузить", exact: true })).toBeEnabled();
}

test("sound board: built-in + own sounds, auto sounds, works offline", async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ serviceWorkers: "allow" });
  await context.addInitScript(() => {
    const w = window as unknown as { __sounds: Played[] };
    w.__sounds = [];
    window.addEventListener("weekball:sound", (e) => w.__sounds.push((e as CustomEvent<Played>).detail));
  });
  const organizer = await context.newPage();
  const invite = await createGroup(organizer, unique("Звуки"), "Организатор");
  await createGameTomorrow(organizer);
  await organizer.goto("/");
  await organizer.getByRole("button", { name: "Иду", exact: true }).click();
  await expect(organizer.getByText(/Записано\s*1\s*из\s*20/)).toBeVisible();

  const player = await (await browser.newContext()).newPage();
  await joinGroup(player, invite, unique("Игрок"));
  await player.goto("/");
  await player.getByRole("button", { name: "Иду", exact: true }).click();
  await expect(player.getByRole("button", { name: "Иду", exact: true })).toHaveAttribute("aria-pressed", "true");

  // --- Admin: own button + replace the whistle
  await organizer.goto("/admin");
  await organizer.getByRole("link", { name: "Звуки" }).click();
  await upload(organizer, "Новая кнопка", "Гол!");
  await expect(organizer.getByText("Гол!")).toBeVisible();
  await upload(organizer, "Заменить «Свисток»");
  await expect(organizer.getByText("свой файл")).toBeVisible();

  // --- Teams, 2-minute matches
  await organizer.goto("/");
  await organizer.locator('a[href^="/game/"]').first().click();
  await organizer.waitForURL(/\/game\/[0-9a-f-]{36}$/);
  const gameUrl = organizer.url();
  await organizer.getByRole("button", { name: "Изменить формат матча" }).click();
  await organizer.getByLabel("Длительность, мин").fill("2");
  await organizer.getByRole("button", { name: "Сохранить" }).click();
  await expect(organizer.getByText(/до 2 голов · 2 мин · автозвуки вкл/)).toBeVisible();
  await organizer.getByRole("link", { name: "Разделить на команды" }).click();
  await organizer.getByRole("button", { name: "2 команды" }).click();
  await organizer.getByRole("button", { name: "Собрать автоматически" }).click();
  await expect(organizer.getByText("Не распределены · 0")).toBeVisible();

  // --- Panel on the live screen
  await organizer.goto(`${gameUrl}/live`);
  await organizer.getByRole("button", { name: "Создать матч" }).click();
  const panel = organizer.getByRole("region", { name: "Звуки" });
  for (const label of ["Минута!", "До аута!", "Свисток", "Финальный свисток", "Гол!"]) {
    await expect(panel.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  const box = await panel.getByRole("button", { name: "Свисток", exact: true }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(64);
  await expect(panel.getByText("на телефоне")).toBeVisible(); // files cached

  await panel.getByRole("button", { name: "До аута!", exact: true }).click();
  await panel.getByRole("button", { name: "Свисток", exact: true }).click();
  await panel.getByRole("button", { name: "Гол!", exact: true }).click();
  expect((await played(organizer)).map((p) => `${p.key}:${p.source}`)).toEqual([
    "out:speech",
    "whistle:file", // replaced by our own file
    expect.stringMatching(/:file$/),
  ]);

  // Mute: the button still reacts, nothing is played.
  await organizer.getByRole("button", { name: "Выключить звук" }).click();
  await organizer.getByRole("button", { name: "Включить звук" }).click();

  // --- Auto "Минута!" one minute before the end
  await organizer.getByRole("button", { name: "Старт" }).click();
  await expect
    .poll(async () => (await played(organizer)).some((p) => p.key === "minute"), { timeout: 75_000 })
    .toBe(true);

  // --- Final whistle when the goal limit ends the match
  for (let i = 0; i < 2; i++) {
    await organizer.getByRole("button", { name: "⚽ Гол" }).first().click();
    await organizer.getByRole("dialog").getByRole("button").nth(1).click();
    await organizer.getByRole("dialog").getByRole("button", { name: "Без ассиста" }).click();
  }
  await expect(organizer.getByText(/Матч завершён · по лимиту голов/)).toBeVisible();
  await expect.poll(async () => (await played(organizer)).some((p) => p.key === "final")).toBe(true);
  await expect(organizer.getByText("Синхронизировано")).toBeVisible();

  // --- Offline: reopen the console without internet; own files come from the device.
  await organizer.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await organizer.reload();
  await expect(organizer.getByText(/Нет сети — показано последнее сохранённое состояние/)).toBeVisible();
  await organizer.getByRole("region", { name: "Звуки" }).getByRole("button", { name: "Гол!", exact: true }).click();
  await organizer.getByRole("region", { name: "Звуки" }).getByRole("button", { name: "Свисток", exact: true }).click();
  const offline = (await played(organizer)).slice(-2);
  expect(offline.map((p) => p.source)).toEqual(["file", "file"]);
  await context.setOffline(false);

  // Spectators have no sound panel.
  await player.goto(gameUrl);
  await expect(player.getByRole("region", { name: "Звуки" })).toHaveCount(0);
});
