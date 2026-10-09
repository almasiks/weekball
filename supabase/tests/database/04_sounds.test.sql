-- pgTAP: sound board permissions (table + storage objects) and the auto sounds switch.
begin;
select plan(14);

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000401', 'so@test.local'),
  ('00000000-0000-4000-8000-000000000402', 'sp@test.local'),
  ('00000000-0000-4000-8000-000000000403', 'sx@test.local');
-- Roster mode: players.id is independent of auth.uid(); these tests keep them equal for readability.
insert into public.players (id, user_id, name) select id, id, 'tmp' from auth.users where email like '%@test.local';

set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-000000000401');
create temp table ctx as select * from public.create_group('Звуки', 'Орг');
select pg_temp.login('00000000-0000-4000-8000-000000000402');
select public.join_group((select invite_code from ctx), 'Игрок');
select pg_temp.login('00000000-0000-4000-8000-000000000403');
select public.create_group('Чужие', 'Чужой');

-- ------------------------------------------------------------ table
select pg_temp.login('00000000-0000-4000-8000-000000000401');
select lives_ok(
  $$ insert into public.sounds (group_id, name, file_path, sort_order)
     values ((select id from ctx), 'Гол!', (select id from ctx)::text || '/goal.mp3', 0) $$,
  'organizer adds a custom sound'
);
select lives_ok(
  $$ insert into public.sounds (group_id, name, file_path, builtin_key)
     values ((select id from ctx), 'Минута!', (select id from ctx)::text || '/minute.mp3', 'minute') $$,
  'organizer replaces a built-in sound'
);
select throws_ok(
  $$ insert into public.sounds (group_id, name, file_path, builtin_key)
     values ((select id from ctx), 'Ещё минута', (select id from ctx)::text || '/m2.mp3', 'minute') $$,
  '23505', null, 'one replacement per built-in sound'
);
select lives_ok(
  $$ insert into public.sounds (group_id, name, file_path, builtin_key)
     values ((select id from ctx), 'Матч завершён!', (select id from ctx)::text || '/finished.mp3', 'finished') $$,
  'organizer replaces the "match finished" phrase'
);
select throws_ok(
  $$ insert into public.sounds (group_id, name, file_path, builtin_key)
     values ((select id from ctx), 'Нет такого', (select id from ctx)::text || '/x.mp3', 'unknown') $$,
  '23514', null, 'only known built-in keys are accepted'
);
select throws_ok(
  $$ insert into public.sounds (group_id, name, file_path)
     values ((select id from ctx), 'Чужой путь', 'other-group/x.mp3') $$,
  '23514', null, 'file path must live under the group folder'
);

select pg_temp.login('00000000-0000-4000-8000-000000000402');
select is((select count(*)::int from public.sounds), 3, 'a member reads the group sounds');
select throws_ok(
  $$ insert into public.sounds (group_id, name, file_path)
     values ((select id from ctx), 'Игрок', (select id from ctx)::text || '/p.mp3') $$,
  '42501', null, 'a player cannot add sounds'
);
select is_empty(
  $$ delete from public.sounds returning id $$,
  'a player cannot delete sounds'
);

select pg_temp.login('00000000-0000-4000-8000-000000000403');
select is((select count(*)::int from public.sounds), 0, 'an outsider sees no sounds');

-- ------------------------------------------------------------ storage objects
select pg_temp.login('00000000-0000-4000-8000-000000000401');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('sounds', (select id from ctx)::text || '/goal.mp3') $$,
  'organizer uploads into the group folder'
);
select pg_temp.login('00000000-0000-4000-8000-000000000402');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('sounds', (select id from ctx)::text || '/p.mp3') $$,
  '42501', null, 'a player cannot upload files'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'sounds'),
  1, 'a member can read (download) the group files'
);
select pg_temp.login('00000000-0000-4000-8000-000000000403');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'sounds'),
  0, 'an outsider cannot read the files'
);

reset role;
select * from finish();
rollback;
