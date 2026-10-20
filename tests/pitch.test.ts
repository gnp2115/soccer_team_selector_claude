import { check, section } from "./check";
import { POSITIONS, newId, type Player, type Position, type Team } from "../src/lib/teams";
import { fitCount, makeFormation, swapSlots } from "../src/lib/formation";
import { lineupText } from "../src/lib/lineup";

section("Pitch layouts and the WhatsApp message");

const rnd = (n: number) => Math.floor(Math.random() * n);

function randomTeam(size: number): Team {
  const players: Player[] = [];
  for (let i = 0; i < size; i++) {
    const pos = new Set<Position>();
    const k = 1 + rnd(2);
    while (pos.size < k) pos.add(POSITIONS[rnd(4)]!);
    players.push({ id: newId(), name: `N${i}`, skill: 1 + rnd(5), positions: [...pos], gender: "M" });
  }
  const gk = players.filter((p) => p.positions.includes("Goalkeeper"));
  return { players, keeperId: gk.length ? gk[rnd(gk.length)]!.id : null };
}

/** The most players that can stand in a spot they play, worked out a separate way. */
function matching(players: Player[], roles: Position[]): number {
  const owner: (number | null)[] = roles.map(() => null);
  const place = (pi: number, seen: boolean[]): boolean => {
    for (let si = 0; si < roles.length; si++) {
      if (seen[si] || !players[pi]!.positions.includes(roles[si]!)) continue;
      seen[si] = true;
      if (owner[si] === null || place(owner[si]!, seen)) {
        owner[si] = pi;
        return true;
      }
    }
    return false;
  };
  let count = 0;
  for (let pi = 0; pi < players.length; pi++) if (place(pi, roles.map(() => false))) count++;
  return count;
}

function bestPossible(team: Team, roles: Position[]): number {
  const outfield = roles.filter((r) => r !== "Goalkeeper");
  const fitsGoal = (p: Player) => (p.positions.includes("Goalkeeper") ? 1 : 0);
  if (team.keeperId) {
    const keeper = team.players.find((p) => p.id === team.keeperId)!;
    return fitsGoal(keeper) + matching(team.players.filter((p) => p !== keeper), outfield);
  }
  return Math.max(
    ...team.players.map((k) => fitsGoal(k) + matching(team.players.filter((p) => p !== k), outfield)),
  );
}

for (let size = 3; size <= 12; size++) {
  let bad = 0;
  let shape = "";
  for (let r = 0; r < 200; r++) {
    const team = randomTeam(size);
    const f = makeFormation(team);
    shape = f.name;
    const ids = f.slots.map((s) => s.playerId);
    const goal = f.slots.find((s) => s.role === "Goalkeeper")!;
    if (
      f.slots.length !== size ||
      new Set(ids).size !== size ||
      (team.keeperId && goal.playerId !== team.keeperId) ||
      fitCount(team, f.slots) < bestPossible(team, f.slots.map((s) => s.role))
    ) {
      bad++;
    }
  }
  check(bad === 0, `team of ${size} (${shape}): everyone placed once, keeper in goal, best possible fit`);
}

const named: Team = {
  keeperId: "k",
  players: [
    { id: "k", name: "Gianluigi Buffon", nickname: "Gigi", skill: 5, positions: ["Goalkeeper"], gender: "M" },
    { id: "d1", name: "Quibb", skill: 3, positions: ["Defender"], gender: "M" },
    { id: "d2", name: "Vosk", skill: 4, positions: ["Defender"], gender: "M" },
    { id: "m1", name: "Andrea Pirlo", nickname: "Pirlo", skill: 5, positions: ["Midfielder"], gender: "M" },
    { id: "m2", name: "Draxa", skill: 5, positions: ["Midfielder"], gender: "M" },
    { id: "m3", name: "Rilo", skill: 2, positions: ["Midfielder"], gender: "W" },
    { id: "a1", name: "Tarn", skill: 5, positions: ["Attacker"], gender: "M" },
  ],
};
const f = makeFormation(named);
check(f.name === "2-3-1" && fitCount(named, f.slots) === 7, "7-a-side: 2-3-1, everyone in their own position");

const gi = f.slots.findIndex((s) => s.role === "Goalkeeper");
const ai = f.slots.findIndex((s) => s.role === "Attacker");
const swapped = swapSlots(f, gi, ai);
check(
  swapped.slots[gi]!.playerId === "a1" && swapped.slots[ai]!.playerId === "k" && f.slots[gi]!.playerId === "k",
  "swap exchanges exactly two players and leaves the original untouched",
);

const layouts = new Set(Array.from({ length: 30 }, () => makeFormation(named).slots.map((s) => s.playerId).join()));
check(layouts.size > 1, "Reshuffle positions varies the layout");

const text = lineupText([f, swapped], [named, named], { when: "Sat, Oct 17, 10:00 AM", where: "Riverside Park" });
check(text.startsWith("⚽ Teams · Sat, Oct 17, 10:00 AM · Riverside Park"), "header carries date, time and location");
check(text.includes("*Team 1* (2-3-1)") && text.includes("*Team 2* (2-3-1)"), "bold team names with their shape");
check(text.includes("GK: Gigi") && text.includes("MID: ") && text.includes("Pirlo"), "nicknames used where set");
check(text.split("*Team 2*")[1]!.includes("GK: Tarn"), "the message follows a swap made on the pitch");
check(!/[0-9]/.test(text.replace(/\(\d-\d-\d\)/g, "").replace(/Team \d/g, "").replace(/Oct \d+, \d+:\d+/, "")),
  "no skill ratings in the message");
check(lineupText([f], [named]).startsWith("⚽ Teams\n"), "no date or place: plain header");
