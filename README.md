# Weekly Football ⚽

Приложение (PWA) для нашей еженедельной игры в футбол: 15–20 человек, обычно суббота 19:00,
общение в WhatsApp.

- Игроки отмечаются «Иду / Не иду», есть лист ожидания, «Опаздываю / Я на месте».
- Организатор за пару минут делит записавшихся на команды (авто, драфт, вручную),
  докидывает опоздавших одним тапом.
- Матч ведётся с телефона: таймер, голы в 2 тапа, карточки, работает без интернета.
- Зрители видят счёт в реальном времени, гости — по публичной ссылке.
- Статистика, рейтинг, история игр копятся сами.

Руководство для игроков и организатора — [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md).
Контекст для разработки и принятые решения — [`CLAUDE.md`](CLAUDE.md).

**Стек:** Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS 4 · shadcn/ui (Base UI) ·
dnd-kit · Supabase (Postgres, Auth, Realtime, RLS) · Serwist (service worker) · Vercel.

---

## Переменные окружения

| Переменная | Где взять | В браузере |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | да |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | там же: anon / publishable key | да |
| `NEXT_PUBLIC_SITE_URL` | адрес сайта без `/` в конце (`http://localhost:3000` или `https://<app>.vercel.app`) | да |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` / secret key | **нет** |
| `CRON_SECRET` | любая длинная случайная строка (`openssl rand -hex 32`) | **нет** |
| `ADMIN_PIN` | PIN-код организатора: придумать самим, лучше 6+ цифр. Вводится в приложении в «Профиль → Стать организатором» | **нет** |

`SUPABASE_SERVICE_ROLE_KEY` обходит RLS. Используется только на сервере: cron-задачи и превью ссылок.
Никогда не давать ему префикс `NEXT_PUBLIC_`. CI проверяет, что он не попал в клиентский бандл.

Шаблон — `.env.example`. Локальные значения — в `.env.local` (в git не попадает).

## Локальный запуск

Нужны Node 24 и Docker Desktop.

```bash
npm install
npx supabase start               # локальный Supabase; миграции применятся сами
npx supabase status -o env       # API_URL, ANON_KEY, SERVICE_ROLE_KEY → в .env.local
npm run dev                      # http://localhost:3000
```

Тестовые игроки (только для локального Supabase):

```bash
npm run seed:players -- 18            # 18 игроков с уровнями/позициями → на ближайшую игру
npm run seed:clean                    # удалить всех тестовых игроков
```

Service worker работает только в production-сборке: `npm run build && npm run start`.

## Тесты

| Команда | Что проверяет | Где запускать |
| --- | --- | --- |
| `npm test` | Vitest: деление на команды, рейтинг (Elo), `playerStrength`, таймер, счёт и таблица, офлайн-очередь | везде, CI |
| `npm run lint`, `npm run typecheck` | ESLint, TypeScript (включая service worker) | везде, CI |
| `npx supabase test db` | pgTAP: RLS на всех таблицах, права игрока/организатора, запись и лист ожидания, триггер счёта (гол, автогол, аннулирование), `game_standings`, представления статистики | локально (нужен `supabase start`) |
| `npm run test:e2e` | Playwright: вход по ссылке и запись; сборка и публикация команд; матч целиком (включая гол без сети); повторное открытие консоли матча без сети (PWA) | локально: `supabase start` + `npm run build && npm run start` |

CI (GitHub Actions, `.github/workflows/ci.yml`) на каждый push и pull request:
`lint`, `typecheck`, `npm test`, `build` и проверка, что ключ service role не попал в клиентский код.

## Деплой

### 1. Supabase (один раз)

1. Создать проект на supabase.com.
2. Применить миграции:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
3. **Authentication → Sign In / Providers:** включить **Allow anonymous sign-ins** —
   это единственный способ входа (человек вводит имя, устройство запоминается). Google не нужен.
4. **Authentication → URL Configuration:** Site URL = адрес продакшена.

### 2. Vercel

1. Импортировать репозиторий GitHub (фреймворк Next.js определится сам).
2. **Settings → Environment Variables:** все 6 переменных из таблицы выше.
3. Deploy. Каждый push в `main` деплоится автоматически.

## Cron-задачи (`vercel.json`)

| Путь | Когда (UTC) | Что делает |
| --- | --- | --- |
| `GET /api/cron/create-next` | `0 3 * * *` (08:00 Алматы) | создаёт игры по активным расписаниям на 2 недели вперёд, без дублей |
| `GET /api/cron/recalc` | `30 3 * * *` | страховка: пересчитывает рейтинг для завершённых игр, которые ещё не обработаны |

Обе задачи защищены заголовком `Authorization: Bearer $CRON_SECRET` (Vercel добавляет его сам).
На тарифе Hobby cron запускается раз в сутки и без точного времени, поэтому ничего,
что зависит от точного времени, по cron не делается. Основной пересчёт статистики идёт сразу
по кнопке «Завершить игру» (`POST /api/games/<id>/finalize`).

Проверить вручную:

```bash
curl -i https://<app>.vercel.app/api/cron/create-next -H "Authorization: Bearer <CRON_SECRET>"
curl -i https://<app>.vercel.app/api/cron/recalc      -H "Authorization: Bearer <CRON_SECRET>"
# без заголовка — 401
```

## Чеклист первого запуска

1. Организатор открывает сайт, вводит имя, затем «Профиль → Стать организатором» и PIN-код
   (`ADMIN_PIN`). В «Админ» создаёт расписание («Суббота, 19:00, лимит 20»).
2. Отправить в чат WhatsApp ссылку на сайт или на игру (кнопка «Поделиться в WhatsApp»).
3. Игроки открывают ссылку с телефона, вводят имя и нажимают «Установить приложение»
   (на iPhone: «Поделиться» → «На экран „Домой“»). Групп и приглашений нет: все попадают в одну игру.
4. Организатор ставит игрокам уровни 1–5 в «Составе» — от этого зависит авто-деление.
   Тех, у кого нет телефона под рукой, можно добавить в «Состав» по имени; когда человек сам
   откроет сайт и введёт это же имя, его история сохранится.
5. Сменил телефон или очистил браузер: организатор в «Составе» открывает меню игрока →
   «Отвязать аккаунт», после этого человек снова входит под своим именем.
6. Провести пробную игру: разделить на команды, открыть «Вести матч», записать пару голов,
   «Завершить игру» → проверить статистику и рейтинг в разделе «Статистика».
7. Проверить на телефоне организатора работу без сети: открыть страницу матча, включить режим
   полёта, записать гол, вернуть сеть — «Синхронизировано».

## Структура

```
src/app/(app)/        страницы приложения (layout с сессией, шапкой и навигацией)
src/app/(shell)/      статические офлайн-страницы (кэшируются service worker'ом)
src/app/api/          cron и служебные роуты
src/components/       UI (ui/ — shadcn)
src/lib/teams/        деление на команды, сила игрока, палитра
src/lib/match/        таймер, счёт, офлайн-очередь, Realtime-хуки
src/lib/rating/       Elo и пересчёт истории
src/sw.ts             service worker (Serwist)
supabase/migrations/  SQL-миграции — единственный способ менять схему
supabase/tests/       pgTAP-тесты
e2e/                  Playwright
```
