-- Sound board: custom sounds per group (Supabase Storage bucket "sounds",
-- path "<group_id>/<file>") + auto sounds switch per game.

-- ---------------------------------------------------------------------------
-- Storage bucket (private; 2 MB; audio only)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sounds', 'sounds', false, 2097152,
  array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
        'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- First path segment = group id.
create or replace function private.sound_group(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (string_to_array(p_name, '/'))[1]::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function private.sound_group(text) from public;
grant execute on function private.sound_group(text) to authenticated;

create policy "sounds files: members read"
  on storage.objects for select to authenticated
  using (bucket_id = 'sounds' and private.is_group_member(private.sound_group(name)));

create policy "sounds files: organizers upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'sounds' and private.is_group_organizer(private.sound_group(name)));

create policy "sounds files: organizers update"
  on storage.objects for update to authenticated
  using (bucket_id = 'sounds' and private.is_group_organizer(private.sound_group(name)))
  with check (bucket_id = 'sounds' and private.is_group_organizer(private.sound_group(name)));

create policy "sounds files: organizers delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'sounds' and private.is_group_organizer(private.sound_group(name)));

-- ---------------------------------------------------------------------------
-- Sounds table
-- ---------------------------------------------------------------------------
create table public.sounds (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  file_path text not null check (file_path like group_id::text || '/%'),
  -- Replaces a built-in button ('minute' | 'out' | 'whistle' | 'final'); null = custom button.
  builtin_key text check (builtin_key in ('minute', 'out', 'whistle', 'final')),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create unique index sounds_group_builtin_idx on public.sounds (group_id, builtin_key)
  where builtin_key is not null;
create index sounds_group_idx on public.sounds (group_id, sort_order);

revoke all on public.sounds from anon;
revoke insert, update, delete, truncate on public.sounds from authenticated;
grant select, delete on public.sounds to authenticated;
grant insert (group_id, name, file_path, builtin_key, sort_order) on public.sounds to authenticated;
grant update (name, sort_order) on public.sounds to authenticated;

alter table public.sounds enable row level security;

create policy "sounds: members read"
  on public.sounds for select to authenticated
  using (private.is_group_member(group_id));

create policy "sounds: organizers insert"
  on public.sounds for insert to authenticated
  with check (private.is_group_organizer(group_id));

create policy "sounds: organizers update"
  on public.sounds for update to authenticated
  using (private.is_group_organizer(group_id))
  with check (private.is_group_organizer(group_id));

create policy "sounds: organizers delete"
  on public.sounds for delete to authenticated
  using (private.is_group_organizer(group_id));

-- ---------------------------------------------------------------------------
-- Auto sounds ("Минута!" 1 min before the end, final whistle) — per game
-- ---------------------------------------------------------------------------
alter table public.games add column auto_sounds boolean not null default true;

drop function public.update_game_format(uuid, integer, integer);

create function public.update_game_format(
  p_game_id uuid,
  p_goal_limit integer,
  p_match_minutes integer,
  p_auto_sounds boolean default null
)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.games;
begin
  perform private.require_game_scorer(p_game_id);
  if p_goal_limit is not null and p_goal_limit not between 1 and 20 then
    raise exception 'invalid_match_settings' using errcode = '22023';
  end if;
  if p_match_minutes is null or p_match_minutes not between 1 and 60 then
    raise exception 'invalid_match_settings' using errcode = '22023';
  end if;

  update public.games
  set goal_limit = p_goal_limit,
      match_minutes = p_match_minutes,
      auto_sounds = coalesce(p_auto_sounds, auto_sounds)
  where id = p_game_id
  returning * into g;

  update public.matches
  set goal_limit = p_goal_limit, periods = 1, period = 1, period_seconds = p_match_minutes * 60
  where game_id = p_game_id and status = 'scheduled';

  return g;
end;
$$;

revoke all on function public.update_game_format(uuid, integer, integer, boolean) from public, anon;
grant execute on function public.update_game_format(uuid, integer, integer, boolean) to authenticated;
