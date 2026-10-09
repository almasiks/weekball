-- New built-in sound button: the voice phrase "Матч завершён!" (key 'finished').
-- A group may replace it with its own file like the other built-in sounds.
alter table public.sounds drop constraint sounds_builtin_key_check;
alter table public.sounds
  add constraint sounds_builtin_key_check
  check (builtin_key in ('minute', 'out', 'whistle', 'final', 'finished'));
