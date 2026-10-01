// Local-only helper: creates N fake roster players (no accounts) in a group and signs them up for the next game.
//
//   npm run seed:players -- 18            # 18 players, first group, next game
//   npm run seed:players -- 18 ABCD2345   # a specific group by invite code
//   npm run seed:clean                    # delete every seeded player
//
// Needs SUPABASE_SERVICE_ROLE_KEY in .env.local. Refuses to run against a non-local
// Supabase unless SEED_ALLOW_REMOTE=1 is set explicitly (never do this on production).
import { createClient } from "@supabase/supabase-js";

const EMAIL_DOMAIN = "seed.weekball.test"; // accounts made by older versions of this script
const SUFFIX = " (тест)";

const NAMES = [
  "Азамат", "Бекзат", "Данияр", "Ерлан", "Жандос", "Ильяс", "Канат", "Марат",
  "Нурлан", "Олжас", "Руслан", "Санжар", "Тимур", "Улан", "Хасан", "Шынгыс",
  "Арман", "Бахыт", "Дамир", "Ержан", "Айдос", "Мирас", "Самат", "Талгат",
];
const LEVELS = [5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 4, 3, 2, 3, 5, 1];
const POSITIONS = [
  "gk", "fwd", "def", "mid", "fwd", "def", "mid", "mid", "def", "fwd", "gk", "def",
  "mid", null, "fwd", "def", "mid", "fwd", null, "mid", "def", "gk", "fwd", "mid",
] as const;

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) fail("Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env.local");

const host = new URL(url).hostname;
const isLocal = ["127.0.0.1", "localhost", "0.0.0.0"].includes(host);
if (!isLocal && process.env.SEED_ALLOW_REMOTE !== "1") {
  fail(`Отказ: ${host} — не локальный Supabase. Скрипт только для локальной разработки.`);
}
if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
  fail("Отказ: production-окружение.");
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function seed(count: number, inviteCode?: string) {
  if (!Number.isInteger(count) || count < 1 || count > NAMES.length) {
    fail(`Количество игроков — от 1 до ${NAMES.length}`);
  }

  const groupQuery = admin.from("groups").select("id, name").order("created_at").limit(1);
  const { data: groups, error: groupError } = inviteCode
    ? await admin.from("groups").select("id, name").eq("invite_code", inviteCode.toUpperCase())
    : await groupQuery;
  if (groupError) fail(groupError.message);
  const group = groups?.[0];
  if (!group) fail("Группа не найдена. Сначала создайте группу в приложении.");

  const { data: game, error: gameError } = await admin
    .from("games")
    .select("id, starts_at, max_players")
    .eq("group_id", group.id)
    .in("status", ["signup", "closed"])
    .gte("starts_at", new Date(Date.now() - 3 * 3600_000).toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  if (gameError) fail(gameError.message);
  if (!game) fail("Нет ближайшей игры. Создайте расписание или разовую игру.");

  const { count: goingNow } = await admin
    .from("signups")
    .select("*", { count: "exact", head: true })
    .eq("game_id", game.id)
    .eq("status", "going");
  let freeSpots = game.max_players - (goingNow ?? 0);

  console.log(`Группа «${group.name}», игра ${game.starts_at}, свободно мест: ${freeSpots}`);

  for (let i = 0; i < count; i++) {
    // Roster mode: players without an account (user_id = null), like names pasted into /roster.
    const name = `${NAMES[i]}${SUFFIX}`;
    const { data: created, error } = await admin
      .from("players")
      .insert({ name, level: LEVELS[i], position: POSITIONS[i], is_regular: true })
      .select("id")
      .single();
    if (error || !created) fail(`${name}: ${error?.message}`);
    const id = created.id;

    const steps = [
      admin.from("group_members").insert({ group_id: group.id, player_id: id, role: "player" }),
      admin.from("signups").insert({
        game_id: game.id,
        player_id: id,
        status: freeSpots > 0 ? "going" : "waitlist",
      }),
    ];
    for (const step of steps) {
      const { error: stepError } = await step;
      if (stepError) fail(`${name}: ${stepError.message}`);
    }
    console.log(`  + ${name}: уровень ${LEVELS[i]}, ${POSITIONS[i] ?? "без позиции"}, ${freeSpots > 0 ? "идёт" : "в очереди"}`);
    freeSpots--;
  }
  console.log(`✔ Добавлено ${count}. Удалить: npm run seed:clean`);
}

async function clean() {
  // Cascades: players -> group_members, signups, team_players.
  const { data: players, error: playersError } = await admin
    .from("players")
    .delete()
    .like("name", `%${SUFFIX}`)
    .is("user_id", null)
    .select("id");
  if (playersError) fail(playersError.message);
  let removed = players?.length ?? 0;

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(error.message);
    const seeded = data.users.filter((u) => u.email?.endsWith(`@${EMAIL_DOMAIN}`));
    for (const user of seeded) {
      // Legacy seeded accounts: their players were named with the suffix too.
      await admin.from("players").delete().eq("user_id", user.id);
      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
      if (deleteError) fail(deleteError.message);
      removed++;
    }
    if (data.users.length < 200) break;
    if (seeded.length) page--; // the page shifted after deletions
  }
  console.log(`✔ Удалено тестовых игроков: ${removed}`);
}

const [command, arg1, arg2] = process.argv.slice(2);
if (command === "seed") await seed(Number(arg1 ?? 18), arg2);
else if (command === "clean") await clean();
else fail("Команды: seed [кол-во] [код-приглашения] | clean");
