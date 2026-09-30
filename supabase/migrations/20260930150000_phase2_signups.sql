-- Phase 2: schedules, games, signups + RLS, signup RPCs, schedule-driven game creation, realtime.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
-- Only signup / closed / cancelled are used in phase 2; the rest are reserved for phases 3–4.
create type public.game_status as enum ('signup', 'closed', 'teams', 'live', 'finished', 'cancelled');
create type public.signup_status as enum ('going', 'waitlist', 'declined');
create type public.arrival_status as enum ('pending', 'late', 'arrived');

create or replace function private.is_valid_timezone(tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  place text not null default '' check (char_length(place) <= 120),
  max_players integer not null default 20 check (max_players between 2 and 100),
  timezone text not null default 'Asia/Almaty' check (private.is_valid_timezone(timezone)),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index schedules_group_id_idx on public.schedules (group_id);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  schedule_id uuid references public.schedules (id) on delete set null,
  starts_at timestamptz not null,
  place text not null default '' check (char_length(place) <= 120),
  max_players integer not null default 20 check (max_players between 2 and 100),
  -- Display timezone (copied from the schedule; one-off games get it from the form).
  timezone text not null default 'Asia/Almaty' check (private.is_valid_timezone(timezone)),
  status public.game_status not null default 'signup',
  created_at timestamptz not null default now(),
  unique (schedule_id, starts_at)
);

create index games_group_starts_idx on public.games (group_id, starts_at);

create table public.signups (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  status public.signup_status not null,
  arrival public.arrival_status not null default 'pending',
  late_minutes smallint check (late_minutes between 1 and 180),
  -- Queue position: reset to now() every time the player signs up again.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id),
  check ((arrival = 'late') = (late_minutes is not null))
);

create index signups_game_queue_idx on public.signups (game_id, status, created_at);
create index signups_player_id_idx on public.signups (player_id);

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
create or replace function private.is_game_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.games g
    join public.group_members m on m.group_id = g.group_id
    where g.id = gid and m.player_id = (select auth.uid())
  );
$$;

revoke all on function private.is_valid_timezone(text) from public;
revoke all on function private.is_game_member(uuid) from public;
grant execute on function private.is_valid_timezone(text) to authenticated;
grant execute on function private.is_game_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.schedules, public.games, public.signups from anon;
revoke insert, update, delete, truncate on public.schedules, public.games, public.signups from authenticated;

grant select on public.schedules, public.games, public.signups to authenticated;
grant insert (group_id, weekday, start_time, place, max_players, timezone, is_active)
  on public.schedules to authenticated;
grant update (weekday, start_time, place, max_players, timezone, is_active)
  on public.schedules to authenticated;
-- One-off games only; status changes go through set_game_status().
grant insert (group_id, starts_at, place, max_players, timezone) on public.games to authenticated;
-- signups: read-only for clients, writes go through set_signup() / set_arrival().

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.schedules enable row level security;
alter table public.games enable row level security;
alter table public.signups enable row level security;

create policy "schedules: members read"
  on public.schedules for select to authenticated
  using (private.is_group_member(group_id));

create policy "schedules: organizers insert"
  on public.schedules for insert to authenticated
  with check (private.is_group_organizer(group_id));

create policy "schedules: organizers update"
  on public.schedules for update to authenticated
  using (private.is_group_organizer(group_id))
  with check (private.is_group_organizer(group_id));

create policy "games: members read"
  on public.games for select to authenticated
  using (private.is_group_member(group_id));

create policy "games: organizers insert"
  on public.games for insert to authenticated
  with check (private.is_group_organizer(group_id));

create policy "signups: members read"
  on public.signups for select to authenticated
  using (private.is_game_member(game_id));

-- ---------------------------------------------------------------------------
-- Game generation from schedules (idempotent via unique (schedule_id, starts_at))
-- ---------------------------------------------------------------------------
create or replace function private.ensure_schedule_games(p_schedule_id uuid, p_days integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.schedules;
  local_today date;
  d date;
  game_start timestamptz;
  inserted integer;
  total integer := 0;
begin
  select * into s from public.schedules where id = p_schedule_id;
  if not found or not s.is_active then
    return 0;
  end if;

  local_today := (now() at time zone s.timezone)::date;

  for i in 0..p_days loop
    d := local_today + i;
    continue when extract(dow from d)::smallint <> s.weekday;

    -- Local wall-clock time in the schedule's timezone -> UTC instant.
    game_start := (d + s.start_time) at time zone s.timezone;
    continue when game_start <= now() or game_start > now() + make_interval(days => p_days);

    insert into public.games (group_id, schedule_id, starts_at, place, max_players, timezone)
    values (s.group_id, s.id, game_start, s.place, s.max_players, s.timezone)
    on conflict (schedule_id, starts_at) do nothing;

    get diagnostics inserted = row_count;
    total := total + inserted;
  end loop;

  return total;
end;
$$;

revoke all on function private.ensure_schedule_games(uuid, integer) from public;

-- Called by the daily cron (service role only).
create or replace function public.create_upcoming_games(days_ahead integer default 14)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  total integer := 0;
begin
  for s in select id from public.schedules where is_active loop
    total := total + private.ensure_schedule_games(s.id, days_ahead);
  end loop;
  return total;
end;
$$;

revoke all on function public.create_upcoming_games(integer) from public, anon, authenticated;
grant execute on function public.create_upcoming_games(integer) to service_role;

-- When a schedule is created or changed, rebuild its future games right away
-- (so organizers don't wait for the cron). Future games that already have
-- players signed up are kept untouched; the organizer can cancel them manually.
create or replace function private.on_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (old.weekday, old.start_time, old.timezone, old.is_active, old.place, old.max_players)
         is distinct from
         (new.weekday, new.start_time, new.timezone, new.is_active, new.place, new.max_players) then
    delete from public.games g
    where g.schedule_id = new.id
      and g.status = 'signup'
      and g.starts_at > now()
      and not exists (
        select 1 from public.signups x
        where x.game_id = g.id and x.status in ('going', 'waitlist')
      );
  end if;

  perform private.ensure_schedule_games(new.id, 14);
  return null;
end;
$$;

create trigger schedules_sync_games
  after insert or update on public.schedules
  for each row execute function private.on_schedule_change();

-- ---------------------------------------------------------------------------
-- Signup RPCs
-- ---------------------------------------------------------------------------
-- Moves players from the waitlist into free "going" spots, in queue order.
create or replace function private.promote_waitlist(p_game_id uuid, p_max_players integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  free_spots integer;
begin
  select p_max_players - count(*) into free_spots
  from public.signups
  where game_id = p_game_id and status = 'going';

  if free_spots <= 0 then
    return;
  end if;

  update public.signups s
  set status = 'going', updated_at = now()
  from (
    select player_id from public.signups
    where game_id = p_game_id and status = 'waitlist'
    order by created_at, player_id
    limit free_spots
  ) next_in_line
  where s.game_id = p_game_id and s.player_id = next_in_line.player_id;
end;
$$;

revoke all on function private.promote_waitlist(uuid, integer) from public;

create or replace function public.set_signup(p_game_id uuid, wants_to_come boolean)
returns public.signup_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g public.games;
  previous public.signup_status;
  going_count integer;
  result public.signup_status;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Row lock serializes concurrent signups for the same game (no over-booking).
  select * into g from public.games where id = p_game_id for update;
  if not found or not private.is_group_member(g.group_id) then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;
  if g.status <> 'signup' then
    raise exception 'signup_closed' using errcode = 'P0001';
  end if;

  select status into previous
  from public.signups
  where game_id = p_game_id and player_id = uid;

  if wants_to_come then
    if previous in ('going', 'waitlist') then
      return previous;
    end if;

    select count(*) into going_count
    from public.signups
    where game_id = p_game_id and status = 'going';

    result := case when going_count < g.max_players then 'going' else 'waitlist' end;

    insert into public.signups (game_id, player_id, status)
    values (p_game_id, uid, result)
    on conflict (game_id, player_id) do update
      set status = excluded.status,
          arrival = 'pending',
          late_minutes = null,
          created_at = now(),
          updated_at = now();
  else
    result := 'declined';

    insert into public.signups (game_id, player_id, status)
    values (p_game_id, uid, 'declined')
    on conflict (game_id, player_id) do update
      set status = 'declined',
          arrival = 'pending',
          late_minutes = null,
          updated_at = now();

    if previous = 'going' then
      perform private.promote_waitlist(p_game_id, g.max_players);
    end if;
  end if;

  return result;
end;
$$;

create or replace function public.set_arrival(
  p_game_id uuid,
  p_arrival public.arrival_status,
  p_late_minutes integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g public.games;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into g from public.games where id = p_game_id;
  if not found or not private.is_group_member(g.group_id) then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;
  if g.status in ('cancelled', 'finished') then
    raise exception 'game_not_active' using errcode = 'P0001';
  end if;
  if p_arrival = 'late' and (p_late_minutes is null or p_late_minutes not between 1 and 180) then
    raise exception 'invalid_late_minutes' using errcode = '22023';
  end if;

  update public.signups
  set arrival = p_arrival,
      late_minutes = case when p_arrival = 'late' then p_late_minutes end,
      updated_at = now()
  where game_id = p_game_id and player_id = uid and status = 'going';

  if not found then
    raise exception 'not_going' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.set_game_status(p_game_id uuid, new_status public.game_status)
returns public.game_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.games;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into g from public.games where id = p_game_id for update;
  if not found or not private.is_group_member(g.group_id) then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;
  if not private.is_group_organizer(g.group_id) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;

  if g.status = new_status then
    return g.status;
  end if;

  -- Phase 2 transitions: signup <-> closed, anything (not yet cancelled) -> cancelled.
  if not (
    (g.status = 'signup' and new_status = 'closed')
    or (g.status = 'closed' and new_status = 'signup')
    or (new_status = 'cancelled')
  ) then
    raise exception 'invalid_status_transition' using errcode = 'P0001';
  end if;

  update public.games set status = new_status where id = p_game_id;
  return new_status;
end;
$$;

revoke all on function public.set_signup(uuid, boolean) from public, anon;
revoke all on function public.set_arrival(uuid, public.arrival_status, integer) from public, anon;
revoke all on function public.set_game_status(uuid, public.game_status) from public, anon;
grant execute on function public.set_signup(uuid, boolean) to authenticated;
grant execute on function public.set_arrival(uuid, public.arrival_status, integer) to authenticated;
grant execute on function public.set_game_status(uuid, public.game_status) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (RLS applies to subscribers)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.games, public.signups;
