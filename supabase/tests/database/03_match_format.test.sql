-- pgTAP: match format (goal limit + minutes), auto-finish, undo of the winning goal.
begin;
select plan(19);

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid;
$$;

insert into auth.users (id, email) select pg_temp.u(n), 'f' || n || '@test.local' from generate_series(0, 4) n;
-- Roster mode: players.id is independent of auth.uid(); these tests keep them equal for readability.
insert into public.players (id, user_id, name) select id, id, 'tmp' from auth.users where email like '%@test.local';

set local role authenticated;
select pg_temp.login(pg_temp.u(0));
create temp table ctx as select * from public.create_group('Формат', 'Орг');
create temp table ids (k text primary key, id uuid);

do $$
declare i int;
begin
  for i in 1..4 loop
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(i), 'role', 'authenticated')::text, true);
    perform public.join_group((select invite_code from ctx), 'P' || i);
  end loop;
end $$;

-- ------------------------------------------------------------ schedule -> game format
select pg_temp.login(pg_temp.u(0));
insert into public.schedules (group_id, weekday, start_time, goal_limit, match_minutes)
values ((select id from ctx), 6, '19:00', 3, 9);
select results_eq(
  $$ select distinct goal_limit, match_minutes from public.games where group_id = (select id from ctx) $$,
  $$ values (3, 9) $$,
  'games generated from a schedule copy its goal limit and minutes'
);
-- a one-off game with the default format
with x as (
  insert into public.games (group_id, starts_at, max_players)
  values ((select id from ctx), now() + interval '1 hour', 20) returning id
)
insert into ids select 'game', id from x;
select results_eq(
  $$ select goal_limit, match_minutes from public.games where id = (select id from ids where k = 'game') $$,
  $$ values (2, 7) $$,
  'defaults: 2 goals, 7 minutes'
);

do $$
declare i int;
begin
  for i in 1..4 loop
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(i), 'role', 'authenticated')::text, true);
    perform public.set_signup((select id from ids where k = 'game'), true);
  end loop;
end $$;

select pg_temp.login(pg_temp.u(0));
insert into ids select 'A', id from public.create_team((select id from ids where k = 'game'), 'Красные', '#e53935');
insert into ids select 'B', id from public.create_team((select id from ids where k = 'game'), 'Синие', '#1e88e5');
select public.apply_assignments((select id from ids where k = 'game'), jsonb_build_array(
  jsonb_build_object('player_id', pg_temp.u(1), 'team_id', (select id from ids where k = 'A')),
  jsonb_build_object('player_id', pg_temp.u(2), 'team_id', (select id from ids where k = 'A')),
  jsonb_build_object('player_id', pg_temp.u(3), 'team_id', (select id from ids where k = 'B')),
  jsonb_build_object('player_id', pg_temp.u(4), 'team_id', (select id from ids where k = 'B'))
));

-- ------------------------------------------------------------ per-game format
select pg_temp.login(pg_temp.u(1));
select throws_ok(
  $$ select public.update_game_format((select id from ids where k = 'game'), 3, 10) $$,
  '42501', 'not_organizer', 'a player cannot change the game format'
);
select pg_temp.login(pg_temp.u(0));
insert into ids select 'm0', id from public.create_match(
  (select id from ids where k = 'game'), (select id from ids where k = 'A'), (select id from ids where k = 'B'));
select results_eq(
  $$ select goal_limit, periods::int, period_seconds from public.matches where id = (select id from ids where k = 'm0') $$,
  $$ values (2, 1, 420) $$,
  'a new match takes the game format: 1 period, 7 min, up to 2 goals'
);
select public.update_game_format((select id from ids where k = 'game'), 3, 5);
select results_eq(
  $$ select goal_limit, period_seconds from public.matches where id = (select id from ids where k = 'm0') $$,
  $$ values (3, 300) $$,
  'changing the game format updates not-yet-started matches'
);
select throws_ok(
  $$ select public.update_game_format((select id from ids where k = 'game'), 0, 5) $$,
  '22023', 'invalid_match_settings', 'goal limit must be 1..20 or null'
);
select public.update_game_format((select id from ids where k = 'game'), 2, 7);

-- ------------------------------------------------------------ goal limit auto-finish
create function pg_temp.goal(k text, team text, player int, typ text default 'goal') returns void language sql as $$
  select null::void from (select public.add_event(jsonb_build_object(
    'id', md5(k)::uuid, 'match_id', (select id from ids where ids.k = 'm0'), 'type', typ,
    'team_id', (select id from ids where ids.k = team), 'player_id', pg_temp.u(player),
    'period', 1, 'second', 200))) x;
$$;

select public.timer_start((select id from ids where k = 'm0'));
select pg_temp.goal('a1', 'A', 1);
select is((select status::text from public.matches where id = (select id from ids where k = 'm0')), 'live', '1:0 — still live');
select pg_temp.goal('b1', 'B', 3, 'own_goal');   -- own goal by B -> 2:0 for A
select results_eq(
  $$ select status::text, timer_status::text, score_a::int, score_b::int, finish_reason, timer_elapsed_ms::int
     from public.matches where id = (select id from ids where k = 'm0') $$,
  $$ values ('finished'::text, 'finished'::text, 2, 0, 'goal_limit'::text, 200000) $$,
  'reaching the limit (own goals count too) finishes the match at the minute of the goal'
);
select is(
  (select finish_event_id from public.matches where id = (select id from ids where k = 'm0')),
  md5('b1')::uuid, 'the winning event is remembered'
);
select throws_ok($$ select pg_temp.goal('late', 'B', 4) $$, 'P0001', 'match_not_live', 'no events after the auto-finish');
select pg_temp.goal('b1', 'B', 3, 'own_goal');
select is(
  (select count(*)::int from public.events where id = md5('b1')::uuid), 1,
  'resending the winning goal (offline queue) is idempotent'
);

-- ------------------------------------------------------------ undo the winning goal
select public.void_event(md5('b1')::uuid);
select results_eq(
  $$ select status::text, timer_status::text, score_a::int, finish_reason, finish_event_id
     from public.matches where id = (select id from ids where k = 'm0') $$,
  $$ values ('live'::text, 'running'::text, 1, null::text, null::uuid) $$,
  'voiding the winning goal reopens the match and the clock runs again'
);
select is(
  (select timer_elapsed_ms::int from public.matches where id = (select id from ids where k = 'm0')),
  200000, 'the clock continues from the minute of the voided goal'
);
select pg_temp.goal('a2', 'A', 2);
select is((select status::text from public.matches where id = (select id from ids where k = 'm0')), 'finished', 'a new winning goal finishes it again');
select public.void_event(md5('a1')::uuid);
select is(
  (select status::text from public.matches where id = (select id from ids where k = 'm0')), 'finished',
  'voiding an earlier (not winning) goal does not reopen the match'
);
select results_eq(
  $$ select score_a::int, score_b::int from public.matches where id = (select id from ids where k = 'm0') $$,
  $$ values (1, 0) $$, 'but the score is recalculated'
);

-- ------------------------------------------------------------ time / manual finish, standings
insert into ids select 'm1', id from public.create_match(
  (select id from ids where k = 'game'), (select id from ids where k = 'A'), (select id from ids where k = 'B'));
select public.timer_start((select id from ids where k = 'm1'), now() - interval '7 minutes');
select public.finish_match((select id from ids where k = 'm1'), now() - interval '1 second' * 0, 'time');
select results_eq(
  $$ select status::text, finish_reason, score_a::int, score_b::int from public.matches where id = (select id from ids where k = 'm1') $$,
  $$ values ('finished'::text, 'time'::text, 0, 0) $$,
  'time runs out at 0:0 — finished as a draw'
);
insert into ids select 'm2', id from public.create_match(
  (select id from ids where k = 'game'), (select id from ids where k = 'A'), (select id from ids where k = 'B'));
select public.timer_start((select id from ids where k = 'm2'));
select throws_ok(
  $$ select public.finish_match((select id from ids where k = 'm2'), null, 'whatever') $$,
  '22023', 'invalid_match_settings', 'finish reason is validated'
);
select results_eq(
  $$ select name, played, won, drawn, lost, points from public.game_standings((select id from ids where k = 'game')) $$,
  $$ values ('Красные'::text, 2, 1, 1, 0, 4), ('Синие'::text, 2, 0, 1, 1, 1) $$,
  'auto-finished matches count in the standings (win + draw)'
);

reset role;
select * from finish();
rollback;
