-- pgTAP: single-group mode — entry by name, automatic membership, no group creation.
begin;
select plan(19);

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000601', 'a@test.local'),
  ('00000000-0000-4000-8000-000000000602', 'b@test.local'),
  ('00000000-0000-4000-8000-000000000603', 'c@test.local'),
  ('00000000-0000-4000-8000-000000000604', 'd@test.local');

-- A clean default group, whatever the developer database contains
-- (triggers off: the "last organizer" rule must not stop the clean-up).
set local session_replication_role = replica;
delete from public.group_members where group_id = '00000000-0000-4000-8000-000000000001';
delete from public.games where group_id = '00000000-0000-4000-8000-000000000001';
set local session_replication_role = origin;

select is(
  (select name from public.groups where id = '00000000-0000-4000-8000-000000000001'),
  'Weekly Football',
  'the default group exists with the fixed id'
);

-- Roster name without an account (added by the organizer) and an archived one.
insert into public.players (id, name) values
  ('00000000-0000-4000-8000-0000000006a1', 'Азамат'),
  ('00000000-0000-4000-8000-0000000006a2', 'Старый');
update public.players set archived_at = now() where id = '00000000-0000-4000-8000-0000000006a2';
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000006a1'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000006a2');
insert into public.games (id, group_id, starts_at) values
  ('00000000-0000-4000-8000-0000000006f1', '00000000-0000-4000-8000-000000000001', now() + interval '1 day');

set local role authenticated;

-- ------------------------------------------------------------ entry by name
select pg_temp.login('00000000-0000-4000-8000-000000000601');
select is((select name from public.enter_app('  Иван  ')), 'Иван', 'a new person enters with a name');
select is(
  (select m.role::text from public.group_members m
   join public.players p on p.id = m.player_id
   where p.user_id = '00000000-0000-4000-8000-000000000601'
     and m.group_id = '00000000-0000-4000-8000-000000000001'),
  'player',
  'and becomes a player of the default group'
);
select is(
  (select id from public.enter_app('Другое имя')),
  (select id from public.players where user_id = '00000000-0000-4000-8000-000000000601'),
  'entering again returns the same player'
);
select is(
  (select name from public.players where user_id = '00000000-0000-4000-8000-000000000601'),
  'Иван',
  'and does not rename them'
);

select pg_temp.login('00000000-0000-4000-8000-000000000602');
select throws_ok(
  $$ select public.enter_app('иван') $$,
  'P0001', 'name_taken', 'a name of a player with an account is taken (case does not matter)'
);
select throws_ok(
  $$ select public.enter_app('Старый') $$,
  'P0001', 'name_taken', 'an archived name cannot be taken over'
);
select throws_ok(
  $$ select public.enter_app('   ') $$,
  '22023', 'invalid_player_name', 'an empty name is rejected'
);
select is(
  (select id from public.enter_app('азамат')),
  '00000000-0000-4000-8000-0000000006a1'::uuid,
  'a roster name without an account is taken over with its history'
);
select is(
  (select count(*)::int from public.players where lower(name) = 'азамат'),
  1,
  'no duplicate player is created'
);

-- ------------------------------------------------------------ everyone signed in is a member
select pg_temp.login('00000000-0000-4000-8000-000000000603'); -- has no player yet
select is(
  (select count(*)::int from public.games where group_id = '00000000-0000-4000-8000-000000000001'),
  1,
  'a signed-in user sees the games of the default group at once'
);
select ok(
  (select count(*)::int from public.players) >= 3,
  'and the players of the default group'
);

-- ------------------------------------------------------------ no groups from the app, no self-promotion
select throws_ok(
  $$ select public.create_group('Своя группа', 'Я') $$,
  '42501', null, 'groups cannot be created any more'
);
select throws_ok(
  $$ select public.join_group('ABCD1234', 'Я', null) $$,
  '42501', null, 'nor joined by code'
);
select pg_temp.login('00000000-0000-4000-8000-000000000601');
update public.group_members set role = 'organizer'
where player_id = (select id from public.players where user_id = '00000000-0000-4000-8000-000000000601');
select is(
  (select m.role::text from public.group_members m
   join public.players p on p.id = m.player_id
   where p.user_id = '00000000-0000-4000-8000-000000000601'),
  'player',
  'a player cannot make themselves an organizer (only the server with the PIN can)'
);

-- ------------------------------------------------------------ own name
select throws_ok(
  $$ select public.rename_me('АЗАМАТ') $$,
  'P0001', 'name_taken', 'renaming to an existing name is refused'
);
select is((select name from public.rename_me('Иван Петров')), 'Иван Петров', 'renaming to a free name works');

-- ------------------------------------------------------------ organizer rule
reset role;
select lives_ok(
  $$ delete from public.group_members
     where group_id = '00000000-0000-4000-8000-000000000001'
       and player_id = '00000000-0000-4000-8000-0000000006a2' $$,
  'a group that has no organizer yet can still change its members'
);
update public.group_members set role = 'organizer'
where group_id = '00000000-0000-4000-8000-000000000001'
  and player_id = '00000000-0000-4000-8000-0000000006a1';
select throws_ok(
  $$ update public.group_members set role = 'player'
     where group_id = '00000000-0000-4000-8000-000000000001' and role = 'organizer' $$,
  'P0001', 'last_organizer', 'the last organizer cannot be demoted'
);

select * from finish();
rollback;
