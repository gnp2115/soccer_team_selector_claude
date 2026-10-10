import { shuffle, type Player, type Position, type Team } from "./teams";

/**
 * Pitch layouts for a confirmed team, ported from the first (Lovable) version
 * of this app. One change: instead of filling the spots in a single random
 * pass, which can strand a player out of position, it works out an
 * arrangement with the most players in a position they actually play.
 */

export type Slot = {
  /** The position this spot on the pitch asks for. */
  role: Position;
  /** Left and top, as percentages of a vertical pitch with the team's goal at the bottom. */
  x: number;
  y: number;
  playerId: string | null;
};

export type Formation = {
  /** The outfield shape, e.g. "2-3-1" for two defenders, three midfielders, one attacker. */
  name: string;
  slots: Slot[];
};

/** Outfield shape (defenders, midfielders, attackers) for each number of outfield players. */
const SHAPES: Record<number, [number, number, number]> = {
  0: [0, 0, 0],
  1: [0, 1, 0],
  2: [1, 0, 1],
  3: [1, 1, 1],
  4: [2, 1, 1],
  5: [2, 2, 1],
  6: [2, 3, 1],
  7: [3, 3, 1],
  8: [3, 3, 2],
  9: [4, 3, 2],
  10: [4, 4, 2],
};

function shapeFor(outfield: number): [number, number, number] {
  if (SHAPES[outfield]) return SHAPES[outfield]!;
  const def = Math.round(outfield * 0.4);
  const att = Math.round(outfield * 0.25);
  return [def, outfield - def - att, att];
}

function rowSlots(count: number, y: number, role: Position): Slot[] {
  return Array.from({ length: count }, (_, i) => ({
    role,
    y,
    x: ((i + 1) / (count + 1)) * 100,
    playerId: null,
  }));
}

function emptySlots(size: number): Formation {
  const [d, m, a] = shapeFor(Math.max(0, size - 1));
  return {
    name: `${d}-${m}-${a}`,
    slots: [
      { role: "Goalkeeper", x: 50, y: 88, playerId: null },
      ...rowSlots(d, 68, "Defender"),
      ...rowSlots(m, 45, "Midfielder"),
      ...rowSlots(a, 20, "Attacker"),
    ],
  };
}

/**
 * Match players to outfield spots so that as many as possible stand in a
 * position they play, like solving a seating plan. Players and spots are
 * shuffled first, so each call lands on a different one of the best plans.
 * Returns, for each spot, the index of its player (or null).
 */
function bestMatch(players: Player[], roles: Position[]): (number | null)[] {
  const owner: (number | null)[] = roles.map(() => null);
  const spotOrder = shuffle(roles.map((_, i) => i));
  const place = (pi: number, seen: Set<number>): boolean => {
    for (const si of spotOrder) {
      if (seen.has(si) || !players[pi]!.positions.includes(roles[si]!)) continue;
      seen.add(si);
      // Take a free spot, or move its current player to another spot they play.
      if (owner[si] === null || place(owner[si]!, seen)) {
        owner[si] = pi;
        return true;
      }
    }
    return false;
  };
  players.forEach((_, pi) => place(pi, new Set()));
  return owner;
}

/** One arrangement: keeper in goal, then the best possible fit for everyone else. */
function fill(team: Team, empty: Slot[]): Slot[] {
  const slots = empty.map((s) => ({ ...s }));
  const goal = slots.find((s) => s.role === "Goalkeeper");
  const outfield = slots.filter((s) => s !== goal);
  const roles = outfield.map((s) => s.role);
  const everyone: Player[] = shuffle(team.players);

  // Who goes in goal: the team's chosen keeper, else anyone who plays there,
  // else the player the outfield can best do without.
  let keeper: Player | null = null;
  if (goal) {
    keeper =
      everyone.find((p) => p.id === team.keeperId) ??
      everyone.find((p) => p.positions.includes("Goalkeeper")) ??
      null;
    if (!keeper && everyone.length) {
      const fitWithout = (k: Player) => {
        const rest = everyone.filter((p) => p !== k);
        return bestMatch(rest, roles).filter((o) => o !== null).length;
      };
      keeper = everyone.reduce((best, p) => (fitWithout(p) > fitWithout(best) ? p : best));
    }
    goal.playerId = keeper?.id ?? null;
  }

  const rest = everyone.filter((p) => p !== keeper);
  const owner = bestMatch(rest, roles);
  const placed = new Set(owner.filter((o): o is number => o !== null));
  const leftover = rest.filter((_, pi) => !placed.has(pi));
  outfield.forEach((slot, si) => {
    const pi = owner[si];
    slot.playerId = pi !== null && pi !== undefined ? rest[pi]!.id : (leftover.shift()?.id ?? null);
  });
  return slots;
}

/** How many players stand in a spot they actually play. */
export function fitCount(team: Team, slots: Slot[]): number {
  return slots.filter((s) => {
    const p = team.players.find((x) => x.id === s.playerId);
    return !!p && p.positions.includes(s.role);
  }).length;
}

/** Lay a team out on the pitch. Calling it again gives a different arrangement. */
export function makeFormation(team: Team): Formation {
  const { name, slots } = emptySlots(team.players.length);
  return { name, slots: fill(team, slots) };
}

/** Swap the players in two spots on the same pitch. */
export function swapSlots(formation: Formation, a: number, b: number): Formation {
  const slots = formation.slots.map((s) => ({ ...s }));
  const held = slots[a]!.playerId;
  slots[a]!.playerId = slots[b]!.playerId;
  slots[b]!.playerId = held;
  return { ...formation, slots };
}
