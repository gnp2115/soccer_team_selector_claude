export type Position = "Goalkeeper" | "Defender" | "Midfielder" | "Attacker";

export const POSITIONS: Position[] = [
  "Goalkeeper",
  "Defender",
  "Midfielder",
  "Attacker",
];

export const POSITION_SHORT: Record<Position, string> = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MID",
  Attacker: "ATT",
};

export type Player = {
  id: string;
  name: string;
  skill: number;
  positions: Position[];
  /** Set when this player is in the saved database; absent for new players. */
  dbId?: string;
};

export type Team = {
  players: Player[];
  keeperId: string | null;
};

export type Split = {
  teams: Team[];
  warning: string | null;
};

let seq = 0;
export const newId = () => `p${Date.now().toString(36)}${seq++}`;

const rand = (n: number) => Math.floor(Math.random() * n);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function totalSkill(players: Player[]) {
  return players.reduce((sum, p) => sum + p.skill, 0);
}

export function countWith(players: Player[], pos: Position) {
  return players.filter((p) => p.positions.includes(pos)).length;
}

function spread(values: number[]) {
  return Math.max(...values) - Math.min(...values);
}

/**
 * Give each team a goalkeeper where possible. Teams with the fewest keeper
 * options choose first, so a team whose only keeper is also someone else's
 * option does not get left empty-handed.
 */
function pickKeepers(teams: Player[][]): (string | null)[] {
  const used = new Set<string>();
  const keepers: (string | null)[] = teams.map(() => null);

  const order = teams
    .map((team, i) => ({
      i,
      options: team.filter((p) => p.positions.includes("Goalkeeper")),
    }))
    .sort((a, b) => a.options.length - b.options.length);

  for (const { i, options } of order) {
    const free = options.filter((p) => !used.has(p.id));
    if (!free.length) continue;
    // Prefer a keeper-only player, then the lowest skill, so we lose the least outfield.
    const pick = free.sort(
      (a, b) => a.positions.length - b.positions.length || a.skill - b.skill,
    )[0]!;
    keepers[i] = pick.id;
    used.add(pick.id);
  }

  return keepers;
}

/** Lower is better. Keeper coverage dominates, then skill balance, then position spread. */
function score(teams: Player[][]): number {
  const missingKeepers = pickKeepers(teams).filter((k) => k === null).length;
  const skillSpread = spread(teams.map(totalSkill));
  const positionSpread = (["Defender", "Midfielder", "Attacker"] as Position[])
    .map((pos) => spread(teams.map((t) => countWith(t, pos))))
    .reduce((a, b) => a + b, 0);

  return missingKeepers * 1000 + skillSpread * 10 + positionSpread * 2;
}

/** A split's identity, ignoring which card each team happens to appear on. */
export function splitKey(split: Split): string {
  return split.teams
    .map((t) =>
      t.players
        .map((p) => p.id)
        .sort()
        .join(","),
    )
    .sort()
    .join("|");
}

function buildSplit(players: Player[], teamCount: number): Split {
  const base = Math.floor(players.length / teamCount);
  const extra = players.length % teamCount;

  const candidates: { teams: Player[][]; s: number }[] = [];
  for (let iter = 0; iter < 1000; iter++) {
    const pool = shuffle(players);
    const teams: Player[][] = [];
    let cursor = 0;
    for (let t = 0; t < teamCount; t++) {
      const size = base + (t < extra ? 1 : 0);
      teams.push(pool.slice(cursor, cursor + size));
      cursor += size;
    }
    candidates.push({ teams, s: score(teams) });
  }

  candidates.sort((a, b) => a.s - b.s);
  const top = candidates.slice(0, 5);
  const chosen = top[rand(top.length)]!;

  const keepers = pickKeepers(chosen.teams);
  const keeperCount = players.filter((p) =>
    p.positions.includes("Goalkeeper"),
  ).length;
  const covered = keepers.filter(Boolean).length;

  return {
    teams: chosen.teams.map((team, i) => ({
      players: [...team].sort((a, b) => b.skill - a.skill),
      keeperId: keepers[i] ?? null,
    })),
    warning:
      covered < teamCount
        ? `Only ${keeperCount} goalkeeper${keeperCount === 1 ? "" : "s"} for ${teamCount} teams`
        : null,
  };
}

/**
 * Build a split. When `previous` is given, try hard to return a different one,
 * so pressing Reshuffle never shows the same teams twice in a row. If no
 * different split turns up, hand back the previous one flagged as unchanged.
 */
export function makeTeams(
  players: Player[],
  teamCount: number,
  previous?: Split | null,
): { split: Split; unchanged: boolean } {
  const previousKey = previous ? splitKey(previous) : null;

  for (let attempt = 0; attempt < 25; attempt++) {
    const split = buildSplit(players, teamCount);
    if (!previousKey || splitKey(split) !== previousKey) {
      return { split, unchanged: false };
    }
  }

  return { split: previous!, unchanged: true };
}

export function skillGap(teams: Team[]) {
  return spread(teams.map((t) => totalSkill(t.players)));
}

export const EXAMPLE_PLAYERS: Omit<Player, "id">[] = [
  { name: "Bongo", skill: 3, positions: ["Goalkeeper"] },
  { name: "Zeek", skill: 2, positions: ["Goalkeeper", "Defender"] },
  { name: "Tarn", skill: 5, positions: ["Attacker"] },
  { name: "Marlo", skill: 4, positions: ["Midfielder", "Attacker"] },
  { name: "Quibb", skill: 3, positions: ["Defender"] },
  { name: "Fenno", skill: 4, positions: ["Defender", "Midfielder"] },
  { name: "Rilo", skill: 2, positions: ["Midfielder"] },
  { name: "Draxa", skill: 5, positions: ["Midfielder"] },
  { name: "Pim", skill: 1, positions: ["Attacker"] },
  { name: "Vosk", skill: 4, positions: ["Defender"] },
  { name: "Nabu", skill: 3, positions: ["Attacker", "Midfielder"] },
  { name: "Olim", skill: 2, positions: ["Defender", "Attacker"] },
];
