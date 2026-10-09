-- pgTAP: the organizer sets a player's all-time totals by hand.
begin;
select plan(13);

grant execute on function public.create_group(text, text), public.join_group(text, text, uuid),
  public.group_claimable_players(text) to authenticated, anon;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000008' || lpad(n::text, 2, '0'))::uuid;
$$;
-- goals, assists, wins, draws, losses of one player in the all-time table
create function pg_temp.row(gid uuid, pid uuid, since timestamptz default null)
returns table (goals int, assists int, wins int, draws int, losses int, matches int, adjusted boolean)
language sql as $$
  select l.goals, l.assists, l.wins, l.draws, l.losses, l.matches, l.adjusted
  from public.leaderboard(gid, since) l where l.player_id = pid;
$$;

insert into auth.users (id, email) select pg_temp.u(n), 's' || n || '@test.local' from generate_series(0, 4) n;
insert into public.players (id, user_id, name) select id, id, 'tmp' from auth.users where email like 's_@test.local';

set local role authenticated;
select pg_temp.login(pg_temp.u(0));
create temp table ctx as select * from public.create_group('Цифры', 'Орг');
create temp table ids (k text primary key, id uuid);
do $$
declare i int;
begin
  for i in 1..4 loop
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(i), 'role', 'authenticated')::text, true);
    perform public.join_group((select invite_code from ctx), 'P' || i);
  end loop;
end $$;

select pg_temp.login(pg_temp.u(0));
with x as (
  insert into public.games (group_id, starts_at, max_players, goal_limit)
  values ((select id from ctx), now() - interval '1 hour', 20, null) returning id
)
insert into ids select 'game', id from x;
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
insert into ids select 'm0', id from public.create_match(
  (select id from ids where k = 'game'), (select id from ids where k = 'A'), (select id from ids where k = 'B'));
select public.timer_start((select id from ids where k = 'm0'));
select public.add_event(jsonb_build_object('id', md5('s-g1')::uuid, 'match_id', (select id from ids where k = 'm0'),
  'type', 'goal', 'team_id', (select id from ids where k = 'A'), 'player_id', pg_temp.u(1), 'period', 1, 'second', 60));
select public.finish_match((select id from ids where k = 'm0'));  -- A 1:0 B
select public.finish_game((select id from ids where k = 'game'));

select results_eq(
  $$ select * from pg_temp.row((select id from ctx), pg_temp.u(1)) $$,
  $$ values (1, 0, 1, 0, 0, 1, false) $$,
  'before: what the matches give'
);

-- ------------------------------------------------------------ only the organizer
select pg_temp.login(pg_temp.u(1));
select throws_ok(
  $$ select public.set_player_stats((select id from ctx), pg_temp.u(1), 9, 0, 0, 9, 9, 0, 0) $$,
  '42501', 'not_organizer', 'a player cannot change the numbers'
);
select throws_ok(
  $$ insert into public.stat_adjustments (group_id, player_id, goals) values ((select id from ctx), pg_temp.u(1), 50) $$,
  '42501', null, 'nor write the corrections directly'
);

-- ------------------------------------------------------------ organizer sets the totals
select pg_temp.login(pg_temp.u(0));
select throws_ok(
  $$ select public.set_player_stats((select id from ctx), pg_temp.u(1), 1, 0, 0, -1, 0, 0, 0) $$,
  '22023', 'invalid_stats', 'negative numbers are refused'
);
select lives_ok(
  $$ select public.set_player_stats((select id from ctx), pg_temp.u(1), 6, 2, 1, 12, 5, 1, 0) $$,
  'the organizer sets the totals of a player'
);
select results_eq(
  $$ select * from pg_temp.row((select id from ctx), pg_temp.u(1)) $$,
  $$ values (12, 5, 6, 2, 1, 9, true) $$,
  'the table shows exactly the typed numbers (matches = W + D + L)'
);
select results_eq(
  $$ select win_pct, goals_per_match from public.leaderboard((select id from ctx)) where player_id = pg_temp.u(1) $$,
  $$ values (67, 1.33::numeric) $$,
  'percentages follow the new numbers'
);
select results_eq(
  $$ select * from pg_temp.row((select id from ctx), pg_temp.u(1), now() - interval '1 day') $$,
  $$ values (1, 0, 1, 0, 0, 1, false) $$,
  'a period ("last 10 games") shows the matches only'
);
select is(
  ((select public.player_profile((select id from ctx), pg_temp.u(1))) -> 'totals' ->> 'goals')::int,
  12,
  'the player profile shows the same numbers'
);

-- A player with no matches at all can get numbers too.
select public.set_player_stats((select id from ctx), pg_temp.u(0), 0, 0, 0, 3, 0, 0, 0);
select results_eq(
  $$ select goals, matches from public.leaderboard((select id from ctx)) where player_id = pg_temp.u(0) $$,
  $$ values (3, 0) $$,
  'numbers for a player without matches'
);

-- ------------------------------------------------------------ new events add on top; members can read
select public.add_event(jsonb_build_object('id', md5('s-g2')::uuid, 'match_id', (select id from ids where k = 'm0'),
  'type', 'goal', 'team_id', (select id from ids where k = 'A'), 'player_id', pg_temp.u(1), 'period', 1, 'second', 90,
  'correction', true));
select pg_temp.login(pg_temp.u(2));
select is(
  (select goals from public.leaderboard((select id from ctx)) where player_id = pg_temp.u(1)),
  13,
  'a later goal is added to the hand-set total, and every member sees it'
);

-- ------------------------------------------------------------ reset
select pg_temp.login(pg_temp.u(0));
select public.reset_player_stats((select id from ctx), pg_temp.u(1));
select results_eq(
  $$ select * from pg_temp.row((select id from ctx), pg_temp.u(1)) $$,
  $$ values (2, 0, 1, 0, 0, 1, false) $$,
  'reset: back to what the matches give'
);
-- Typing exactly what the matches give keeps no correction.
select public.set_player_stats((select id from ctx), pg_temp.u(1), 1, 0, 0, 2, 0, 0, 0);
reset role;
select is(
  (select count(*)::int from public.stat_adjustments where player_id = pg_temp.u(1)),
  0,
  'numbers equal to the matches are not stored as a correction'
);

select * from finish();
rollback;
