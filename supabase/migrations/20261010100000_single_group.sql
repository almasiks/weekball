-- One group for the whole app, entry by name only (no invites, no Google).
-- groups / group_members stay (for the future), but the interface no longer has "groups":
-- everything belongs to the default group and every signed-in user is its member.

-- ---------------------------------------------------------------------------
-- The default group (fixed id; DEFAULT_GROUP_ID in src/lib/session.ts)
-- ---------------------------------------------------------------------------
alter table public.groups alter column owner_id drop not null;

insert into public.groups (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Weekly Football')
on conflict (id) do nothing;

create or replace function private.default_group_id()
returns uuid
language sql
immutable
set search_path = ''
as $$
  select '00000000-0000-4000-8000-000000000001'::uuid;
$$;

revoke all on function private.default_group_id() from public;
grant execute on function private.default_group_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Membership: any signed-in user is a member of the default group.
-- (Other groups, if they ever come back, still need a group_members row.)
-- ---------------------------------------------------------------------------
create or replace function private.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (gid = private.default_group_id() and (select auth.uid()) is not null)
      or exists (
        select 1 from public.group_members
        where group_id = gid and player_id = private.my_player_id()
      );
$$;

create or replace function private.shares_group_with(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
      (select auth.uid()) is not null
      and exists (
        select 1 from public.group_members
        where group_id = private.default_group_id() and player_id = pid
      )
    )
    or exists (
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
    select 1 from public.games g
    where g.id = gid and private.is_group_member(g.group_id)
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
    select 1 from public.games g
    where g.id = gid
      and (
        private.is_group_organizer(g.group_id)
        or (private.is_group_member(g.group_id) and (g.teams_published_at is not null or g.draft_active))
      )
  );
$$;

-- The default group starts without an organizer (the first one enters the PIN),
-- so the rule becomes: the LAST organizer can't be removed or demoted.
create or replace function private.ensure_group_has_organizer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'organizer'
     and exists (select 1 from public.groups where id = old.group_id)
     and not exists (
       select 1 from public.group_members
       where group_id = old.group_id and role = 'organizer'
     ) then
    raise exception 'last_organizer' using errcode = 'P0001',
      hint = 'A group must have at least one organizer';
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Entry: "Как тебя зовут?"
-- ---------------------------------------------------------------------------
-- Names are compared without case, extra spaces and ё/е.
create or replace function private.name_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'))), 'ё', 'е');
$$;

revoke all on function private.name_key(text) from public;

-- First visit: creates the player of this (anonymous) account in the default group.
--  * the name belongs to someone with an account, or to an archived player -> 'name_taken';
--  * the name is in the roster without an account (the organizer added it) -> this account
--    takes that player over, with all of its history ("that's me");
--  * otherwise a new player is created.
-- Calling it again for an account that already has a player just returns that player.
create or replace function public.enter_app(p_name text)
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean text := private.clean_player_name(p_name);
  p public.players;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into p from public.players where user_id = uid;

  if p.id is null then
    -- One entry at a time: two people must not get the same name.
    perform pg_advisory_xact_lock(hashtext('weekball.enter_app'));

    select pl.* into p
    from public.players pl
    join public.group_members m on m.player_id = pl.id and m.group_id = private.default_group_id()
    where private.name_key(pl.name) = private.name_key(clean)
    order by (pl.user_id is not null) desc, (pl.archived_at is not null) desc
    limit 1;

    if p.id is not null then
      if p.user_id is not null or p.archived_at is not null then
        raise exception 'name_taken' using errcode = 'P0001';
      end if;
      update public.players set user_id = uid where id = p.id returning * into p;
    else
      insert into public.players (user_id, name) values (uid, clean) returning * into p;
    end if;
  end if;

  insert into public.group_members (group_id, player_id, role)
  values (private.default_group_id(), p.id, 'player')
  on conflict (group_id, player_id) do nothing;

  return p;
end;
$$;

-- Profile: change my own name (same uniqueness rule).
create or replace function public.rename_me(p_name text)
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.my_player_id();
  clean text := private.clean_player_name(p_name);
  p public.players;
begin
  if pid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(hashtext('weekball.enter_app'));
  if exists (
    select 1
    from public.players pl
    join public.group_members m on m.player_id = pl.id and m.group_id = private.default_group_id()
    where pl.id <> pid and private.name_key(pl.name) = private.name_key(clean)
  ) then
    raise exception 'name_taken' using errcode = 'P0001';
  end if;
  update public.players set name = clean where id = pid returning * into p;
  return p;
end;
$$;

revoke all on function public.enter_app(text) from public, anon;
revoke all on function public.rename_me(text) from public, anon;
grant execute on function public.enter_app(text) to authenticated;
grant execute on function public.rename_me(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Groups can no longer be created or joined from the app.
-- (The functions stay for the future and for the database tests.)
-- ---------------------------------------------------------------------------
revoke execute on function public.create_group(text, text) from authenticated, anon, public;
revoke execute on function public.join_group(text, text, uuid) from authenticated, anon, public;
revoke execute on function public.group_claimable_players(text) from authenticated, anon, public;
