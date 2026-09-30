-- pgTAP: score trigger (goal, own goal, void), game_standings, statistics views.
begin;
select plan(17);

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email)
select ('00000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid, 'u' || n || '@test.local'
from generate_series(0, 9) n;

set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-000000000200');
create temp table ctx as select * from public.create_group('Лига', 'Орг');
create temp table ids (k text primary key, id uuid);

-- 9 players, 3 teams of 3 (players 01..09)
do $$
declare i int;
begin
  for i in 1..9 loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', ('00000000-0000-4000-8000-0000000002' || lpad(i::text, 2, '0')), 'role', 'authenticated')::text, true);
    perform public.join_group((select invite_code from ctx), 'P' || i);
  end loop;
end $$;

select pg_temp.login('00000000-0000-4000-8000-000000000200');
with x as (
  insert into public.games (group_id, starts_at, max_players)
  values ((select id from ctx), now() + interval '1 hour', 20) returning id
)
insert into ids select 'game', id from x;

do $$
declare i int;
begin
  for i in 1..9 loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', ('00000000-0000-4000-8000-0000000002' || lpad(i::text, 2, '0')), 'role', 'authenticated')::text, true);
    perform public.set_signup((select id from ids where k = 'game'), true);
  end loop;
end $$;

select pg_temp.login('00000000-0000-4000-8000-000000000200');
insert into ids select 'A', id from public.create_team((select id from ids where k = 'game'), 'Красные', '#e53935');
insert into ids select 'B', id from public.create_team((select id from ids where k = 'game'), 'Синие', '#1e88e5');
insert into ids select 'C', id from public.create_team((select id from ids where k = 'game'), 'Зелёные', '#43a047');
select public.apply_assignments(
  (select id from ids where k = 'game'),
  (select jsonb_agg(jsonb_build_object(
     'player_id', ('00000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid,
     'team_id', (select id from ids where k = case when n <= 3 then 'A' when n <= 6 then 'B' else 'C' end)))
   from generate_series(1, 9) n)
);

select is(
  (select count(*)::int from public.generate_round_robin((select id from ids where k = 'game'), 1, 300)),
  3,
  'round robin: 3 teams -> 3 matches'
);
insert into ids select 'm' || sort_order, id from public.matches where game_id = (select id from ids where k = 'game');

create function pg_temp.ev(k text, match text, t text, team text, player int, assist int default null) returns void
language sql as $$
  select null::void from (select public.add_event(jsonb_build_object(
    'id', md5(k)::uuid,
    'match_id', (select id from ids where ids.k = match),
    'type', t,
    'team_id', (select id from ids where ids.k = team),
    'player_id', ('00000000-0000-4000-8000-0000000002' || lpad(player::text, 2, '0'))::uuid,
    'assist_player_id', case when assist is null then null
      else ('00000000-0000-4000-8000-0000000002' || lpad(assist::text, 2, '0'))::uuid end,
    'period', 1, 'second', 60))) x;
$$;

-- Match 0: A vs B
select public.timer_start((select id from ids where k = 'm0'));
select pg_temp.ev('g1', 'm0', 'goal', 'A', 1, 2);
select results_eq(
  $$ select score_a::int, score_b::int from public.matches where id = (select id from ids where k = 'm0') $$,
  $$ values (1, 0) $$, 'goal counts for the scorer''s team'
);
select pg_temp.ev('g1', 'm0', 'goal', 'A', 1, 2);
select is((select count(*)::int from public.events where id = md5('g1')::uuid), 1, 'resending an event id does not duplicate it');
select pg_temp.ev('og', 'm0', 'own_goal', 'B', 4);
select results_eq(
  $$ select score_a::int, score_b::int from public.matches where id = (select id from ids where k = 'm0') $$,
  $$ values (2, 0) $$, 'own goal counts for the opponent'
);
select pg_temp.ev('g2', 'm0', 'goal', 'B', 5);
select pg_temp.ev('g3', 'm0', 'goal', 'B', 5);
select results_eq(
  $$ select score_a::int, score_b::int from public.matches where id = (select id from ids where k = 'm0') $$,
  $$ values (2, 2) $$, 'score 2:2'
);
select public.void_event(md5('g3')::uuid);
select results_eq(
  $$ select score_a::int, score_b::int from public.matches where id = (select id from ids where k = 'm0') $$,
  $$ values (2, 1) $$, 'voiding a goal recalculates the score'
);
select isnt((select voided_at from public.events where id = md5('g3')::uuid), null, 'voided event stays with voided_at');
select throws_ok(
  $$ select pg_temp.ev('bad', 'm0', 'goal', 'A', 4) $$,
  '22023', 'player_not_in_team', 'scorer must belong to the team'
);
select throws_ok(
  $$ select pg_temp.ev('bad2', 'm0', 'goal', 'A', 1, 4) $$,
  '22023', 'invalid_assist', 'assist must come from the same team'
);
select public.finish_match((select id from ids where k = 'm0'));  -- A 2:1 B

-- Match 1: A vs C 0:0 ; Match 2: B vs C 3:0
select public.timer_start((select id from ids where k = 'm1'));
select public.finish_match((select id from ids where k = 'm1'));
select public.timer_start((select id from ids where k = 'm2'));
select pg_temp.ev('c1', 'm2', 'goal', 'B', 6);
select pg_temp.ev('c2', 'm2', 'goal', 'B', 6);
select pg_temp.ev('c3', 'm2', 'goal', 'B', 5);
select pg_temp.ev('y1', 'm2', 'yellow', 'C', 7);
select public.finish_match((select id from ids where k = 'm2'));

-- --------------------------------------------------------------- standings
select pg_temp.login('00000000-0000-4000-8000-000000000209');
select results_eq(
  $$ select name, played, won, drawn, lost, goals_for, goals_against, points
     from public.game_standings((select id from ids where k = 'game')) $$,
  $$ values ('Красные'::text, 2, 1, 1, 0, 2, 1, 4),
            ('Синие'::text, 2, 1, 0, 1, 4, 2, 3),
            ('Зелёные'::text, 2, 0, 1, 1, 0, 3, 1) $$,
  'game_standings: 3/1/0 points, sorted by points'
);

-- --------------------------------------------------------------- statistics views
select results_eq(
  $$ select result, goals, assists from public.player_match_stats
     where player_id = '00000000-0000-4000-8000-000000000201' order by sort_order $$,
  $$ values ('W'::text, 1, 0), ('D'::text, 0, 0) $$,
  'player_match_stats: results and goals per match'
);
select is(
  (select assists from public.player_match_stats
   where player_id = '00000000-0000-4000-8000-000000000202' and match_id = (select id from ids where k = 'm0')),
  1, 'assists are credited'
);
select is(
  (select own_goals from public.player_match_stats
   where player_id = '00000000-0000-4000-8000-000000000204' and match_id = (select id from ids where k = 'm0')),
  1, 'own goals are tracked separately'
);
select is(
  (select goals from public.player_match_stats
   where player_id = '00000000-0000-4000-8000-000000000205' and match_id = (select id from ids where k = 'm0')),
  1, 'voided goal is excluded from stats'
);

select pg_temp.login('00000000-0000-4000-8000-000000000200');
select public.finish_game((select id from ids where k = 'game'));
select pg_temp.login('00000000-0000-4000-8000-000000000209');
select results_eq(
  $$ select goals, matches, wins, draws, losses, yellows, form
     from public.leaderboard((select id from ctx)) where player_id = '00000000-0000-4000-8000-000000000206' $$,
  $$ values (2, 2, 1, 0, 1, 0, 'LW'::text) $$,
  'leaderboard: totals and form (oldest -> newest)'
);
select is(
  (select attendance_pct from public.leaderboard((select id from ctx))
   where player_id = '00000000-0000-4000-8000-000000000201'),
  100, 'attendance 100% for a player who played the only finished game'
);

-- outsider (never joined) sees nothing through the views
select pg_temp.login('00000000-0000-4000-8000-000000000299');
select is((select count(*)::int from public.player_match_stats), 0, 'views respect RLS (security_invoker)');

reset role;
select * from finish();
rollback;
