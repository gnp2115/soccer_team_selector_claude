-- Saved player roster for the Soccer Team Selector.
--
-- Run once in the Supabase SQL editor. Safe to re-run: every statement checks
-- whether its object already exists.
--
-- Security model, stated plainly: there is no login. A "squad" code groups a
-- roster, and anyone who knows a code can edit that squad. The rules below make
-- sure that whatever anyone sends, only well-formed rows get in, and no single
-- squad can be flooded.

create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  squad       text not null check (char_length(squad) between 1 and 40),
  sport       text not null default 'soccer'
              check (sport in ('soccer', 'basketball', 'flag_football', 'volleyball')),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  -- Lower-cased, trimmed name. Lets "Marlo", "marlo" and " Marlo " count as one
  -- player, and is what the uniqueness rule below checks.
  name_key    text generated always as (lower(btrim(name))) stored,
  skill       smallint not null check (skill between 1 and 5),
  positions   text[] not null check (cardinality(positions) between 1 and 4),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Soccer positions are fixed. Other sports will add their own list when they
  -- arrive, which is why this only applies to soccer.
  constraint soccer_positions_valid check (
    sport <> 'soccer'
    or positions <@ array['Goalkeeper', 'Defender', 'Midfielder', 'Attacker']::text[]
  ),

  -- One row per player name, per squad, per sport.
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
