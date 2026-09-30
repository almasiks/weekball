-- Phase 4: matches, events, timer, standings, public live link.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.match_status as enum ('scheduled', 'live', 'break', 'finished');
create type public.timer_status as enum ('idle', 'running', 'paused', 'finished');
create type public.event_type as enum ('goal', 'own_goal', 'yellow', 'red', 'sub');

alter table public.games add column live_token text unique;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  team_a_id uuid not null references public.teams (id),
  team_b_id uuid not null references public.teams (id),
  sort_order smallint not null default 0,
  status public.match_status not null default 'scheduled',
  period smallint not null default 1,
  periods smallint not null default 2 check (periods between 1 and 4),
  period_seconds integer not null default 1200 check (period_seconds between 60 and 3600),
  timer_status public.timer_status not null default 'idle',
  -- Timer = timer_elapsed_ms + (now - timer_started_at) while running. Clients compute it.
  timer_started_at timestamptz,
  timer_elapsed_ms bigint not null default 0 check (timer_elapsed_ms >= 0),
  -- Derived from events by trigger; never written directly.
  score_a smallint not null default 0,
  score_b smallint not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  check (team_a_id <> team_b_id),
  check (period between 1 and periods)
);

create index matches_game_id_idx on public.matches (game_id, sort_order);

create table public.events (
  id uuid primary key, -- generated on the client: retries are idempotent
  match_id uuid not null references public.matches (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade, -- for Realtime filters
  type public.event_type not null,
  team_id uuid not null references public.teams (id),
  -- Deleting a player (account removal, seed cleanup) removes their events; the score trigger recalculates.
  player_id uuid not null references public.players (id) on delete cascade,
  assist_player_id uuid references public.players (id) on delete set null,
  player_in_id uuid references public.players (id) on delete cascade, -- sub: player_id leaves
  period smallint not null check (period >= 1),
  second integer not null check (second >= 0), -- seconds since the start of this period
  created_by uuid references public.players (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  check (assist_player_id is null or (type = 'goal' and assist_player_id <> player_id)),
  check ((type = 'sub') = (player_in_id is not null)),
  check (player_in_id is null or player_in_id <> player_id)
);

create index events_match_id_idx on public.events (match_id, period, second);
create index events_game_id_idx on public.events (game_id);
create index events_player_id_idx on public.events (player_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
revoke all on public.matches, public.events from anon;
revoke insert, update, delete, truncate on public.matches, public.events from authenticated;
grant select on public.matches, public.events to authenticated;

alter table public.matches enable row level security;
alter table public.events enable row level security;

create policy "matches: members read"
  on public.matches for select to authenticated
  using (private.is_game_member(game_id));

create policy "events: members read"
  on public.events for select to authenticated
  using (private.is_game_member(game_id));

-- ---------------------------------------------------------------------------
-- Permissions: the single place that decides who may run a game.
-- Today: organizers of the group. Later: e.g. a per-game "scorer".
-- ---------------------------------------------------------------------------
create or replace function private.can_score_game(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game_id and private.is_group_organizer(g.group_id)
  );
$$;

-- Trust the device's server-time estimate only if it is plausible.
create or replace function private.effective_ts(p_client_ts timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when p_client_ts is null
      or p_client_ts > now()
      or p_client_ts < now() - interval '10 minutes'
    then now()
    else p_client_ts
  end;
$$;

create or replace function private.require_game_scorer(p_game_id uuid)
returns public.games
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
  if not private.can_score_game(p_game_id) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if g.status in ('finished', 'cancelled') then
    raise exception 'game_not_active' using errcode = 'P0001';
  end if;
  return g;
end;
$$;

-- Locks the match (and its game) for a scorer action.
create or replace function private.require_match_scorer(p_match_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
begin
  select * into m from public.matches where id = p_match_id;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;
  perform private.require_game_scorer(m.game_id);
  select * into m from public.matches where id = p_match_id for update;
  return m;
end;
$$;

create or replace function private.recompute_match_score(p_match_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.matches m
  set score_a = (
        select count(*) from public.events e
        where e.match_id = m.id and e.voided_at is null
          and ((e.type = 'goal' and e.team_id = m.team_a_id)
            or (e.type = 'own_goal' and e.team_id = m.team_b_id))
      ),
      score_b = (
        select count(*) from public.events e
        where e.match_id = m.id and e.voided_at is null
          and ((e.type = 'goal' and e.team_id = m.team_b_id)
            or (e.type = 'own_goal' and e.team_id = m.team_a_id))
      )
  where m.id = p_match_id;
$$;

create or replace function private.on_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recompute_match_score(coalesce(new.match_id, old.match_id));
  return null;
end;
$$;

create trigger events_recompute_score
  after insert or update of voided_at or delete on public.events
  for each row execute function private.on_event_change();

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.can_score_game(uuid)',
    'private.effective_ts(timestamptz)',
    'private.require_game_scorer(uuid)',
    'private.require_match_scorer(uuid)',
    'private.recompute_match_score(uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
  end loop;
end;
$$;

-- Teams stay editable during a live game (late arrivals must be able to score).
create or replace function private.require_team_organizer(p_game_id uuid)
returns public.games
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
  if g.status not in ('signup', 'closed', 'teams', 'live') then
    raise exception 'game_not_active' using errcode = 'P0001';
  end if;
  return g;
end;
$$;

-- A team that already played can't be deleted (it would erase match history).
create or replace function public.delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.teams;
begin
  select * into t from public.teams where id = p_team_id;
  if not found then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;
  perform private.require_team_organizer(t.game_id);

  if exists (
    select 1 from public.matches where team_a_id = t.id or team_b_id = t.id
  ) then
    raise exception 'team_has_matches' using errcode = 'P0001';
  end if;

  delete from public.teams where id = t.id;
  update public.games set draft_active = false where id = t.game_id;
  perform private.touch_teams(t.game_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------------
create or replace function public.create_match(
  p_game_id uuid,
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_periods integer default 2,
  p_period_seconds integer default 1200
)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
begin
  perform private.require_game_scorer(p_game_id);

  if p_team_a_id = p_team_b_id
     or (select count(*) from public.teams
         where game_id = p_game_id and id in (p_team_a_id, p_team_b_id)) <> 2 then
    raise exception 'invalid_match_teams' using errcode = '22023';
  end if;
  if p_periods not between 1 and 4 or p_period_seconds not between 60 and 3600 then
    raise exception 'invalid_match_settings' using errcode = '22023';
  end if;

  insert into public.matches (game_id, team_a_id, team_b_id, periods, period_seconds, sort_order)
  values (
    p_game_id, p_team_a_id, p_team_b_id, p_periods, p_period_seconds,
    coalesce((select max(sort_order) + 1 from public.matches where game_id = p_game_id), 0)
  )
  returning * into m;
  return m;
end;
$$;

-- Every pair of teams once (pairs that already have a match are skipped).
create or replace function public.generate_round_robin(
  p_game_id uuid,
  p_periods integer default 2,
  p_period_seconds integer default 1200
)
returns setof public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  pair record;
begin
  perform private.require_game_scorer(p_game_id);

  for pair in
    with ordered as (
      select id, row_number() over (order by sort_order, created_at) as n
      from public.teams where game_id = p_game_id
    )
    select a.id as a_id, b.id as b_id
    from ordered a join ordered b on a.n < b.n
    order by a.n, b.n
  loop
    continue when exists (
      select 1 from public.matches
      where game_id = p_game_id
        and ((team_a_id = pair.a_id and team_b_id = pair.b_id)
          or (team_a_id = pair.b_id and team_b_id = pair.a_id))
    );
    return next public.create_match(p_game_id, pair.a_id, pair.b_id, p_periods, p_period_seconds);
  end loop;
end;
$$;

create or replace function public.update_match_settings(
  p_match_id uuid,
  p_periods integer,
  p_period_seconds integer
)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
begin
  m := private.require_match_scorer(p_match_id);
  if m.status <> 'scheduled' then
    raise exception 'match_already_started' using errcode = 'P0001';
  end if;
  if p_periods not between 1 and 4 or p_period_seconds not between 60 and 3600 then
    raise exception 'invalid_match_settings' using errcode = '22023';
  end if;
  update public.matches set periods = p_periods, period_seconds = p_period_seconds
  where id = p_match_id returning * into m;
  return m;
end;
$$;

create or replace function public.delete_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
begin
  m := private.require_match_scorer(p_match_id);
  if m.status <> 'scheduled' then
    raise exception 'match_already_started' using errcode = 'P0001';
  end if;
  delete from public.matches where id = p_match_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Timer commands. All idempotent: a retried command finds the state already
-- changed and does nothing.
-- ---------------------------------------------------------------------------
create or replace function public.timer_start(p_match_id uuid, p_client_ts timestamptz default null)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  ts timestamptz := private.effective_ts(p_client_ts);
begin
  m := private.require_match_scorer(p_match_id);
  if m.status <> 'scheduled' then
    return m; -- already started
  end if;
  if exists (
    select 1 from public.matches
    where game_id = m.game_id and id <> m.id and status in ('live', 'break')
  ) then
    raise exception 'another_match_live' using errcode = 'P0001';
  end if;

  update public.matches
  set status = 'live', timer_status = 'running', period = 1,
      timer_started_at = ts, timer_elapsed_ms = 0, started_at = ts
  where id = p_match_id
  returning * into m;

  -- First kick-off: the game goes live and signups close.
  update public.games set status = 'live', draft_active = false
  where id = m.game_id and status in ('signup', 'closed', 'teams');

  return m;
end;
$$;

create or replace function public.timer_pause(p_match_id uuid, p_client_ts timestamptz default null)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  ts timestamptz := private.effective_ts(p_client_ts);
begin
  m := private.require_match_scorer(p_match_id);
  if m.timer_status <> 'running' then
    return m;
  end if;
  update public.matches
  set timer_status = 'paused',
      timer_elapsed_ms = timer_elapsed_ms
        + greatest(0, floor(extract(epoch from (ts - timer_started_at)) * 1000))::bigint,
      timer_started_at = null
  where id = p_match_id
  returning * into m;
  return m;
end;
$$;

create or replace function public.timer_resume(p_match_id uuid, p_client_ts timestamptz default null)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  ts timestamptz := private.effective_ts(p_client_ts);
begin
  m := private.require_match_scorer(p_match_id);
  if m.status <> 'live' or m.timer_status <> 'paused' then
    return m;
  end if;
  update public.matches
  set timer_status = 'running', timer_started_at = ts
  where id = p_match_id
  returning * into m;
  return m;
end;
$$;

-- End of period p_period -> half-time break.
create or replace function public.timer_break(
  p_match_id uuid,
  p_period integer,
  p_client_ts timestamptz default null
)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  ts timestamptz := private.effective_ts(p_client_ts);
begin
  m := private.require_match_scorer(p_match_id);
  if m.status <> 'live' or m.period <> p_period then
    return m; -- already on break / later period
  end if;
  if m.period >= m.periods then
    raise exception 'last_period' using errcode = 'P0001';
  end if;
  update public.matches
  set status = 'break',
      timer_status = 'paused',
      timer_elapsed_ms = timer_elapsed_ms + case
        when timer_status = 'running'
          then greatest(0, floor(extract(epoch from (ts - timer_started_at)) * 1000))::bigint
        else 0 end,
      timer_started_at = null
  where id = p_match_id
  returning * into m;
  return m;
end;
$$;

-- Kick-off of period p_period (after the break).
create or replace function public.timer_next_period(
  p_match_id uuid,
  p_period integer,
  p_client_ts timestamptz default null
)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  ts timestamptz := private.effective_ts(p_client_ts);
begin
  m := private.require_match_scorer(p_match_id);
  if m.status <> 'break' or m.period <> p_period - 1 then
    return m; -- already started
  end if;
  update public.matches
  set status = 'live', timer_status = 'running', period = p_period,
      timer_elapsed_ms = 0, timer_started_at = ts
  where id = p_match_id
  returning * into m;
  return m;
end;
$$;

create or replace function public.finish_match(p_match_id uuid, p_client_ts timestamptz default null)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  ts timestamptz := private.effective_ts(p_client_ts);
begin
  m := private.require_match_scorer(p_match_id);
  if m.status = 'finished' then
    return m;
  end if;
  if m.status = 'scheduled' then
    raise exception 'match_not_started' using errcode = 'P0001';
  end if;
  update public.matches
  set status = 'finished',
      timer_status = 'finished',
      timer_elapsed_ms = timer_elapsed_ms + case
        when timer_status = 'running'
          then greatest(0, floor(extract(epoch from (ts - timer_started_at)) * 1000))::bigint
        else 0 end,
      timer_started_at = null,
      finished_at = ts
  where id = p_match_id
  returning * into m;
  return m;
end;
$$;

-- Undo "finish match" while the game is still running. The timer stays paused.
create or replace function public.reopen_match(p_match_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
begin
  m := private.require_match_scorer(p_match_id);
  if m.status <> 'finished' then
    return m;
  end if;
  if exists (
    select 1 from public.matches
    where game_id = m.game_id and id <> m.id and status in ('live', 'break')
  ) then
    raise exception 'another_match_live' using errcode = 'P0001';
  end if;
  update public.matches
  set status = 'live', timer_status = 'paused', finished_at = null
  where id = p_match_id
  returning * into m;
  return m;
end;
$$;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create or replace function private.in_team(p_team_id uuid, p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_players where team_id = p_team_id and player_id = p_player_id
  );
$$;

revoke all on function private.in_team(uuid, uuid) from public;

-- payload: {id, match_id, type, team_id, player_id, assist_player_id?, player_in_id?, period, second}
create or replace function public.add_event(payload jsonb)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  m public.matches;
  v_id uuid := (payload ->> 'id')::uuid;
  v_type public.event_type := (payload ->> 'type')::public.event_type;
  v_team uuid := (payload ->> 'team_id')::uuid;
  v_player uuid := (payload ->> 'player_id')::uuid;
  v_assist uuid := nullif(payload ->> 'assist_player_id', '')::uuid;
  v_in uuid := nullif(payload ->> 'player_in_id', '')::uuid;
  v_period integer := (payload ->> 'period')::integer;
  v_second integer := (payload ->> 'second')::integer;
begin
  if v_id is null then
    raise exception 'invalid_event' using errcode = '22023';
  end if;

  -- Idempotency: a retried event is simply returned.
  select * into e from public.events where id = v_id;
  if found then
    return e;
  end if;

  m := private.require_match_scorer((payload ->> 'match_id')::uuid);

  if m.status not in ('live', 'break') then
    raise exception 'match_not_live' using errcode = 'P0001';
  end if;
  if v_team is null or v_team not in (m.team_a_id, m.team_b_id) then
    raise exception 'invalid_event_team' using errcode = '22023';
  end if;
  if v_player is null or not private.in_team(v_team, v_player) then
    raise exception 'player_not_in_team' using errcode = '22023';
  end if;
  if v_assist is not null and (v_type <> 'goal' or v_assist = v_player or not private.in_team(v_team, v_assist)) then
    raise exception 'invalid_assist' using errcode = '22023';
  end if;
  if (v_type = 'sub') <> (v_in is not null)
     or (v_in is not null and (v_in = v_player or not private.in_team(v_team, v_in))) then
    raise exception 'invalid_sub' using errcode = '22023';
  end if;
  if v_period is null or v_period not between 1 and m.periods or v_second is null or v_second < 0 then
    raise exception 'invalid_event_time' using errcode = '22023';
  end if;

  insert into public.events (
    id, match_id, game_id, type, team_id, player_id, assist_player_id, player_in_id,
    period, second, created_by
  )
  values (
    v_id, m.id, m.game_id, v_type, v_team, v_player, v_assist, v_in,
    v_period, v_second, auth.uid()
  )
  on conflict (id) do nothing
  returning * into e;

  if e.id is null then
    select * into e from public.events where id = v_id;
  end if;
  return e;
end;
$$;

create or replace function public.void_event(p_event_id uuid)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
begin
  select * into e from public.events where id = p_event_id;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  perform private.require_game_scorer(e.game_id);

  update public.events set voided_at = now()
  where id = p_event_id and voided_at is null
  returning * into e;
  if e.id is null then
    select * into e from public.events where id = p_event_id;
  end if;
  return e;
end;
$$;

-- ---------------------------------------------------------------------------
-- Standings: finished matches only; 3 / 1 / 0; points, goal diff, goals for.
-- ---------------------------------------------------------------------------
create or replace function private.standings(p_game_id uuid)
returns table (
  team_id uuid, name text, color text,
  played integer, won integer, drawn integer, lost integer,
  goals_for integer, goals_against integer, goal_diff integer, points integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with results as (
    select team_a_id as team, score_a as gf, score_b as ga
    from public.matches where game_id = p_game_id and status = 'finished'
    union all
    select team_b_id, score_b, score_a
    from public.matches where game_id = p_game_id and status = 'finished'
  ),
  agg as (
    select t.id, t.name, t.color, t.sort_order,
           count(r.team)::integer as played,
           count(*) filter (where r.gf > r.ga)::integer as won,
           count(*) filter (where r.gf = r.ga)::integer as drawn,
           count(*) filter (where r.gf < r.ga)::integer as lost,
           coalesce(sum(r.gf), 0)::integer as goals_for,
           coalesce(sum(r.ga), 0)::integer as goals_against
    from public.teams t
    left join results r on r.team = t.id
    where t.game_id = p_game_id
    group by t.id, t.name, t.color, t.sort_order
  )
  select id, name, color, played, won, drawn, lost, goals_for, goals_against,
         goals_for - goals_against, won * 3 + drawn
  from agg
  order by won * 3 + drawn desc, goals_for - goals_against desc, goals_for desc, sort_order;
$$;

revoke all on function private.standings(uuid) from public;

create or replace function public.game_standings(p_game_id uuid)
returns table (
  team_id uuid, name text, color text,
  played integer, won integer, drawn integer, lost integer,
  goals_for integer, goals_against integer, goal_diff integer, points integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.standings(p_game_id) where private.is_game_member(p_game_id);
$$;

create or replace function public.finish_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_game_scorer(p_game_id);

  if not exists (select 1 from public.matches where game_id = p_game_id and status = 'finished') then
    raise exception 'no_finished_matches' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.matches where game_id = p_game_id and status in ('live', 'break')) then
    raise exception 'match_in_progress' using errcode = 'P0001';
  end if;

  delete from public.matches where game_id = p_game_id and status = 'scheduled';
  update public.games set status = 'finished', draft_active = false where id = p_game_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public live link (guests, no sign-in)
-- ---------------------------------------------------------------------------
create or replace function public.set_live_link(p_game_id uuid, p_enabled boolean, p_regenerate boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.games;
  token text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into g from public.games where id = p_game_id;
  if not found or not private.is_group_member(g.group_id) then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;
  if not private.can_score_game(p_game_id) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;

  if not p_enabled then
    update public.games set live_token = null where id = p_game_id;
    return null;
  end if;

  token := g.live_token;
  if token is null or p_regenerate then
    -- 256 random bits, URL-safe hex.
    token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update public.games set live_token = token where id = p_game_id;
  end if;
  return token;
end;
$$;

-- Everything a guest needs, names only. Null when the link is disabled / unknown.
create or replace function public.get_live_game(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  g public.games;
begin
  if p_token is null or char_length(p_token) < 32 then
    return null;
  end if;
  select * into g from public.games where live_token = p_token;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'server_now', now(),
    'game', jsonb_build_object(
      'id', g.id,
      'starts_at', g.starts_at,
      'place', g.place,
      'timezone', g.timezone,
      'status', g.status,
      'group_name', (select name from public.groups where id = g.group_id)
    ),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'color', t.color,
        'players', coalesce((
          select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
          from public.team_players tp join public.players p on p.id = tp.player_id
          where tp.team_id = t.id
        ), '[]'::jsonb)
      ) order by t.sort_order)
      from public.teams t where t.game_id = g.id
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'team_a_id', m.team_a_id, 'team_b_id', m.team_b_id,
        'status', m.status, 'period', m.period, 'periods', m.periods,
        'period_seconds', m.period_seconds, 'timer_status', m.timer_status,
        'timer_started_at', m.timer_started_at, 'timer_elapsed_ms', m.timer_elapsed_ms,
        'score_a', m.score_a, 'score_b', m.score_b, 'sort_order', m.sort_order
      ) order by m.sort_order)
      from public.matches m where m.game_id = g.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'match_id', e.match_id, 'type', e.type, 'team_id', e.team_id,
        'player_id', e.player_id, 'assist_player_id', e.assist_player_id,
        'player_in_id', e.player_in_id, 'period', e.period, 'second', e.second
      ) order by e.period, e.second, e.created_at)
      from public.events e where e.game_id = g.id and e.voided_at is null
    ), '[]'::jsonb),
    'standings', coalesce((
      select jsonb_agg(to_jsonb(s)) from private.standings(g.id) s
    ), '[]'::jsonb)
  );
end;
$$;

-- Server clock for the client-side offset (signed-in users and guests).
create or replace function public.server_time()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now();
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.create_match(uuid, uuid, uuid, integer, integer)',
    'public.generate_round_robin(uuid, integer, integer)',
    'public.update_match_settings(uuid, integer, integer)',
    'public.delete_match(uuid)',
    'public.timer_start(uuid, timestamptz)',
    'public.timer_pause(uuid, timestamptz)',
    'public.timer_resume(uuid, timestamptz)',
    'public.timer_break(uuid, integer, timestamptz)',
    'public.timer_next_period(uuid, integer, timestamptz)',
    'public.finish_match(uuid, timestamptz)',
    'public.reopen_match(uuid)',
    'public.add_event(jsonb)',
    'public.void_event(uuid)',
    'public.game_standings(uuid)',
    'public.finish_game(uuid)',
    'public.set_live_link(uuid, boolean, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

revoke all on function public.get_live_game(text) from public;
grant execute on function public.get_live_game(text) to anon, authenticated;
revoke all on function public.server_time() from public;
grant execute on function public.server_time() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.matches, public.events;
