-- Phase 1: players, groups, group_members + RLS + group RPCs.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.player_position as enum ('gk', 'def', 'mid', 'fwd');
create type public.member_role as enum ('organizer', 'player');

-- ---------------------------------------------------------------------------
-- Private schema for helpers (not exposed through the Data API)
-- ---------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated;

-- Short, unambiguous invite code (no 0/O/1/I). 32 symbols ^ 8 chars ≈ 10^12.
create or replace function private.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid());
  -- Skip bytes 6 and 8: they carry the UUID v4 version/variant bits.
  random_positions constant int[] := array[0, 1, 2, 3, 4, 5, 9, 10];
  pos int;
  code text := '';
begin
  foreach pos in array random_positions loop
    code := code || substr(alphabet, (get_byte(bytes, pos) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.players (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  avatar_url text,
  position public.player_position,
  level smallint not null default 3 check (level between 1 and 5),
  rating integer not null default 1000,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  invite_code text not null unique default private.generate_invite_code(),
  owner_id uuid not null references public.players (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  role public.member_role not null default 'player',
  joined_at timestamptz not null default now(),
  primary key (group_id, player_id)
);

create index group_members_player_id_idx on public.group_members (player_id);
create index groups_owner_id_idx on public.groups (owner_id);

-- ---------------------------------------------------------------------------
-- RLS helpers (security definer to avoid recursive policy evaluation)
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
    where group_id = gid and player_id = (select auth.uid())
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
    where group_id = gid
      and player_id = (select auth.uid())
      and role = 'organizer'
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
    where me.player_id = (select auth.uid()) and other.player_id = pid
  );
$$;

revoke all on function private.generate_invite_code() from public;
revoke all on function private.is_group_member(uuid) from public;
revoke all on function private.is_group_organizer(uuid) from public;
revoke all on function private.shares_group_with(uuid) from public;
grant execute on function private.is_group_member(uuid) to authenticated;
grant execute on function private.is_group_organizer(uuid) to authenticated;
grant execute on function private.shares_group_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: clients never insert/delete directly; updates are column-limited
-- ---------------------------------------------------------------------------
revoke all on public.players, public.groups, public.group_members from anon;
revoke insert, update, delete, truncate on public.players, public.groups, public.group_members from authenticated;

grant select on public.players, public.groups, public.group_members to authenticated;
-- level and rating are managed by the organizer / stats in later phases.
grant update (name, avatar_url, position) on public.players to authenticated;
grant update (name) on public.groups to authenticated;
grant update (role) on public.group_members to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.players enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy "players: read self and groupmates"
  on public.players for select to authenticated
  using (id = (select auth.uid()) or private.shares_group_with(id));

create policy "players: update self"
  on public.players for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "groups: members read"
  on public.groups for select to authenticated
  using (private.is_group_member(id));

create policy "groups: organizers update"
  on public.groups for update to authenticated
  using (private.is_group_organizer(id))
  with check (private.is_group_organizer(id));

create policy "group_members: members read"
  on public.group_members for select to authenticated
  using (private.is_group_member(group_id));

create policy "group_members: organizers change roles"
  on public.group_members for update to authenticated
  using (private.is_group_organizer(group_id))
  with check (private.is_group_organizer(group_id));

-- ---------------------------------------------------------------------------
-- A group must always keep at least one organizer
-- ---------------------------------------------------------------------------
create or replace function private.ensure_group_has_organizer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.groups where id = old.group_id)
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

create trigger group_members_keep_organizer
  after update of role or delete on public.group_members
  for each row execute function private.ensure_group_has_organizer();

-- ---------------------------------------------------------------------------
-- RPC: create_group / join_group
-- ---------------------------------------------------------------------------
create or replace function private.upsert_player(uid uuid, player_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := btrim(coalesce(player_name, ''));
begin
  if char_length(clean_name) not between 1 and 40 then
    raise exception 'invalid_player_name' using errcode = '22023';
  end if;
  insert into public.players (id, name)
  values (uid, clean_name)
  on conflict (id) do update set name = excluded.name;
end;
$$;

revoke all on function private.upsert_player(uuid, text) from public;

create or replace function public.create_group(group_name text, player_name text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean_group_name text := btrim(coalesce(group_name, ''));
  new_group public.groups;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if char_length(clean_group_name) not between 1 and 60 then
    raise exception 'invalid_group_name' using errcode = '22023';
  end if;

  perform private.upsert_player(uid, player_name);

  -- Retry on the (very unlikely) invite code collision.
  loop
    begin
      insert into public.groups (name, owner_id)
      values (clean_group_name, uid)
      returning * into new_group;
      exit;
    exception when unique_violation then
      -- try again with a fresh default invite code
    end;
  end loop;

  insert into public.group_members (group_id, player_id, role)
  values (new_group.id, uid, 'organizer');

  return new_group;
end;
$$;

create or replace function public.join_group(code text, player_name text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  target public.groups;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into target
  from public.groups
  where invite_code = upper(btrim(coalesce(code, '')));

  if not found then
    raise exception 'invalid_invite_code' using errcode = 'P0002';
  end if;

  perform private.upsert_player(uid, player_name);

  insert into public.group_members (group_id, player_id, role)
  values (target.id, uid, 'player')
  on conflict (group_id, player_id) do nothing;

  return target;
end;
$$;

revoke all on function public.create_group(text, text) from public, anon;
revoke all on function public.join_group(text, text) from public, anon;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.join_group(text, text) to authenticated;
