-- Saved player database for the Soccer Team Selector.
--
-- Run once in the Supabase SQL editor. Safe to re-run: every statement checks
-- whether its object already exists, and nothing here deletes data.
--
-- Security model, stated plainly: there is no login. A "squad" code groups a
-- roster, and anyone who knows a code can edit that squad. The rules below make
-- sure that whatever anyone sends, only well-formed rows get in, and no single
-- squad can be flooded.

create table if not exists public.players (
  id               uuid primary key default gen_random_uuid(),
  squad            text not null check (char_length(squad) between 1 and 40),
  sport            text not null default 'soccer'
                   check (sport in ('soccer', 'basketball', 'flag_football', 'volleyball')),
  first_name       text not null check (char_length(btrim(first_name)) between 1 and 30),
  last_name        text not null default '' check (char_length(last_name) <= 30),
  -- "marlo silva": lower-cased full name. Lets "Marlo Silva" and " marlo  silva"
  -- count as one player, and is what the uniqueness rule below checks.
  name_key         text generated always as (
                     lower(btrim(regexp_replace(first_name || ' ' || last_name, '\s+', ' ', 'g')))
                   ) stored,
  skill            smallint not null check (skill between 1 and 5),
  positions        text[] not null check (cardinality(positions) between 1 and 4),
  practices        integer not null default 0 check (practices between 0 and 10000),
  last_practice_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Soccer positions are fixed. Other sports will add their own list when they
  -- arrive, which is why this only applies to soccer.
  constraint soccer_positions_valid check (
    sport <> 'soccer'
    or positions <@ array['Goalkeeper', 'Defender', 'Midfielder', 'Attacker']::text[]
  ),

  -- One row per player, per squad, per sport.
  constraint players_unique_name unique (squad, sport, name_key)
);

create index if not exists players_squad_sport_idx on public.players (squad, sport);

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

-- Cap each squad at 200 players, so one squad code cannot be used to flood the table.
create or replace function public.limit_players_per_squad()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.players
      where squad = new.squad and sport = new.sport) >= 200 then
    raise exception 'This squad already has 200 players';
  end if;
  return new;
end;
$$;

drop trigger if exists players_limit_per_squad on public.players;
create trigger players_limit_per_squad
  before insert on public.players
  for each row execute function public.limit_players_per_squad();

-- Add one practice to everyone in today's list, in a single step, so two people
-- recording at the same moment cannot overwrite each other's count.
-- Runs with the caller's permissions, so Row Level Security still applies.
create or replace function public.record_practice(p_squad text, p_sport text, p_keys text[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated integer;
begin
  if p_keys is null or cardinality(p_keys) = 0 then
    return 0;
  end if;
  if cardinality(p_keys) > 60 then
    raise exception 'A practice can record at most 60 players';
  end if;

  update public.players
     set practices = practices + 1,
         last_practice_at = now()
   where squad = p_squad
     and sport = p_sport
     and name_key = any(p_keys);

  get diagnostics updated = row_count;
  return updated;
end;
$$;

revoke all on function public.record_practice(text, text, text[]) from public;
grant execute on function public.record_practice(text, text, text[]) to anon, authenticated;

-- Row Level Security: on. Without this, the publishable key would have no rules at all.
alter table public.players enable row level security;

grant select, insert, update, delete on public.players to anon, authenticated;

drop policy if exists "Anyone can read players" on public.players;
create policy "Anyone can read players"
  on public.players for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can add players" on public.players;
create policy "Anyone can add players"
  on public.players for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Anyone can update players" on public.players;
create policy "Anyone can update players"
  on public.players for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Anyone can remove players" on public.players;
create policy "Anyone can remove players"
  on public.players for delete
  to anon, authenticated
  using (true);
