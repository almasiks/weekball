-- pgTAP: RLS audit, organizer/player permissions, signups and the waitlist.
-- Run: npx supabase test db   (local stack must be running)
begin;
select plan(20);

-- --------------------------------------------------------------- helpers
create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000101', 'org@test.local'),
  ('00000000-0000-4000-8000-000000000102', 'p1@test.local'),
  ('00000000-0000-4000-8000-000000000103', 'p2@test.local'),
  ('00000000-0000-4000-8000-000000000104', 'p3@test.local'),
  ('00000000-0000-4000-8000-000000000199', 'outsider@test.local');
-- Roster mode: players.id is independent of auth.uid(); these tests keep them equal for readability.
insert into public.players (id, user_id, name) select id, id, 'tmp' from auth.users where email like '%@test.local';

-- --------------------------------------------------------------- RLS audit
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'every table in public has RLS enabled'
);
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce(c.reloptions @> array['security_invoker=true'], false)),
  0,
  'every view in public is security_invoker'
);

-- --------------------------------------------------------------- setup as users
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-000000000101');
create temp table ctx as select * from public.create_group('Суббота', 'Организатор');
grant all on ctx to authenticated;

select pg_temp.login('00000000-0000-4000-8000-000000000102');
select public.join_group((select invite_code from ctx), 'Игрок 1');
select pg_temp.login('00000000-0000-4000-8000-000000000103');
select public.join_group((select invite_code from ctx), 'Игрок 2');
select pg_temp.login('00000000-0000-4000-8000-000000000104');
select public.join_group((select invite_code from ctx), 'Игрок 3');
select pg_temp.login('00000000-0000-4000-8000-000000000199');
select public.create_group('Чужая', 'Чужой');

-- organizer creates a game with a limit of 2
select pg_temp.login('00000000-0000-4000-8000-000000000101');
create temp table g (id uuid);
with x as (
  insert into public.games (group_id, starts_at, max_players)
  values ((select id from ctx), now() + interval '1 day', 2) returning id
)
insert into g select id from x;

-- --------------------------------------------------------------- permissions
select pg_temp.login('00000000-0000-4000-8000-000000000102');
select throws_ok(
  $$ insert into public.games (group_id, starts_at) values ((select id from ctx), now() + interval '2 days') $$,
  '42501', null, 'a player cannot create games (RLS)'
);
select throws_ok(
  $$ select public.set_game_status((select id from g), 'closed') $$,
  '42501', 'not_organizer', 'a player cannot change the game status'
);
select throws_ok(
  $$ update public.players set rating = 3000 where id = '00000000-0000-4000-8000-000000000102' $$,
  '42501', null, 'a player cannot change their own rating'
);
select throws_ok(
  $$ insert into public.signups (game_id, player_id, status) values ((select id from g), '00000000-0000-4000-8000-000000000102', 'going') $$,
  '42501', null, 'direct inserts into signups are denied'
);
select throws_ok(
  $$ select public.create_team((select id from g), 'X', '#e53935') $$,
  '42501', 'not_organizer', 'a player cannot create teams'
);

-- --------------------------------------------------------------- signups + waitlist
select is(public.set_signup((select id from g), true)::text, 'going', 'player 1 -> going');
select pg_temp.login('00000000-0000-4000-8000-000000000103');
select is(public.set_signup((select id from g), true)::text, 'going', 'player 2 -> going');
select pg_temp.login('00000000-0000-4000-8000-000000000104');
select is(public.set_signup((select id from g), true)::text, 'waitlist', 'player 3 -> waitlist (limit 2)');
select is(public.set_signup((select id from g), true)::text, 'waitlist', 'repeating "Иду" keeps the waitlist place');

select pg_temp.login('00000000-0000-4000-8000-000000000102');
select is(public.set_signup((select id from g), false)::text, 'declined', 'player 1 declines');
select is(
  (select status::text from public.signups where game_id = (select id from g) and player_id = '00000000-0000-4000-8000-000000000104'),
  'going',
  'first in the waitlist is promoted automatically'
);
select is(
  (select count(*)::int from public.signups where game_id = (select id from g) and status = 'going'),
  2,
  'going never exceeds the limit'
);

-- the limit is guarded by a row lock on the game (serializes concurrent calls)
select ok(
  pg_get_functiondef('public.set_signup(uuid, boolean)'::regprocedure) ilike '%for update%',
  'set_signup locks the game row (for update)'
);

-- closed signup
select pg_temp.login('00000000-0000-4000-8000-000000000101');
select public.set_game_status((select id from g), 'closed');
select pg_temp.login('00000000-0000-4000-8000-000000000102');
select throws_ok(
  $$ select public.set_signup((select id from g), true) $$,
  'P0001', 'signup_closed', 'no signups when the organizer closed the list'
);

-- --------------------------------------------------------------- isolation
select pg_temp.login('00000000-0000-4000-8000-000000000199');
select is((select count(*)::int from public.games where id = (select id from g)), 0, 'outsider does not see the game');
select is((select count(*)::int from public.signups where game_id = (select id from g)), 0, 'outsider does not see signups');
select is(
  (select count(*)::int from public.players where id = '00000000-0000-4000-8000-000000000102'),
  0,
  'outsider does not see player profiles'
);
select throws_ok(
  $$ select public.set_signup((select id from g), true) $$,
  'P0002', 'game_not_found', 'outsider cannot sign up'
);

reset role;
select * from finish();
rollback;
