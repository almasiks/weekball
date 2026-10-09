-- pgTAP: roster mode — players without accounts, claim, merge, attendance,
-- quick add, reset / delete game, per-game stats, MVP.
-- Here players.id is NOT the user id (the real flow).
begin;
select plan(49);

-- Groups are no longer created from the app (single-group mode); the tests still use
-- separate groups to check isolation, so the functions are opened inside this transaction.
grant execute on function public.create_group(text, text), public.join_group(text, text, uuid),
  public.group_claimable_players(text) to authenticated, anon;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000005' || lpad(n::text, 2, '0'))::uuid;
$$;
create function pg_temp.pid(n text) returns uuid language sql security definer as $$
  select p.id from public.players p
  join public.group_members m on m.player_id = p.id
  join public.groups g on g.id = m.group_id and g.name = 'Состав'
  where p.name = n;
$$;

create function pg_temp.any_pid(n text) returns uuid language sql security definer as $$
  select id from public.players where name = n limit 1;
$$;

insert into auth.users (id, email) select pg_temp.u(n), 'r' || n || '@roster.local' from generate_series(0, 3) n;

set local role authenticated;
-- ------------------------------------------------------------ organizer, roster of 20 names
select pg_temp.login(pg_temp.u(0));
create temp table ctx as select * from public.create_group('Состав', 'Орг');
select isnt(
  (select id from public.players where user_id = pg_temp.u(0)), pg_temp.u(0),
  'a new account gets its own player id (not auth.uid())'
);

select is(
  (select count(*)::int from public.add_players((select id from ctx), array[
    'Азамат', 'Бекзат', 'Данияр', 'Ерлан', 'Жандос', 'Ильяс', 'Канат', 'Марат', 'Нурлан', 'Олжас',
    'Руслан', 'Санжар', 'Тимур', 'Улан', 'Хасан', 'Шынгыс', 'Арман', ' Бахыт ', 'Дамир', 'Ержан', '   '])),
  20, 'organizer adds 20 names at once (blank lines skipped)'
);
select is(pg_temp.pid('Бахыт') is not null, true, 'names are trimmed');
select is((select count(*)::int from public.group_members where group_id = (select id from ctx)), 21, 'all of them are members');
select is(
  (select count(*)::int from public.players where user_id is null and name = 'Азамат'), 1,
  'roster players have no account'
);

-- ------------------------------------------------------------ claim ("Это я") keeps history
select pg_temp.login(pg_temp.u(1));
select is(
  (select count(*)::int from public.group_claimable_players((select invite_code from ctx))), 20,
  'the invite page lists unclaimed names'
);
create temp table azamat as select pg_temp.pid('Азамат') as id;
select public.join_group((select invite_code from ctx), '', (select id from azamat));
select is(
  (select user_id from public.players where id = (select id from azamat)), pg_temp.u(1),
  '"Это я" links the account to the existing player'
);
select is(
  (select count(*)::int from public.group_claimable_players((select invite_code from ctx))), 19,
  'a claimed name is no longer offered'
);
select pg_temp.login(pg_temp.u(2));
select throws_ok(
  $$ select public.join_group((select invite_code from ctx), '', (select id from azamat)) $$,
  'P0001', 'player_not_available', 'nobody else can claim the same name'
);
select public.join_group((select invite_code from ctx), 'Новичок');
select is(
  (select name from public.players where user_id = pg_temp.u(2)), 'Новичок',
  '"Меня нет в списке" creates a new player'
);

-- a player with an account cannot manage the roster
select pg_temp.login(pg_temp.u(1));
select throws_ok(
  $$ select * from public.add_players((select id from ctx), array['Хакер']) $$,
  '42501', 'not_organizer', 'a player cannot add names'
);
select throws_ok(
  $$ select public.rename_player(pg_temp.pid('Бекзат'), 'Хакер') $$,
  '42501', 'not_organizer', 'a player cannot rename'
);

-- ------------------------------------------------------------ game + attendance
select pg_temp.login(pg_temp.u(0));
create temp table g (id uuid);
with x as (
  insert into public.games (group_id, starts_at, max_players)
  values ((select id from ctx), now() + interval '1 hour', 3) returning id
)
insert into g select id from x;

-- the claimed player signs up himself ("Иду" still works with an account)
select pg_temp.login(pg_temp.u(1));
select is(public.set_signup((select id from g), true)::text, 'going', 'a linked account signs up as its roster player');
select throws_ok(
  $$ select public.set_attendance((select id from g), pg_temp.pid('Бекзат'), true) $$,
  '42501', 'not_organizer', 'a player cannot mark attendance'
);

select pg_temp.login(pg_temp.u(0));
select public.set_attendance((select id from g), pg_temp.pid(n), true)
from unnest(array['Азамат', 'Бекзат', 'Данияр', 'Ерлан', 'Жандос']) n;
select results_eq(
  $$ select count(*)::int, count(*) filter (where arrival = 'arrived')::int
     from public.signups where game_id = (select id from g) and status = 'going' $$,
  $$ values (5, 5) $$,
  'organizer marks 5 present although max_players is 3 (limit may be exceeded)'
);
select public.set_attendance((select id from g), pg_temp.pid('Ерлан'), false);
select is(
  (select arrival::text from public.signups where game_id = (select id from g) and player_id = pg_temp.pid('Ерлан')),
  'pending', 'unchecking keeps the signup, arrival back to pending'
);
select public.set_attendance((select id from g), pg_temp.pid('Ерлан'), true);
select is(
  (select count(*)::int from public.signups where game_id = (select id from g) and player_id = pg_temp.pid('Ерлан')),
  1, 'attendance is idempotent'
);

-- quick add (offline-safe with a client id)
create temp table q as select gen_random_uuid() as id;
select public.create_player_quick((select id from g), 'Гость', false, null, null, (select id from q));
select public.create_player_quick((select id from g), 'Гость', false, null, null, (select id from q));
select results_eq(
  $$ select is_regular, (select arrival::text from public.signups s where s.player_id = p.id and s.game_id = (select id from g))
     from public.players p where p.id = (select id from q) $$,
  $$ values (false, 'arrived'::text) $$,
  'a one-off player is created once, marked present, not in the regular roster'
);
select is(
  (select count(*)::int from public.group_claimable_players((select invite_code from ctx)) where name = 'Гость'),
  0, 'one-off players are not offered on the invite page'
);
select pg_temp.login(pg_temp.u(3));
select public.create_group('Чужие', 'Чужой');
select pg_temp.login(pg_temp.u(0));
select throws_ok(
  $$ select public.create_player_quick((select id from g), 'x', true, null, null, pg_temp.any_pid('Чужой')) $$,
  'P0001', 'player_not_in_group', 'quick add cannot pull in a player of another group'
);

-- ------------------------------------------------------------ teams + match from the present players
create temp table t (k text, id uuid);
insert into t select 'A', id from public.create_team((select id from g), 'Красные', '#e53935');
insert into t select 'B', id from public.create_team((select id from g), 'Синие', '#1e88e5');
select public.apply_assignments((select id from g), jsonb_build_array(
  jsonb_build_object('player_id', pg_temp.pid('Азамат'), 'team_id', (select id from t where k = 'A')),
  jsonb_build_object('player_id', pg_temp.pid('Бекзат'), 'team_id', (select id from t where k = 'A')),
  jsonb_build_object('player_id', pg_temp.pid('Данияр'), 'team_id', (select id from t where k = 'B')),
  jsonb_build_object('player_id', pg_temp.pid('Ерлан'), 'team_id', (select id from t where k = 'B'))
));
-- the late one is added without rebuilding the others
select public.add_to_smallest_team((select id from g), (select id from q));
select is(
  (select count(*)::int from public.team_players where game_id = (select id from g)), 5,
  'late player added to a team (4 others unchanged)'
);

select public.update_game_format((select id from g), null, 5);
insert into t select 'm', id from public.create_match((select id from g), (select id from t where k = 'A'), (select id from t where k = 'B'));
select public.timer_start((select id from t where k = 'm'));
select public.add_event(jsonb_build_object('id', md5('e1')::uuid, 'match_id', (select id from t where k = 'm'),
  'type', 'goal', 'team_id', (select id from t where k = 'A'), 'player_id', pg_temp.pid('Азамат'),
  'assist_player_id', pg_temp.pid('Бекзат'), 'period', 1, 'second', 30));
select public.add_event(jsonb_build_object('id', md5('e2')::uuid, 'match_id', (select id from t where k = 'm'),
  'type', 'goal', 'team_id', (select id from t where k = 'A'), 'player_id', pg_temp.pid('Бекзат'),
  'period', 1, 'second', 60));
select is(
  (select created_by from public.events where id = md5('e1')::uuid),
  (select id from public.players where user_id = pg_temp.u(0)),
  'events record the organizer player (not the auth id)'
);
select public.finish_match((select id from t where k = 'm'));

select results_eq(
  $$ select name, matches, wins, goals, assists from public.game_player_stats((select id from g))
     where name in ('Азамат', 'Данияр') order by name $$,
  $$ values ('Азамат'::text, 1, 1, 1, 0), ('Данияр'::text, 1, 0, 0, 0) $$,
  'per-game table: matches, wins, goals, assists'
);

-- MVP
select pg_temp.login(pg_temp.u(1));
select throws_ok(
  $$ select public.set_game_mvp((select id from g), pg_temp.pid('Азамат')) $$,
  '42501', 'not_organizer', 'a player cannot pick the MVP'
);
select pg_temp.login(pg_temp.u(0));
select public.set_game_mvp((select id from g), pg_temp.pid('Азамат'));
select public.finish_game((select id from g));
select is(
  (select mvp_count from public.leaderboard((select id from ctx)) where player_id = pg_temp.pid('Азамат')),
  1, 'MVP counts in the leaderboard / profile'
);

-- ------------------------------------------------------------ merge duplicates
select public.add_players((select id from ctx), array['Азамат Б.']);
-- give the duplicate some history in another game
with x as (
  insert into public.games (group_id, starts_at) values ((select id from ctx), now() + interval '2 hours') returning id
)
insert into t select 'g2', id from x;
select public.set_attendance((select id from t where k = 'g2'), pg_temp.pid('Азамат Б.'), true);

select pg_temp.login(pg_temp.u(1));
select throws_ok(
  $$ select public.merge_players(pg_temp.pid('Азамат Б.'), pg_temp.pid('Азамат')) $$,
  '42501', 'not_organizer', 'a player cannot merge'
);
select pg_temp.login(pg_temp.u(0));
create temp table dup as select pg_temp.pid('Азамат Б.') as id;
select public.merge_players((select id from dup), pg_temp.pid('Азамат'));
select is((select count(*)::int from public.players where id = (select id from dup)), 0, 'the duplicate is gone');
select is(
  (select count(*)::int from public.signups where game_id = (select id from t where k = 'g2') and player_id = pg_temp.pid('Азамат')),
  1, 'its signup moved to the remaining player'
);
select is(
  (select count(*)::int from public.signups s where not exists (select 1 from public.players p where p.id = s.player_id))
  + (select count(*)::int from public.group_members m where not exists (select 1 from public.players p where p.id = m.player_id)),
  0, 'no orphans left'
);
select is((select user_id from public.players where id = pg_temp.pid('Азамат')), pg_temp.u(1), 'the account link is kept');
-- merging a player that has an account into one without: the account moves
select public.merge_players(pg_temp.pid('Азамат'), pg_temp.pid('Олжас'));
select results_eq(
  $$ select user_id, (select count(*)::int from public.events e where e.player_id = p.id and e.voided_at is null)
     from public.players p where p.name = 'Олжас' $$,
  $$ values ('00000000-0000-4000-8000-000000000501'::uuid, 1) $$,
  'merge moves events and the account'
);
select is(
  (select mvp_count from public.leaderboard((select id from ctx)) where player_id = pg_temp.pid('Олжас')),
  1, 'and the MVP title'
);
select pg_temp.login(pg_temp.u(1));
select is(
  (select name from public.players where user_id = pg_temp.u(1)), 'Олжас',
  'the account now sees itself as the merged player'
);

-- ------------------------------------------------------------ reset / delete
select pg_temp.login(pg_temp.u(1));
select throws_ok($$ select public.reset_game_results((select id from g)) $$, '42501', 'not_organizer', 'a player cannot reset');
select throws_ok($$ select public.delete_game((select id from g)) $$, '42501', 'not_organizer', 'a player cannot delete');

select pg_temp.login(pg_temp.u(0));
select public.reset_game_results((select id from g));
select results_eq(
  $$ select status::text, score_a::int, score_b::int, timer_status::text from public.matches where game_id = (select id from g) $$,
  $$ values ('scheduled'::text, 0, 0, 'idle'::text) $$,
  'reset: matches back to scheduled 0:0'
);
select results_eq(
  $$ select count(*)::int, count(*) filter (where voided_at is not null and void_reason = 'reset')::int
     from public.events where game_id = (select id from g) $$,
  $$ values (2, 2) $$,
  'reset: events stay, voided with reason "reset"'
);
select is(
  (select count(*)::int from public.team_players where game_id = (select id from g)), 5, 'reset keeps the lineups'
);
select results_eq(
  $$ select status::text, mvp_player_id, stats_processed_at from public.games where id = (select id from g) $$,
  $$ values ('closed'::text, null::uuid, null::timestamptz) $$,
  'reset: game reopened (closed), MVP cleared, marked for recalculation'
);

select results_eq(
  $$ select matches, goals, mvp_count from public.leaderboard((select id from ctx)) where player_id = pg_temp.pid('Олжас') $$,
  $$ values (0, 0, 0) $$,
  'reset: the leaderboard no longer counts the game'
);
select is(
  (select count(*)::int from public.game_history((select id from ctx))), 0,
  'reset: the game left the history of finished games'
);

select pg_temp.login(pg_temp.u(1));
select throws_ok(
  $$ select public.update_game((select id from g), 'x', now(), '') $$,
  '42501', 'not_organizer', 'a player cannot edit the game'
);
select pg_temp.login(pg_temp.u(0));
select public.update_game((select id from g), '  Кубок  ', now() + interval '3 hours', 'Арена');
select results_eq(
  $$ select title, place from public.games where id = (select id from g) $$,
  $$ values ('Кубок'::text, 'Арена'::text) $$,
  'organizer edits title and place'
);
select public.update_game_format((select id from g), 3, 6, null, 2);
select results_eq(
  $$ select g.match_periods::int, m.periods::int, m.period_seconds, m.goal_limit
     from public.games g join public.matches m on m.game_id = g.id where g.id = (select id from g) $$,
  $$ values (2, 2, 360, 3) $$,
  'format with periods applies to not-started matches'
);

select public.delete_game((select id from t where k = 'g2'));
select is((select count(*)::int from public.games where id = (select id from t where k = 'g2')), 0, 'a deleted game is hidden');
reset role;
select isnt((select deleted_at from public.games where id = (select id from t where k = 'g2')), null, 'but still stored (soft delete)');
set local role authenticated;
select pg_temp.login(pg_temp.u(0));
select is(
  (select count(*)::int from public.signups where game_id = (select id from t where k = 'g2')), 1,
  'its signups are kept'
);

-- ------------------------------------------------------------ unlink / archive
select public.unlink_player(pg_temp.pid('Олжас'));
select is((select user_id from public.players where id = pg_temp.pid('Олжас')), null, 'organizer unlinks an account');
select public.set_player_archived(pg_temp.pid('Тимур'), true);
select isnt((select archived_at from public.players where id = pg_temp.pid('Тимур')), null, 'archived');

reset role;
select * from finish();
rollback;
