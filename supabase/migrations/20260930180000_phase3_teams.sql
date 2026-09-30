-- Phase 3: teams, team_players, publishing, draft, organizer-set player levels.

-- ---------------------------------------------------------------------------
-- games: publishing + draft state
-- ---------------------------------------------------------------------------
alter table public.games
  add column teams_published_at timestamptz,
  add column draft_active boolean not null default false,
  add column draft_turn integer not null default 0,
  -- Bumped on every team change. Clients listen to this games row in Realtime,
  -- which also covers deletes (Realtime can't filter DELETE events by game_id).
  add column teams_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  captain_id uuid references public.players (id) on delete set null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, color),
  unique (id, game_id)
);

create index teams_game_id_idx on public.teams (game_id, sort_order);

create table public.team_players (
  team_id uuid not null,
  game_id uuid not null,
  player_id uuid not null references public.players (id) on delete cascade,
  added_late boolean not null default false,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (team_id, player_id),
  -- One team per player per game.
  unique (game_id, player_id),
  foreign key (team_id, game_id) references public.teams (id, game_id) on delete cascade
);

create index team_players_player_id_idx on public.team_players (player_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Organizers always; other members only once teams are published or a draft is running.
create or replace function private.can_view_teams(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.games g
    join public.group_members m
      on m.group_id = g.group_id and m.player_id = (select auth.uid())
    where g.id = gid
      and (m.role = 'organizer' or g.teams_published_at is not null or g.draft_active)
  );
$$;

revoke all on function private.can_view_teams(uuid) from public;
grant execute on function private.can_view_teams(uuid) to authenticated;

revoke all on public.teams, public.team_players from anon;
revoke insert, update, delete, truncate on public.teams, public.team_players from authenticated;
grant select on public.teams, public.team_players to authenticated;

alter table public.teams enable row level security;
alter table public.team_players enable row level security;

create policy "teams: visible to organizers, or to members once published / drafting"
  on public.teams for select to authenticated
  using (private.can_view_teams(game_id));

create policy "team_players: visible to organizers, or to members once published / drafting"
  on public.team_players for select to authenticated
  using (private.can_view_teams(game_id));

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
-- Locks the game row and checks the caller is its organizer and the game is still editable.
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
  if g.status not in ('signup', 'closed', 'teams') then
    raise exception 'game_not_active' using errcode = 'P0001';
  end if;
  return g;
end;
$$;

create or replace function private.require_going(p_game_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.signups
    where game_id = p_game_id and player_id = p_player_id and status = 'going'
  ) then
    raise exception 'player_not_going' using errcode = 'P0001';
  end if;
end;
$$;

-- A captain must play in their own team; clear captains who were moved out.
create or replace function private.fix_captains(p_game_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.teams t
  set captain_id = null
  where t.game_id = p_game_id
    and t.captain_id is not null
    and not exists (
      select 1 from public.team_players tp
      where tp.team_id = t.id and tp.player_id = t.captain_id
    );
$$;

create or replace function private.touch_teams(p_game_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.games set teams_updated_at = now() where id = p_game_id;
$$;

-- Puts the captain into their team (locked, so auto-balance keeps them there).
create or replace function private.assign_captain(p_team_id uuid, p_game_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_going(p_game_id, p_player_id);

  delete from public.team_players
  where game_id = p_game_id and player_id = p_player_id and team_id <> p_team_id;

  insert into public.team_players (team_id, game_id, player_id, is_locked)
  values (p_team_id, p_game_id, p_player_id, true)
  on conflict (team_id, player_id) do update set is_locked = true;

  update public.teams set captain_id = null
  where game_id = p_game_id and captain_id = p_player_id and id <> p_team_id;
  update public.teams set captain_id = p_player_id where id = p_team_id;
end;
$$;

-- Snake order: 0,1,2,2,1,0,0,1,2…
create or replace function private.draft_current_team(p_game_id uuid, p_turn integer)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with ordered as (
    select id,
           (row_number() over (order by sort_order, created_at) - 1)::integer as idx,
           (count(*) over ())::integer as n
    from public.teams
    where game_id = p_game_id
  )
  select id from ordered
  where idx = case
    when (p_turn / n) % 2 = 0 then p_turn % n
    else n - 1 - (p_turn % n)
  end;
$$;

create or replace function private.unassigned_going_count(p_game_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.signups s
  where s.game_id = p_game_id
    and s.status = 'going'
    and not exists (
      select 1 from public.team_players tp
      where tp.game_id = s.game_id and tp.player_id = s.player_id
    );
$$;

revoke all on function private.require_team_organizer(uuid) from public;
revoke all on function private.require_going(uuid, uuid) from public;
revoke all on function private.fix_captains(uuid) from public;
revoke all on function private.touch_teams(uuid) from public;
revoke all on function private.assign_captain(uuid, uuid, uuid) from public;
revoke all on function private.draft_current_team(uuid, integer) from public;
revoke all on function private.unassigned_going_count(uuid) from public;

-- ---------------------------------------------------------------------------
-- Team RPCs (organizer)
-- ---------------------------------------------------------------------------
create or replace function public.create_team(
  p_game_id uuid,
  p_name text,
  p_color text,
  p_captain_id uuid default null
)
returns public.teams
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_color text := lower(btrim(coalesce(p_color, '')));
  clean_name text := btrim(coalesce(p_name, ''));
  t public.teams;
begin
  perform private.require_team_organizer(p_game_id);

  if (select count(*) from public.teams where game_id = p_game_id) >= 3 then
    raise exception 'too_many_teams' using errcode = 'P0001';
  end if;
  if char_length(clean_name) not between 1 and 30 then
    raise exception 'invalid_team_name' using errcode = '22023';
  end if;
  if clean_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'invalid_color' using errcode = '22023';
  end if;
  if exists (select 1 from public.teams where game_id = p_game_id and color = clean_color) then
    raise exception 'color_taken' using errcode = 'P0001';
  end if;

  insert into public.teams (game_id, name, color, sort_order)
  values (
    p_game_id, clean_name, clean_color,
    coalesce((select max(sort_order) + 1 from public.teams where game_id = p_game_id), 0)
  )
  returning * into t;

  if p_captain_id is not null then
    perform private.assign_captain(t.id, p_game_id, p_captain_id);
    select * into t from public.teams where id = t.id;
  end if;

  perform private.touch_teams(p_game_id);
  return t;
end;
$$;

create or replace function public.update_team(
  p_team_id uuid,
  p_name text,
  p_color text,
  p_captain_id uuid default null
)
returns public.teams
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.teams;
  clean_color text := lower(btrim(coalesce(p_color, '')));
  clean_name text := btrim(coalesce(p_name, ''));
begin
  select * into t from public.teams where id = p_team_id;
  if not found then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;
  perform private.require_team_organizer(t.game_id);

  if char_length(clean_name) not between 1 and 30 then
    raise exception 'invalid_team_name' using errcode = '22023';
  end if;
  if clean_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'invalid_color' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.teams
    where game_id = t.game_id and color = clean_color and id <> t.id
  ) then
    raise exception 'color_taken' using errcode = 'P0001';
  end if;

  update public.teams set name = clean_name, color = clean_color where id = t.id;

  if p_captain_id is null then
    update public.teams set captain_id = null where id = t.id;
  elsif p_captain_id is distinct from t.captain_id then
    perform private.assign_captain(t.id, t.game_id, p_captain_id);
  end if;

  perform private.touch_teams(t.game_id);
  select * into t from public.teams where id = t.id;
  return t;
end;
$$;

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

  -- team_players cascade: its players return to "unassigned".
  delete from public.teams where id = t.id;
  update public.games set draft_active = false where id = t.game_id;
  perform private.touch_teams(t.game_id);
end;
$$;

create or replace function public.move_player(p_game_id uuid, p_player_id uuid, p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  was_locked boolean;
begin
  perform private.require_team_organizer(p_game_id);
  perform private.require_going(p_game_id, p_player_id);

  select is_locked into was_locked
  from public.team_players
  where game_id = p_game_id and player_id = p_player_id;

  if p_team_id is not null and not exists (
    select 1 from public.teams where id = p_team_id and game_id = p_game_id
  ) then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;

  delete from public.team_players where game_id = p_game_id and player_id = p_player_id;

  if p_team_id is not null then
    insert into public.team_players (team_id, game_id, player_id, is_locked)
    values (p_team_id, p_game_id, p_player_id, coalesce(was_locked, false));
  end if;

  perform private.fix_captains(p_game_id);
  perform private.touch_teams(p_game_id);
end;
$$;

-- Applies a server-computed split atomically. Locked players are never moved.
-- p_assignments: [{"player_id": uuid, "team_id": uuid}, ...]
create or replace function public.apply_assignments(p_game_id uuid, p_assignments jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_team_organizer(p_game_id);

  if jsonb_typeof(p_assignments) is distinct from 'array' then
    raise exception 'invalid_assignments' using errcode = '22023';
  end if;

  if exists (
       select 1 from jsonb_to_recordset(p_assignments) as a(player_id uuid, team_id uuid)
       where a.player_id is null or a.team_id is null
     )
     or exists (
       select a.player_id
       from jsonb_to_recordset(p_assignments) as a(player_id uuid, team_id uuid)
       group by a.player_id
       having count(*) > 1
     ) then
    raise exception 'invalid_assignments' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_assignments) as a(player_id uuid, team_id uuid)
    where not exists (select 1 from public.teams t where t.id = a.team_id and t.game_id = p_game_id)
  ) then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_assignments) as a(player_id uuid, team_id uuid)
    where not exists (
      select 1 from public.signups s
      where s.game_id = p_game_id and s.player_id = a.player_id and s.status = 'going'
    )
  ) then
    raise exception 'player_not_going' using errcode = 'P0001';
  end if;

  delete from public.team_players where game_id = p_game_id and not is_locked;

  insert into public.team_players (team_id, game_id, player_id)
  select a.team_id, p_game_id, a.player_id
  from jsonb_to_recordset(p_assignments) as a(player_id uuid, team_id uuid)
  on conflict (game_id, player_id) do nothing; -- locked players keep their team

  perform private.fix_captains(p_game_id);
  perform private.touch_teams(p_game_id);
end;
$$;

-- Late arrival: into the team with the fewest players. Ties are broken by
-- p_team_order (weakest team first, computed in TS by playerStrength), then sort_order.
create or replace function public.add_to_smallest_team(
  p_game_id uuid,
  p_player_id uuid,
  p_team_order uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  perform private.require_team_organizer(p_game_id);
  perform private.require_going(p_game_id, p_player_id);

  if exists (
    select 1 from public.team_players where game_id = p_game_id and player_id = p_player_id
  ) then
    raise exception 'already_in_team' using errcode = 'P0001';
  end if;

  select t.id into target
  from public.teams t
  left join public.team_players tp on tp.team_id = t.id
  where t.game_id = p_game_id
  group by t.id, t.sort_order
  order by count(tp.player_id),
           coalesce(array_position(p_team_order, t.id), 1000),
           t.sort_order
  limit 1;

  if target is null then
    raise exception 'no_teams' using errcode = 'P0001';
  end if;

  insert into public.team_players (team_id, game_id, player_id, added_late)
  values (target, p_game_id, p_player_id, true);

  perform private.touch_teams(p_game_id);
  return target;
end;
$$;

create or replace function public.set_player_locked(p_game_id uuid, p_player_id uuid, p_locked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_team_organizer(p_game_id);

  update public.team_players
  set is_locked = p_locked
  where game_id = p_game_id and player_id = p_player_id;

  if not found then
    raise exception 'player_not_in_team' using errcode = 'P0001';
  end if;
  perform private.touch_teams(p_game_id);
end;
$$;

create or replace function public.publish_teams(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_team_organizer(p_game_id);
  if not exists (select 1 from public.teams where game_id = p_game_id) then
    raise exception 'no_teams' using errcode = 'P0001';
  end if;
  update public.games set teams_published_at = now() where id = p_game_id;
  perform private.touch_teams(p_game_id);
end;
$$;

create or replace function public.unpublish_teams(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_team_organizer(p_game_id);
  update public.games set teams_published_at = null where id = p_game_id;
  perform private.touch_teams(p_game_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Draft
-- ---------------------------------------------------------------------------
create or replace function public.start_draft(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_team_organizer(p_game_id);
  if (select count(*) from public.teams where game_id = p_game_id) < 2 then
    raise exception 'need_two_teams' using errcode = 'P0001';
  end if;
  if private.unassigned_going_count(p_game_id) = 0 then
    raise exception 'nobody_to_draft' using errcode = 'P0001';
  end if;

  update public.games set draft_active = true, draft_turn = 0 where id = p_game_id;
  perform private.touch_teams(p_game_id);
end;
$$;

-- Captain of the team whose turn it is (or an organizer) picks an unassigned player.
create or replace function public.draft_pick(p_game_id uuid, p_player_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g public.games;
  current_team public.teams;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into g from public.games where id = p_game_id for update;
  if not found or not private.is_group_member(g.group_id) then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;
  if not g.draft_active then
    raise exception 'draft_not_active' using errcode = 'P0001';
  end if;
  if g.status not in ('signup', 'closed', 'teams') then
    raise exception 'game_not_active' using errcode = 'P0001';
  end if;

  select * into current_team
  from public.teams
  where id = private.draft_current_team(p_game_id, g.draft_turn);

  if current_team.captain_id is distinct from uid and not private.is_group_organizer(g.group_id) then
    raise exception 'not_your_turn' using errcode = '42501';
  end if;

  perform private.require_going(p_game_id, p_player_id);
  if exists (
    select 1 from public.team_players where game_id = p_game_id and player_id = p_player_id
  ) then
    raise exception 'player_not_available' using errcode = 'P0001';
  end if;

  insert into public.team_players (team_id, game_id, player_id)
  values (current_team.id, p_game_id, p_player_id);

  update public.games set draft_turn = draft_turn + 1 where id = p_game_id;

  -- Everyone is picked: the draft ends and the lineups become visible.
  if private.unassigned_going_count(p_game_id) = 0 then
    update public.games
    set draft_active = false,
        teams_published_at = coalesce(teams_published_at, now())
    where id = p_game_id;
  end if;

  perform private.touch_teams(p_game_id);
  return current_team.id;
end;
$$;

create or replace function public.end_draft(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_team_organizer(p_game_id);
  update public.games set draft_active = false where id = p_game_id;
  perform private.touch_teams(p_game_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Player level (organizer of a shared group)
-- ---------------------------------------------------------------------------
create or replace function public.set_player_level(p_player_id uuid, p_level integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (
    select 1
    from public.group_members me
    join public.group_members other on other.group_id = me.group_id
    where me.player_id = auth.uid() and me.role = 'organizer' and other.player_id = p_player_id
  ) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if p_level not between 1 and 5 then
    raise exception 'invalid_level' using errcode = '22023';
  end if;
  update public.players set level = p_level where id = p_player_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Keep teams consistent with signups: leaving "going" removes the player from their team
-- ---------------------------------------------------------------------------
create or replace function private.on_signup_left_going()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'going' and new.status <> 'going' then
    delete from public.team_players
    where game_id = new.game_id and player_id = new.player_id;
    update public.teams set captain_id = null
    where game_id = new.game_id and captain_id = new.player_id;
    perform private.touch_teams(new.game_id);
  end if;
  return null;
end;
$$;

create trigger signups_leave_team
  after update of status on public.signups
  for each row execute function private.on_signup_left_going();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.create_team(uuid, text, text, uuid)',
    'public.update_team(uuid, text, text, uuid)',
    'public.delete_team(uuid)',
    'public.move_player(uuid, uuid, uuid)',
    'public.apply_assignments(uuid, jsonb)',
    'public.add_to_smallest_team(uuid, uuid, uuid[])',
    'public.set_player_locked(uuid, uuid, boolean)',
    'public.publish_teams(uuid)',
    'public.unpublish_teams(uuid)',
    'public.start_draft(uuid)',
    'public.draft_pick(uuid, uuid)',
    'public.end_draft(uuid)',
    'public.set_player_level(uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime (games is already published in phase 2)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.teams, public.team_players;
