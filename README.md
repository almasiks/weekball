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
2. В **Settings → Environment Variables** задать `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (адрес продакшена без `/` в конце).
3. Задеплоить. После первого деплоя проверить, что адрес Vercel добавлен в Redirect URLs Supabase.

## Структура

```
src/app/            страницы и роуты (App Router)
src/components/     UI-компоненты (ui/ — shadcn)
src/lib/supabase/   клиенты Supabase (browser, server, middleware) и типы БД
src/lib/actions/    server actions (группы, вход)
src/proxy.ts        обновление сессии Supabase на каждом запросе (бывший middleware)
supabase/migrations SQL-миграции — единственный способ менять схему
```
