-- pgTAP: corrections after the whistle — adding events to a finished match / game.
begin;
select plan(15);

grant execute on function public.create_group(text, text), public.join_group(text, text, uuid),
  public.group_claimable_players(text) to authenticated, anon;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000007' || lpad(n::text, 2, '0'))::uuid;
$$;
-- An event as the console sends it; fix = true marks a correction of a finished match.
create function pg_temp.ev(k text, m uuid, kind text, team uuid, player uuid, assist uuid default null, fix boolean default true)
returns jsonb language sql as $$
  select jsonb_build_object('id', md5(k)::uuid, 'match_id', m, 'type', kind, 'team_id', team,
                            'player_id', player, 'assist_player_id', assist, 'period', 1, 'second', 200,
                            'correction', fix);
$$;

insert into auth.users (id, email) select pg_temp.u(n), 'c' || n || '@test.local' from generate_series(0, 4) n;
insert into public.players (id, user_id, name) select id, id, 'tmp' from auth.users where email like 'c_@test.local';

set local role authenticated;
select pg_temp.login(pg_temp.u(0));
create temp table ctx as select * from public.create_group('Правки', 'Орг');
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
  values ((select id from ctx), now() + interval '1 hour', 20, null) returning id
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
insert into ids select 'm1', id from public.create_match(
  (select id from ids where k = 'game'), (select id from ids where k = 'B'), (select id from ids where k = 'A'));

-- ------------------------------------------------------------ not started: nothing to correct
select throws_ok(
  $$ select public.add_event(pg_temp.ev('early', (select id from ids where k = 'm0'), 'goal',
       (select id from ids where k = 'A'), pg_temp.u(1))) $$,
  'P0001', 'match_not_live', 'no events for a match that has not started'
);

-- ------------------------------------------------------------ finished match, game still on
select public.timer_start((select id from ids where k = 'm0'));
select public.add_event(pg_temp.ev('g1', (select id from ids where k = 'm0'), 'goal', (select id from ids where k = 'A'), pg_temp.u(1)));
select public.finish_match((select id from ids where k = 'm0'));  -- A 1:0 B

select throws_ok(
  $$ select public.add_event(pg_temp.ev('stray', (select id from ids where k = 'm0'), 'goal',
       (select id from ids where k = 'B'), pg_temp.u(3), null, false)) $$,
  'P0001', 'match_not_live', 'a late goal from the queue (not marked as a correction) is still refused'
);
select lives_ok(
  $$ select public.add_event(pg_temp.ev('late', (select id from ids where k = 'm0'), 'goal',
       (select id from ids where k = 'B'), pg_temp.u(3), pg_temp.u(4))) $$,
  'a forgotten goal can be added to a finished match'
);
select results_eq(
  $$ select score_a::int, score_b::int, status::text from public.matches where id = (select id from ids where k = 'm0') $$,
  $$ values (1, 1, 'finished') $$,
  'the score is recomputed and the match stays finished'
);
select throws_ok(
  $$ select public.add_event(jsonb_build_object('id', md5('sub')::uuid, 'match_id', (select id from ids where k = 'm0'),
       'type', 'sub', 'team_id', (select id from ids where k = 'A'), 'player_id', pg_temp.u(1),
       'player_in_id', pg_temp.u(2), 'period', 1, 'second', 10, 'correction', true)) $$,
  '22023', 'invalid_event', 'substitutions are not corrections'
);
select throws_ok(
  $$ select public.add_event(pg_temp.ev('wrong', (select id from ids where k = 'm0'), 'goal',
       (select id from ids where k = 'A'), pg_temp.u(3))) $$,
  '22023', 'player_not_in_team', 'the player must belong to the team'
);

-- ------------------------------------------------------------ only the organizer
select pg_temp.login(pg_temp.u(1));
select throws_ok(
  $$ select public.add_event(pg_temp.ev('cheat', (select id from ids where k = 'm0'), 'goal',
       (select id from ids where k = 'A'), pg_temp.u(1))) $$,
  '42501', 'not_organizer', 'a player cannot correct a match'
);

-- ------------------------------------------------------------ finished game
select pg_temp.login(pg_temp.u(0));
select public.finish_game((select id from ids where k = 'game'));
reset role;
update public.games set stats_processed_at = now() where id = (select id from ids where k = 'game');
set local role authenticated;
select pg_temp.login(pg_temp.u(0));

select lives_ok(
  $$ select public.add_event(pg_temp.ev('after', (select id from ids where k = 'm0'), 'goal',
       (select id from ids where k = 'A'), pg_temp.u(2), pg_temp.u(1))) $$,
  'a goal can be added after the game has finished'
);
select results_eq(
  $$ select score_a::int, score_b::int from public.matches where id = (select id from ids where k = 'm0') $$,
  $$ values (2, 1) $$,
  'the result changes: 2:1'
);
select is(
  (select stats_processed_at from public.games where id = (select id from ids where k = 'game')),
  null,
  'the statistics of the game are marked for recalculation'
);
select is(
  (select public.add_event(pg_temp.ev('after', (select id from ids where k = 'm0'), 'goal',
     (select id from ids where k = 'A'), pg_temp.u(2), pg_temp.u(1)))).id,
  md5('after')::uuid,
  'sending the same correction twice does not count it twice'
);
select results_eq(
  $$ select goals, assists from public.game_player_stats((select id from ids where k = 'game'))
     where player_id = pg_temp.u(2) $$,
  $$ values (1, 0) $$,
  'the scorer gets the goal in the game table'
);
select results_eq(
  $$ select goals, assists from public.game_player_stats((select id from ids where k = 'game'))
     where player_id = pg_temp.u(1) $$,
  $$ values (1, 1) $$,
  'and the assist goes to the passer'
);
select lives_ok(
  $$ select public.add_event(pg_temp.ev('card', (select id from ids where k = 'm0'), 'yellow',
       (select id from ids where k = 'B'), pg_temp.u(4))) $$,
  'a card can be added afterwards too'
);
select is(
  (select count(*)::int from public.matches where game_id = (select id from ids where k = 'game')),
  1,
  'the match that never started was removed with the game and stays out of reach'
);

reset role;
select * from finish();
rollback;
