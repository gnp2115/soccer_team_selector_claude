-- Player database for the Soccer Team Selector, version 2.
--
-- Security model, in plain terms:
--   * The browser cannot read or write any table directly. Every table has Row
--     Level Security on with no policies, and all table privileges are revoked
--     from the public (anon) and signed-in roles.
--   * Instead, the browser calls a short list of named functions below.
--     lookup_players and admin_verify are open to anyone. Every admin_ function
--     checks the shared database password inside the database before doing
--     anything, so the check cannot be skipped by calling the API directly.
--   * The password is stored only as a bcrypt hash, in a private schema the
--     public key cannot reach. It is set separately in the SQL editor and never
--     appears in the code, GitHub or Vercel.
--   * Game counts are calculated from recorded games, never typed in.
--   * Contact details (email, phone) and the team a player supports are only
--     returned by the password functions, never by the open lookup.
--
-- Safe to re-run: nothing here deletes data. Re-running it is also how the
-- live database is upgraded (it adds any missing columns and replaces the
-- functions). Run 000_remove_v1.sql first, once, only when upgrading from the
-- first version.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Private schema: the password hash and the password check. Not exposed.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.settings (
  id                  smallint primary key default 1 check (id = 1),
  admin_password_hash text not null
);
revoke all on private.settings from public, anon, authenticated;

create or replace function private.check_password(p_password text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored text;
begin
  select admin_password_hash into stored from private.settings where id = 1;
  if stored is null
     or p_password is null
     or extensions.crypt(p_password, stored) <> stored then
    -- Slow down anyone trying to guess.
    perform pg_sleep(1);
    return false;
  end if;
  return true;
end;
$$;
revoke all on function private.check_password(text) from public, anon, authenticated;

create or replace function private.require_admin(p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.check_password(p_password) then
    raise exception 'Wrong password' using errcode = '28P01';
  end if;
end;
$$;
revoke all on function private.require_admin(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  sport       text not null default 'soccer'
              check (sport in ('soccer', 'basketball', 'flag_football', 'volleyball')),
  first_name  text not null check (char_length(btrim(first_name)) between 1 and 30),
  last_name   text not null default '' check (char_length(last_name) <= 30),
  -- "marlo silva": lower-cased full name, single spaces. What uniqueness checks.
  name_key    text generated always as (
                lower(btrim(regexp_replace(first_name || ' ' || last_name, '\s+', ' ', 'g')))
              ) stored,
  skill       smallint not null check (skill between 1 and 5),
  positions   text[] not null check (cardinality(positions) between 1 and 4),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint soccer_positions_valid check (
    sport <> 'soccer'
    or positions <@ array['Goalkeeper', 'Defender', 'Midfielder', 'Attacker']::text[]
  ),
  constraint players_unique_name unique (sport, name_key)
);

-- Gender: M or W. Empty for players saved before it was recorded; the app
-- shows those as "gender missing". Added this way so re-running upgrades the
-- live table without touching any rows.
alter table public.players
  add column if not exists gender text check (gender in ('M', 'W'));

-- Profile fields, all optional. A nickname is unique (in any capitals) and is
-- enough on its own to find a player. Photos are small square JPEGs, shrunk in
-- the browser and stored here as text, so no separate file store is needed.
alter table public.players
  add column if not exists nickname text
    constraint players_nickname_check
    check (nickname is null or char_length(btrim(nickname)) between 1 and 20),
  add column if not exists supported_team text
    constraint players_supported_team_check
    check (supported_team is null or char_length(supported_team) <= 40),
  add column if not exists email text
    constraint players_email_check
    check (email is null or (char_length(email) <= 100
                             and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  add column if not exists phone text
    constraint players_phone_check
    check (phone is null or phone ~ '^[0-9+(). -]{4,30}$'),
  add column if not exists photo text
    constraint players_photo_check
    check (photo is null or (photo like 'data:image/%' and char_length(photo) <= 200000));

create unique index if not exists players_unique_nickname
  on public.players (sport, lower(btrim(nickname)))
  where nickname is not null;

create index if not exists players_first_name_idx
  on public.players (sport, lower(btrim(first_name)));

create table if not exists public.games (
  id         uuid primary key default gen_random_uuid(),
  sport      text not null default 'soccer',
  played_at  timestamptz not null,
  created_at timestamptz not null default now()
);

-- Where the game was played. Optional.
alter table public.games
  add column if not exists location text
    constraint games_location_check
    check (location is null or char_length(location) <= 80);

create table if not exists public.game_players (
  game_id   uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  primary key (game_id, player_id)
);

create index if not exists game_players_player_idx on public.game_players (player_id);

-- Lock every table. No policies means nothing is allowed directly.
alter table public.players      enable row level security;
alter table public.games        enable row level security;
alter table public.game_players enable row level security;
revoke all on public.players, public.games, public.game_players from anon, authenticated;

-- Keep updated_at honest.
create or replace function public.touch_players_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists players_touch_updated_at on public.players;
create trigger players_touch_updated_at
  before update on public.players
  for each row execute function public.touch_players_updated_at();

-- ---------------------------------------------------------------------------
-- Open to anyone
-- ---------------------------------------------------------------------------

-- Return only the players whose names were asked for: by full name, nickname,
-- or first name alone. There is no way to list the whole database from here,
-- and contact details are never returned.
-- (Dropped first because its output gained columns; it holds no data.)
drop function if exists public.lookup_players(text[]);
create or replace function public.lookup_players(p_names text[])
returns table (
  id uuid, first_name text, last_name text, skill smallint, positions text[], gender text,
  nickname text, photo text
)
language sql
stable
security definer
set search_path = ''
as $$
  with wanted as (
    select lower(btrim(regexp_replace(n, '\s+', ' ', 'g'))) as k
    from unnest((coalesce(p_names, '{}'::text[]))[1:60]) as n
  )
  select p.id, p.first_name, p.last_name, p.skill, p.positions, p.gender, p.nickname, p.photo
  from public.players p
  where p.sport = 'soccer'
    and (p.name_key in (select k from wanted)
         or lower(btrim(p.first_name)) in (select k from wanted)
         or lower(btrim(p.nickname)) in (select k from wanted));
$$;

create or replace function public.admin_verify(p_password text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.check_password(p_password);
$$;

-- ---------------------------------------------------------------------------
-- Password holders only
-- ---------------------------------------------------------------------------

-- (Dropped first because its output gained a column; it holds no data.)
drop function if exists public.admin_list_players(text);
create or replace function public.admin_list_players(p_password text)
returns table (
  id uuid, first_name text, last_name text, skill smallint, positions text[], gender text,
  nickname text, photo text, supported_team text, email text, phone text,
  games_played bigint, last_played_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_admin(p_password);
  return query
    select p.id, p.first_name, p.last_name, p.skill, p.positions, p.gender,
           p.nickname, p.photo, p.supported_team, p.email, p.phone,
           count(gp.game_id), max(g.played_at)
    from public.players p
    left join public.game_players gp on gp.player_id = p.id
    left join public.games g on g.id = gp.game_id
    where p.sport = 'soccer'
    group by p.id
    order by p.first_name, p.last_name;
end;
$$;

-- Add players, or update them when the name already exists. For a saved
-- player, any detail left out (gender, nickname, team, contact, photo) keeps
-- the value already saved.
create or replace function public.admin_upsert_players(p_password text, p_players jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved integer;
begin
  perform private.require_admin(p_password);
  if jsonb_typeof(p_players) <> 'array'
     or jsonb_array_length(p_players) not between 1 and 60 then
    raise exception 'Send between 1 and 60 players';
  end if;

  insert into public.players as p (
    sport, first_name, last_name, skill, positions, gender,
    nickname, supported_team, email, phone, photo
  )
  select distinct on (lower(btrim(regexp_replace(
           (x->>'first_name') || ' ' || coalesce(x->>'last_name', ''), '\s+', ' ', 'g'))))
         'soccer',
         btrim(x->>'first_name'),
         btrim(coalesce(x->>'last_name', '')),
         (x->>'skill')::smallint,
         array(select jsonb_array_elements_text(x->'positions')),
         x->>'gender',
         nullif(btrim(x->>'nickname'), ''),
         nullif(btrim(x->>'supported_team'), ''),
         nullif(btrim(x->>'email'), ''),
         nullif(btrim(x->>'phone'), ''),
         nullif(x->>'photo', '')
  from jsonb_array_elements(p_players) as x
  on conflict (sport, name_key) do update
    set first_name = excluded.first_name,
        last_name  = excluded.last_name,
        skill      = excluded.skill,
        positions  = excluded.positions,
        gender         = coalesce(excluded.gender, p.gender),
        nickname       = coalesce(excluded.nickname, p.nickname),
        supported_team = coalesce(excluded.supported_team, p.supported_team),
        email          = coalesce(excluded.email, p.email),
        phone          = coalesce(excluded.phone, p.phone),
        photo          = coalesce(excluded.photo, p.photo);

  get diagnostics saved = row_count;
  return saved;
end;
$$;

-- Edit one player in place, so their game history stays with them on a rename.
-- The player comes as one JSON object, and only the fields sent are changed, so
-- adding a field later does not change this function's shape. Sending a field
-- as empty clears it (except gender, which can only be set).
-- (Older versions with a list of parameters are dropped so only this one exists.)
drop function if exists public.admin_update_player(text, uuid, text, text, smallint, text[]);
drop function if exists public.admin_update_player(text, uuid, text, text, smallint, text[], text);
create or replace function public.admin_update_player(p_password text, p_id uuid, p_player jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin(p_password);
  if jsonb_typeof(p_player) is distinct from 'object' then
    raise exception 'Send the player as one object';
  end if;
  update public.players
     set first_name     = case when p_player ? 'first_name'
                               then btrim(p_player->>'first_name') else first_name end,
         last_name      = case when p_player ? 'last_name'
                               then btrim(coalesce(p_player->>'last_name', '')) else last_name end,
         skill          = case when p_player ? 'skill'
                               then (p_player->>'skill')::smallint else skill end,
         positions      = case when p_player ? 'positions'
                               then array(select jsonb_array_elements_text(p_player->'positions'))
                               else positions end,
         gender         = coalesce(p_player->>'gender', gender),
         nickname       = case when p_player ? 'nickname'
                               then nullif(btrim(p_player->>'nickname'), '') else nickname end,
         supported_team = case when p_player ? 'supported_team'
                               then nullif(btrim(p_player->>'supported_team'), '') else supported_team end,
         email          = case when p_player ? 'email'
                               then nullif(btrim(p_player->>'email'), '') else email end,
         phone          = case when p_player ? 'phone'
                               then nullif(btrim(p_player->>'phone'), '') else phone end,
         photo          = case when p_player ? 'photo'
                               then nullif(p_player->>'photo', '') else photo end
   where id = p_id;
  if not found then
    raise exception 'That player no longer exists';
  end if;
end;
$$;

create or replace function public.admin_remove_player(p_password text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin(p_password);
  delete from public.players where id = p_id;
end;
$$;

-- Save a game, where it was played, and who played. Each player's game count
-- goes up automatically, because counts are calculated from these rows.
-- (The older version without a location is dropped so only this one exists.)
drop function if exists public.admin_record_game(text, timestamptz, uuid[]);
create or replace function public.admin_record_game(
  p_password text, p_played_at timestamptz, p_player_ids uuid[], p_location text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_game uuid;
  counted  integer;
begin
  perform private.require_admin(p_password);
  if p_played_at is null then
    raise exception 'A game needs a date and time';
  end if;
  if p_player_ids is null or cardinality(p_player_ids) not between 1 and 60 then
    raise exception 'A game needs between 1 and 60 saved players';
  end if;

  insert into public.games (played_at, location)
  values (p_played_at, nullif(btrim(p_location), ''))
  returning id into new_game;

  insert into public.game_players (game_id, player_id)
  select new_game, p.id
  from public.players p
  where p.id = any(p_player_ids)
  on conflict do nothing;

  get diagnostics counted = row_count;
  return counted;
end;
$$;

-- (Dropped first because its output gained a column; it holds no data.)
drop function if exists public.admin_list_games(text);
create or replace function public.admin_list_games(p_password text)
returns table (id uuid, played_at timestamptz, players bigint, location text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_admin(p_password);
  return query
    select g.id, g.played_at, count(gp.player_id), g.location
    from public.games g
    left join public.game_players gp on gp.game_id = g.id
    where g.sport = 'soccer'
    group by g.id
    order by g.played_at desc
    limit 20;
end;
$$;

-- Delete a game recorded by mistake. Everyone's count corrects itself.
create or replace function public.admin_remove_game(p_password text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin(p_password);
  delete from public.games where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what. Postgres lets everyone run new functions by default, so
-- revoke that first, then grant only these.
-- ---------------------------------------------------------------------------
revoke all on function public.lookup_players(text[])                          from public;
revoke all on function public.admin_verify(text)                              from public;
revoke all on function public.admin_list_players(text)                        from public;
revoke all on function public.admin_upsert_players(text, jsonb)               from public;
revoke all on function public.admin_update_player(text, uuid, jsonb)          from public;
revoke all on function public.admin_remove_player(text, uuid)                 from public;
revoke all on function public.admin_record_game(text, timestamptz, uuid[], text) from public;
revoke all on function public.admin_list_games(text)                          from public;
revoke all on function public.admin_remove_game(text, uuid)                   from public;
revoke all on function public.touch_players_updated_at()                      from public, anon, authenticated;

grant execute on function public.lookup_players(text[])                          to anon, authenticated;
grant execute on function public.admin_verify(text)                              to anon, authenticated;
grant execute on function public.admin_list_players(text)                        to anon, authenticated;
grant execute on function public.admin_upsert_players(text, jsonb)               to anon, authenticated;
grant execute on function public.admin_update_player(text, uuid, jsonb)          to anon, authenticated;
grant execute on function public.admin_remove_player(text, uuid)                 to anon, authenticated;
grant execute on function public.admin_record_game(text, timestamptz, uuid[], text) to anon, authenticated;
grant execute on function public.admin_list_games(text)                          to anon, authenticated;
grant execute on function public.admin_remove_game(text, uuid)                   to anon, authenticated;
