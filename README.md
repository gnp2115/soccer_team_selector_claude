# Columbia FC Team Selector

Splits a pickup soccer session into fair teams, balancing goalkeepers, gender, skill and
positions, then lays each team out on a pitch and turns the line-ups into a message for the
group chat. Built for the CBS football club, where practices run three times a week, who shows
up changes every time, and the organizers don't always know everyone on the sign-up list.

**Live app:** https://soccer-team-selector-claude.vercel.app

Capstone for B8160 Vibe Coding at Columbia Business School, Fall 2026. First built in Lovable,
then rebuilt and extended in Claude Code, with every change planned in plan mode first and saved
to GitHub after each step that worked.

## What it does

**Pick teams** (open to anyone)

- **Add players** by name, or **paste the sign-up list** straight from WhatsApp or iMessage.
  Players already in the database are recognised by full name, nickname or first name, and come
  back with their saved skill, positions and gender. New names are flagged, and the organizer
  sets their details for today only
- **Make teams** (2, 3 or 4 sides) and **Reshuffle** for a different fair split, never the same
  one twice in a row
- **Confirm teams** to see each team on a pitch, every player in a position they play. Tap two
  players to swap them, or Reshuffle positions for a new arrangement
- **Game details**: date, time and location (the location is remembered on the device)
- **Copy for WhatsApp**: the line-ups as a ready-to-paste message, with nicknames and without
  skill ratings
- **Record this game** (needs the password): saves the date, time, location and who played

**Players** (behind one shared password, for the organizers)

- Add, edit and remove players: first and last name, skill 1 to 5, positions, gender, and an
  optional nickname, team they support, email, phone and photo
- Paste a whole list into the database at once
- "New today, not saved": save a newcomer with the details used today, or choose not to. A
  newcomer who played a recorded game gets that game when saved under the same full name
- Games played per player, last game, and recent games with their location. Counts are
  calculated from recorded games, never typed in
- Tap a recorded game to see who played, or tap a player to see every game they played

## How the teams are balanced

`src/lib/teams.ts` generates 1,000 random splits where team sizes differ by at most one player,
scores each one, keeps the best few and picks among them at random. The score is:

```
missing keepers x 100,000  +  women spread x 1,000  +  skill gap x 10  +  position spread x 2
```

The weights make it a strict ranking: a keeper on every team first, then an even split of women
(never more than one apart), then even total skill, then spreading defenders, midfielders and
attackers. Strength already sits in each player's skill rating, so the women split is a rule of
its own, not an adjustment to anyone's strength. Keepers are assigned by letting the team with
the fewest keeper options pick first, preferring a keeper-only player so the least outfield
strength is lost.

Randomising among the best few splits, rather than always taking the single best, is what makes
Reshuffle useful: a genuinely different split that is still fair.

## How players are laid out on the pitch

`src/lib/formation.ts` gives each team a shape by size (6-a-side is a keeper plus 2-2-1, 10-a-side
a keeper plus 4-3-2), puts the team's keeper in goal, then matches the other players to spots so
that as many as possible stand in a position they actually play, working it out like a seating
plan. Players and spots are shuffled first, so Reshuffle positions lands on a different one of
the best arrangements each time.

## Reading a pasted list

`src/lib/parse.ts` takes one player per line, as `name, skill, gender, positions`, with an
optional nickname in brackets after the name:

```
1. Gabi ✅
2. Andrea Pirlo (Pirlo), 5, M, MID
- Ana Costa, 3, W, Defender, Midfielder
Pedro Alves
```

- A saved player only needs a name: full name, nickname, or a first name only one player has
- After the name, fields can come in any order: a number is the skill, M or W is the gender
  (also Man, Woman, Male, Female, F, Homem, Mulher), anything else must be a position
- Positions in full or abbreviated (GK, DEF, MID, ATT), any capitals, English or Portuguese
  (Goleiro, Zagueiro, Meia, Atacante)
- List numbering, bullets and emoji (including a ✅ after a name) are ignored
- A new name is never given made-up details: without a skill, gender and position it waits for
  the organizer to fill them in
- A line is skipped, with the reason shown, when there is no name, the skill is outside 1 to 5,
  a position is not recognised, a first name matches more than one saved player, or the player
  is already in today's list

The first field is always the name, even when empty, so `, 4, Midfielder` is rejected as "no
name found" rather than creating a player called "4".

## Data and security

The data lives in Supabase (Postgres). The website talks to it directly with Supabase's
publishable key, which is public by design, so all protection lives in the database itself
(`supabase/schema.sql`):

- Every table has Row Level Security on with no policies, and all table privileges are revoked
  from the public roles. The website cannot read or write any table directly
- Instead it calls a short list of named functions. `lookup_players` is open, and returns only
  players whose full name, nickname or first name was asked for (up to 60 names per request);
  it never returns email, phone or team. Someone guessing common first names could still pull
  back much of the roster's names, photos and skill ratings, an accepted trade-off for a club
  roster, since that is what anyone sees by typing a name on Pick teams
- Every `admin_` function checks the shared password inside the database before doing anything.
  The password is stored only as a bcrypt hash in a private schema the public key cannot reach,
  and a wrong password waits one second before answering
- Photos are shrunk in the browser to a 160 x 160 JPEG (about 10 KB) and stored in the player's
  record through the same password-checked functions, so there is no open file upload. That
  suits a club-sized database; a much larger one would move photos to a file store

`/security-review` on the first database version found that squad codes were only checked in the
browser, so anyone with the public key could read, change or delete every row. The design above
replaced it.

## Running it locally

```bash
npm install
npm run dev
```

Then open the address it prints, usually http://localhost:5173. `npm test` runs the automated checks
in `tests/` (team balancing, pitch layouts, the WhatsApp message, name matching and list
reading); `npm run lint` checks the code style. Without a database the team
picking still works; to connect one, create `.env.local` (it is ignored by git):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

To set up the database, run `supabase/schema.sql` in the Supabase SQL editor (safe to re-run:
it never deletes data), then set the organizers' password, replacing the placeholder:

```sql
insert into private.settings (id, admin_password_hash)
values (1, extensions.crypt('PUT-YOUR-PASSWORD-HERE', extensions.gen_salt('bf')))
on conflict (id) do update set admin_password_hash = excluded.admin_password_hash;
```

On Vercel, add the same two `VITE_` variables and redeploy, since they are built into the site.

## Built with

Vite, React, TypeScript and Tailwind CSS; Supabase for the database; Vercel for hosting. Built
with Claude Code (and an earlier version in Lovable), which wrote the code; the planning,
product decisions and testing with real sign-up lists were mine.

Colours follow Columbia's brand palette: Columbia Blue `#B9D9EB` and primary blue `#1D4F91`,
with navy and gold from the Columbia Football Club crest.

## Project layout

| Path | What it holds |
|---|---|
| `src/App.tsx` | Both tabs: every screen, form and button |
| `src/lib/teams.ts` | Types, the balancing algorithm, the example squad |
| `src/lib/formation.ts` | Pitch layouts per team size, and swapping |
| `src/lib/parse.ts` | Reading a pasted sign-up list |
| `src/lib/lineup.ts` | The WhatsApp message |
| `src/lib/roster.ts` | Talking to the database functions; name matching |
| `src/lib/photo.ts` | Shrinking a photo before it is saved |
| `supabase/schema.sql` | Tables, locks and functions; re-run to upgrade |
| `supabase/000_remove_v1.sql` | One-off removal of the first database version |
| `public/columbia-fc.png` | Club crest, used in the header and as the favicon |
