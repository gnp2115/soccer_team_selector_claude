# Columbia FC Team Selector

Splits a group of pickup soccer players into fair teams, balancing skill, positions and
goalkeepers across the sides.

**Live app:** https://soccer-team-selector-claude.vercel.app

Built with Claude Code for Sprint #3 of B8160 Vibe Coding at Columbia Business School. It is a
rebuild of an app originally made in Lovable, so the two tools could be compared on the same
brief.

## What it does

- **Add players** one at a time, with a skill level from 1 to 5 and one or more positions
  (Goalkeeper, Defender, Midfielder, Attacker)
- **Paste a list** copied from a WhatsApp group instead of typing each player. It reads names,
  skills and positions, shows a preview of what it understood, and adds nobody until you confirm
- **Make teams**, choosing 2, 3 or 4 sides. Women are spread evenly across the teams, and each
  team card shows how many it has
- **Reshuffle** for a different split, never the same one twice in a row
- **Confirm teams** to see each team on a pitch: keeper in goal, then defenders, midfielders and
  attackers, each player in a spot they play wherever the team allows. Tap two players to swap
  them, or Reshuffle positions for a new arrangement
- **Copy for WhatsApp** to paste the confirmed line-ups into the group chat. Skill ratings are
  left out of the message on purpose
- **Clear all** to empty the roster, with a confirm step

Nothing is saved. The roster lives in the browser and resets when the page reloads.

## How the teams are balanced

`src/lib/teams.ts` generates 1,000 random splits where team sizes differ by at most one player,
scores each one, keeps the best few and picks among them at random. The score is:

```
missing keepers x 100,000  +  women spread x 1,000  +  skill gap x 10  +  position spread x 2
```

The weights make it a strict ranking: keeper coverage matters most, then an even split of women
(never more than one apart), then even total skill, then spreading defenders and attackers
across the teams. Strength already sits in each player's skill rating, so the women split is a
rule of its own, not an adjustment to anyone's strength. Keepers are assigned by letting the team with the fewest keeper options pick
first, and preferring a keeper-only player so the least outfield strength is lost.

Randomising among the best few splits, rather than always taking the single best, is what makes
Reshuffle useful: you get a genuinely different split that is still fair.

## Reading a pasted list

`src/lib/parse.ts` takes one player per line, as `name, skill, gender, positions`. After the
name the fields can come in any order: a number is the skill, M or W is the gender (also Man,
Woman, Male, Female, F, Homem, Mulher), and anything else must be a position:

```
1. James Carter, 5, M, Goalkeeper
- Ana Costa, 3, W, Defender, Midfielder
Will Hastings
```

- Accepts full position names or abbreviations (GK, DEF, MID, ATT), in any capitalisation, in
  English or Portuguese (Goleiro, Zagueiro, Meia, Atacante)
- Strips list numbering, bullets and emoji from the start of a line, and ignores blank lines
- Missing skill defaults to 3, missing position defaults to Midfielder, both flagged in the
  preview
- Skips a line, with a reason shown, when the name is empty, the skill is outside 1 to 5, a
  position is not recognised, or the player is already on the roster

The first field is always treated as the name, even when it is empty, so a line like
`, 4, Midfielder` is rejected as "no name found" rather than creating a player called "4".

## Running it locally

```bash
npm install
npm run dev
```

Then open the address it prints, usually http://localhost:5173.

```bash
npm run build     # production build into dist/
npm run preview   # serve that build locally
```

## Built with

Vite, React, TypeScript and Tailwind CSS. No backend, no database, no accounts, which is why it
deploys to Vercel as a plain static site with no configuration or environment variables.

Colours follow Columbia University's brand palette: Columbia Blue `#B9D9EB` and primary blue
`#1D4F91`, with navy and gold taken from the Columbia Football Club crest.

## Project layout

| Path | What it holds |
|---|---|
| `src/lib/teams.ts` | Types, the balancing algorithm, the example squad |
| `src/lib/parse.ts` | The pasted-list reader |
| `src/App.tsx` | The whole screen |
| `public/columbia-fc.png` | Club crest, used in the header and as the favicon |
