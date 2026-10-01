-- Roster mode: players without accounts.
-- players.id is no longer auth.uid(); an account links to a player via players.user_id.
-- Every function/policy that identified "me" by auth.uid() now uses private.my_player_id().

-- ---------------------------------------------------------------------------
-- players: decouple from auth.users
-- ---------------------------------------------------------------------------
alter table public.players drop constraint players_id_fkey;
alter table public.players alter column id set default gen_random_uuid();
alter table public.players
  add column user_id uuid unique references auth.users (id) on delete set null,
  add column created_by uuid references public.players (id) on delete set null,
  add column is_regular boolean not null default true,
  add column archived_at timestamptz;

update public.players set user_id = id;

-- "Игрок вечера" (used by the game screen; here so merge_players can move it).
alter table public.games add column mvp_player_id uuid references public.players (id) on delete set null;

-- The player of the signed-in account (null: no player yet).
create or replace function private.my_player_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.players where user_id = (select auth.uid());
$$;

revoke all on function private.my_player_id() from public;
grant execute on function private.my_player_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Membership helpers
-- ---------------------------------------------------------------------------
create or replace function private.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and player_id = private.my_player_id()
  );
$$;

create or replace function private.is_group_organizer(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and player_id = private.my_player_id() and role = 'organizer'
  );
$$;

create or replace function private.shares_group_with(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members other on other.group_id = me.group_id
    where me.player_id = private.my_player_id() and other.player_id = pid
  );
$$;

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
    where g.id = gid and m.player_id = private.my_player_id()
  );
$$;

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
      on m.group_id = g.group_id and m.player_id = private.my_player_id()
    where g.id = gid
      and (m.role = 'organizer' or g.teams_published_at is not null or g.draft_active)
  );
$$;

-- Organizer of a group that this player belongs to.
create or replace function private.can_manage_player(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members other on other.group_id = me.group_id
    where me.player_id = private.my_player_id() and me.role = 'organizer' and other.player_id = pid
  );
$$;

revoke all on function private.can_manage_player(uuid) from public;
grant execute on function private.can_manage_player(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- players policies: "me" = user_id
-- ---------------------------------------------------------------------------
drop policy "players: read self and groupmates" on public.players;
drop policy "players: update self" on public.players;

create policy "players: read self and groupmates"
  on public.players for select to authenticated
  using (user_id = (select auth.uid()) or private.shares_group_with(id));

create policy "players: update self"
  on public.players for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Account -> player
-- ---------------------------------------------------------------------------
create or replace function private.clean_player_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  clean text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if char_length(clean) not between 1 and 40 then
    raise exception 'invalid_player_name' using errcode = '22023';
  end if;
  return clean;
end;
$$;

revoke all on function private.clean_player_name(text) from public;

-- The caller's player, created on first use; the name is updated when given.
create or replace function private.ensure_my_player(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  pid uuid;
  clean text := private.clean_player_name(p_name);
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select id into pid from public.players where user_id = uid;
  if pid is null then
    insert into public.players (user_id, name) values (uid, clean) returning id into pid;
  else
    update public.players set name = clean where id = pid;
  end if;
  return pid;
end;
$$;

revoke all on function private.ensure_my_player(text) from public;

create or replace function public.create_group(group_name text, player_name text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_group_name text := btrim(coalesce(group_name, ''));
  pid uuid;
  new_group public.groups;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if char_length(clean_group_name) not between 1 and 60 then
    raise exception 'invalid_group_name' using errcode = '22023';
  end if;

  pid := private.ensure_my_player(player_name);

  loop
    begin
      insert into public.groups (name, owner_id)
      values (clean_group_name, pid)
      returning * into new_group;
      exit;
    exception when unique_violation then
      -- invite code collision: retry
    end;
  end loop;

  insert into public.group_members (group_id, player_id, role)
  values (new_group.id, pid, 'organizer');

  return new_group;
end;
$$;

-- Names of the group roster that no account has claimed yet (invite page).
create or replace function public.group_claimable_players(p_code text)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name
  from public.groups g
  join public.group_members m on m.group_id = g.id
  join public.players p on p.id = m.player_id
  where g.invite_code = upper(btrim(coalesce(p_code, '')))
    and p.user_id is null
    and p.archived_at is null
    and p.is_regular
  order by p.name;
$$;

revoke all on function public.group_claimable_players(text) from public;
grant execute on function public.group_claimable_players(text) to anon, authenticated;

-- Join by invite. p_claim_player_id: "Это я" — link this account to a roster name
-- (keeps all of that player's history). Without it a new player is created.
drop function public.join_group(text, text);

create function public.join_group(code text, player_name text, p_claim_player_id uuid default null)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  target public.groups;
  pid uuid;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into target from public.groups
  where invite_code = upper(btrim(coalesce(code, '')));
  if not found then
    raise exception 'invalid_invite_code' using errcode = 'P0002';
  end if;

  select id into pid from public.players where user_id = uid;

  if p_claim_player_id is not null then
    if pid is not null and pid <> p_claim_player_id then
      raise exception 'already_linked' using errcode = 'P0001';
    end if;
    if pid is null then
      update public.players p
      set user_id = uid
      where p.id = p_claim_player_id
        and p.user_id is null
        and p.archived_at is null
        and exists (
          select 1 from public.group_members m
          where m.group_id = target.id and m.player_id = p.id
        )
      returning p.id into pid;
      if pid is null then
        raise exception 'player_not_available' using errcode = 'P0001';
      end if;
    end if;
  else
    pid := private.ensure_my_player(player_name);
  end if;

  insert into public.group_members (group_id, player_id, role)
  values (target.id, pid, 'player')
  on conflict (group_id, player_id) do nothing;

  return target;
end;
$$;

revoke all on function public.join_group(text, text, uuid) from public, anon;
grant execute on function public.join_group(text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Signups as "me"
-- ---------------------------------------------------------------------------
create or replace function public.set_signup(p_game_id uuid, wants_to_come boolean)
returns public.signup_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.my_player_id();
  g public.games;
  previous public.signup_status;
  going_count integer;
  result public.signup_status;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into g from public.games where id = p_game_id for update;
  if not found or pid is null or not private.is_group_member(g.group_id) then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;
  if g.status <> 'signup' then
    raise exception 'signup_closed' using errcode = 'P0001';
  end if;

  select status into previous
  from public.signups
  where game_id = p_game_id and player_id = pid;

  if wants_to_come then
    if previous in ('going', 'waitlist') then
      return previous;
    end if;

    select count(*) into going_count
    from public.signups
    where game_id = p_game_id and status = 'going';

    result := case when going_count < g.max_players then 'going' else 'waitlist' end;

    insert into public.signups (game_id, player_id, status)
    values (p_game_id, pid, result)
    on conflict (game_id, player_id) do update
      set status = excluded.status,
          arrival = 'pending',
          late_minutes = null,
          created_at = now(),
          updated_at = now();
  else
    result := 'declined';

    insert into public.signups (game_id, player_id, status)
    values (p_game_id, pid, 'declined')
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
  pid uuid := private.my_player_id();
  g public.games;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into g from public.games where id = p_game_id;
  if not found or pid is null or not private.is_group_member(g.group_id) then
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
  where game_id = p_game_id and player_id = pid and status = 'going';

  if not found then
    raise exception 'not_going' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Draft / levels / events as "me"
-- ---------------------------------------------------------------------------
create or replace function public.draft_pick(p_game_id uuid, p_player_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.my_player_id();
  g public.games;
  current_team public.teams;
begin
  if auth.uid() is null then
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

  if current_team.captain_id is distinct from me and not private.is_group_organizer(g.group_id) then
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
  if not private.can_manage_player(p_player_id) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if p_level not between 1 and 5 then
    raise exception 'invalid_level' using errcode = '22023';
  end if;
  update public.players set level = p_level where id = p_player_id;
end;
$$;

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
    v_period, v_second, private.my_player_id()
  )
  on conflict (id) do nothing
  returning * into e;

  if e.id is null then
    select * into e from public.events where id = v_id;
    return e;
  end if;

  if v_type in ('goal', 'own_goal') then
    select * into m from public.matches where id = m.id;
    if m.goal_limit is not null
       and m.status in ('live', 'break')
       and greatest(m.score_a, m.score_b) >= m.goal_limit then
      update public.matches
      set status = 'finished',
          timer_status = 'finished',
          timer_elapsed_ms = v_second::bigint * 1000,
          timer_started_at = null,
          finished_at = now(),
          finish_reason = 'goal_limit',
          finish_event_id = v_id
      where id = m.id;
    end if;
  end if;

  return e;
end;
$$;

-- ---------------------------------------------------------------------------
-- Roster management (organizer)
-- ---------------------------------------------------------------------------
create or replace function public.add_players(p_group_id uuid, p_names text[])
returns setof public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw text;
  p public.players;
begin
  if not private.is_group_organizer(p_group_id) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if coalesce(array_length(p_names, 1), 0) > 100 then
    raise exception 'too_many_names' using errcode = '22023';
  end if;

  foreach raw in array coalesce(p_names, array[]::text[]) loop
    continue when btrim(coalesce(raw, '')) = '';
    insert into public.players (name, created_by)
    values (private.clean_player_name(raw), private.my_player_id())
    returning * into p;
    insert into public.group_members (group_id, player_id, role) values (p_group_id, p.id, 'player');
    return next p;
  end loop;
end;
$$;

create or replace function public.rename_player(p_player_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_player(p_player_id) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  update public.players set name = private.clean_player_name(p_name) where id = p_player_id;
end;
$$;

create or replace function public.set_player_position(p_player_id uuid, p_position public.player_position)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_player(p_player_id) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  update public.players set position = p_position where id = p_player_id;
end;
$$;

-- Archive: hidden from the roster, statistics are kept.
create or replace function public.set_player_archived(p_player_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_player(p_player_id) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if p_archived and p_player_id = private.my_player_id() then
    raise exception 'cannot_archive_self' using errcode = 'P0001';
  end if;
  update public.players
  set archived_at = case when p_archived then coalesce(archived_at, now()) end,
      is_regular = case when p_archived then is_regular else true end
  where id = p_player_id;
end;
$$;

create or replace function public.unlink_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_player(p_player_id) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if p_player_id = private.my_player_id() then
    raise exception 'cannot_unlink_self' using errcode = 'P0001';
  end if;
  update public.players set user_id = null where id = p_player_id;
end;
$$;

-- Merge duplicates: everything of p_from moves to p_to, then p_from is deleted.
create or replace function public.merge_players(p_from uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.players;
  t public.players;
begin
  if p_from = p_to then
    raise exception 'invalid_merge' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.group_members me
    join public.group_members a on a.group_id = me.group_id and a.player_id = p_from
    join public.group_members b on b.group_id = me.group_id and b.player_id = p_to
    where me.player_id = private.my_player_id() and me.role = 'organizer'
  ) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;

  select * into f from public.players where id = p_from for update;
  select * into t from public.players where id = p_to for update;
  if f.user_id is not null and t.user_id is not null then
    raise exception 'both_have_accounts' using errcode = 'P0001';
  end if;

  -- Signups: keep the "best" status when both have one for a game.
  update public.signups s
  set status = case
        when s.status = 'going' or x.status = 'going' then 'going'::public.signup_status
        when s.status = 'waitlist' or x.status = 'waitlist' then 'waitlist'::public.signup_status
        else 'declined'::public.signup_status end,
      arrival = case
        when s.arrival = 'arrived' or x.arrival = 'arrived' then 'arrived'::public.arrival_status
        else s.arrival end,
      late_minutes = case
        when s.arrival = 'arrived' or x.arrival = 'arrived' then null
        else s.late_minutes end
  from public.signups x
  where s.player_id = p_to and x.player_id = p_from and x.game_id = s.game_id;
  delete from public.signups x
  where x.player_id = p_from
    and exists (select 1 from public.signups s where s.player_id = p_to and s.game_id = x.game_id);
  update public.signups set player_id = p_to where player_id = p_from;

  -- Lineups: one team per game.
  delete from public.team_players x
  where x.player_id = p_from
    and exists (select 1 from public.team_players s where s.player_id = p_to and s.game_id = x.game_id);
  update public.team_players set player_id = p_to where player_id = p_from;
  update public.teams set captain_id = p_to where captain_id = p_from;

  -- Events and other references.
  update public.events set player_id = p_to where player_id = p_from;
  update public.events set assist_player_id = p_to where assist_player_id = p_from;
  update public.events set player_in_id = p_to where player_in_id = p_from;
  update public.events set created_by = p_to where created_by = p_from;
  update public.groups set owner_id = p_to where owner_id = p_from;
  update public.games set mvp_player_id = p_to where mvp_player_id = p_from;
  update public.players set created_by = p_to where created_by = p_from;

  -- Memberships: keep the higher role.
  update public.group_members s
  set role = 'organizer'
  from public.group_members x
  where s.player_id = p_to and x.player_id = p_from and x.group_id = s.group_id and x.role = 'organizer';
  delete from public.group_members x
  where x.player_id = p_from
    and exists (select 1 from public.group_members s where s.player_id = p_to and s.group_id = x.group_id);
  update public.group_members set player_id = p_to where player_id = p_from;

  -- Rating history is rebuilt by the next recalculation.
  update public.games g
  set stats_processed_at = null
  where g.status = 'finished'
    and g.group_id in (select group_id from public.group_members where player_id = p_to);
  delete from public.rating_history where player_id = p_from;

  -- The account moves with the merge.
  if f.user_id is not null then
    update public.players set user_id = null where id = p_from;
    update public.players set user_id = f.user_id where id = p_to;
  end if;

  delete from public.players where id = p_from;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attendance (organizer): "кто пришёл"
-- ---------------------------------------------------------------------------
create or replace function public.set_attendance(p_game_id uuid, p_player_id uuid, p_present boolean)
returns public.signups
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.games;
  s public.signups;
begin
  g := private.require_game_scorer(p_game_id);
  if not exists (
    select 1 from public.group_members where group_id = g.group_id and player_id = p_player_id
  ) then
    raise exception 'player_not_in_group' using errcode = 'P0001';
  end if;

  -- The organizer may exceed max_players: on the pitch reality wins.
  insert into public.signups (game_id, player_id, status, arrival)
  values (
    p_game_id, p_player_id, 'going',
    case when p_present then 'arrived'::public.arrival_status else 'pending'::public.arrival_status end
  )
  on conflict (game_id, player_id) do update
    set status = case when p_present then 'going'::public.signup_status else public.signups.status end,
        arrival = excluded.arrival,
        late_minutes = null,
        updated_at = now()
  returning * into s;
  return s;
end;
$$;

-- New player on the spot (2 taps). p_player_id lets the offline queue retry safely.
create or replace function public.create_player_quick(
  p_game_id uuid,
  p_name text,
  p_is_regular boolean default true,
  p_position public.player_position default null,
  p_level integer default null,
  p_player_id uuid default null
)
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.games;
  p public.players;
begin
  g := private.require_game_scorer(p_game_id);

  if p_player_id is not null then
    select * into p from public.players where id = p_player_id;
    -- A retry may only find the player it created in this group, never someone else's.
    if p.id is not null and not exists (
      select 1 from public.group_members where group_id = g.group_id and player_id = p.id
    ) then
      raise exception 'player_not_in_group' using errcode = 'P0001';
    end if;
  end if;

  if p.id is null then
    if p_level is not null and p_level not between 1 and 5 then
      raise exception 'invalid_level' using errcode = '22023';
    end if;
    insert into public.players (id, name, created_by, is_regular, position, level)
    values (
      coalesce(p_player_id, gen_random_uuid()), private.clean_player_name(p_name),
      private.my_player_id(), coalesce(p_is_regular, true), p_position, coalesce(p_level, 3)
    )
    returning * into p;
  end if;

  insert into public.group_members (group_id, player_id, role)
  values (g.group_id, p.id, 'player')
  on conflict (group_id, player_id) do nothing;

  insert into public.signups (game_id, player_id, status, arrival)
  values (p_game_id, p.id, 'going', 'arrived')
  on conflict (game_id, player_id) do update set status = 'going', arrival = 'arrived', late_minutes = null;

  return p;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.add_players(uuid, text[])',
    'public.rename_player(uuid, text)',
    'public.set_player_position(uuid, public.player_position)',
    'public.set_player_archived(uuid, boolean)',
    'public.unlink_player(uuid)',
    'public.merge_players(uuid, uuid)',
    'public.set_attendance(uuid, uuid, boolean)',
    'public.create_player_quick(uuid, text, boolean, public.player_position, integer, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
