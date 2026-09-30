# Weekly Football

PWA для еженедельной игры в футбол: запись на игру, деление на команды, live-счёт и статистика.
Полное ТЗ — `docs/TZ.md`, контекст для разработки — `CLAUDE.md`.

Стек: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Supabase (Postgres, Auth, RLS) · Vercel.

## Локальный запуск

```bash
npm install
cp .env.example .env.local   # заполнить значения из Supabase
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push         # применить миграции из supabase/migrations
npm run dev                  # http://localhost:3000
```

Проверки перед коммитом:

```bash
npm run lint && npm run typecheck && npm run build
```

## Настройка Supabase (один раз)

1. **Authentication → Sign In / Providers**
   - включить **Allow anonymous sign-ins**;
   - включить **Allow manual linking** (нужно для привязки Google к анонимному профилю);
   - включить провайдер **Google**, вставить Client ID и Client Secret из Google Cloud.
2. **Authentication → URL Configuration**
   - Site URL: адрес продакшена (`https://<app>.vercel.app`);
   - Redirect URLs: `http://localhost:3000/auth/callback`, `https://<app>.vercel.app/auth/callback`.
3. В Google Cloud (OAuth client, тип Web application) в **Authorized redirect URIs** добавить
   `https://<project-ref>.supabase.co/auth/v1/callback`.

## Деплой на Vercel

1. Импортировать репозиторий GitHub в Vercel (фреймворк определится как Next.js).
2. В **Settings → Environment Variables** задать:

   | Переменная | Где взять | Видна в браузере |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | да |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | там же, anon / publishable key | да |
   | `NEXT_PUBLIC_SITE_URL` | адрес продакшена без `/` в конце | да |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` (secret) | **нет**, только сервер |
   | `CRON_SECRET` | любая длинная случайная строка, например `openssl rand -hex 32` | **нет** |

   `SUPABASE_SERVICE_ROLE_KEY` обходит RLS — используется только в `/api/cron/create-next`
   и для превью ссылок. Никогда не добавлять ему префикс `NEXT_PUBLIC_`.
3. Задеплоить. После первого деплоя проверить, что адрес Vercel добавлен в Redirect URLs Supabase.

## Cron: создание игр по расписанию

`vercel.json` запускает `GET /api/cron/create-next` раз в сутки (`0 3 * * *` UTC = 08:00 в Алматы).
Vercel сам добавляет заголовок `Authorization: Bearer $CRON_SECRET`. Задача создаёт игры
по всем активным расписаниям на 2 недели вперёд; повторный запуск дублей не создаёт.
На тарифе Hobby cron работает не чаще раза в сутки и с точностью до часа, поэтому по нему
делается только создание игр. Закрытие записи и отмена — вручную организатором.

Проверить вручную:

```bash
curl -i https://<app>.vercel.app/api/cron/create-next -H "Authorization: Bearer <CRON_SECRET>"
# 200 {"created":N,"daysAhead":14}; без заголовка — 401
```

## Структура

```
src/app/            страницы и роуты (App Router)
src/components/     UI-компоненты (ui/ — shadcn)
src/lib/supabase/   клиенты Supabase (browser, server, middleware) и типы БД
src/lib/actions/    server actions (группы, вход)
src/proxy.ts        обновление сессии Supabase на каждом запросе (бывший middleware)
supabase/migrations SQL-миграции — единственный способ менять схему
```
