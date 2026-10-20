import { check, section } from "./check";
import {
  countWomen,
  makeTeams,
  newId,
  splitKey,
  totalSkill,
  type Gender,
  type Player,
  type Position,
} from "../src/lib/teams";

section("Team balancing: keepers, women, reshuffle");

function squad(n: number, women: number, keepers: number): Player[] {
  const out: Player[] = [];
  const outfield: Position[][] = [["Defender"], ["Midfielder"], ["Attacker"]];
  for (let i = 0; i < n; i++) {
    const gender: Gender = i < women ? "W" : "M";
    const isKeeper =
      i % Math.ceil(n / keepers) === 0 &&
      out.filter((p) => p.positions.includes("Goalkeeper")).length < keepers;
    out.push({
      id: newId(),
      name: `P${i}`,
      skill: 1 + ((i * 7) % 5),
      positions: isKeeper ? ["Goalkeeper"] : [...outfield[i % 3]!],
      gender,
    });
  }
  return out;
}

function run(label: string, n: number, women: number, teams: number, keepers: number, maxSpread: number) {
  const players = squad(n, women, keepers);
  let worstWomen = 0;
  let missingKeeper = 0;
  let repeats = 0;
  let prev: ReturnType<typeof makeTeams>["split"] | null = null;
  for (let r = 0; r < 300; r++) {
    const { split, unchanged } = makeTeams(players, teams, prev);
    const counts = split.teams.map((t) => countWomen(t.players));
    worstWomen = Math.max(worstWomen, Math.max(...counts) - Math.min(...counts));
    if (split.teams.some((t) => t.keeperId === null)) missingKeeper++;
    if (prev && !unchanged && splitKey(prev) === splitKey(split)) repeats++;
    prev = split;
  }
  check(worstWomen <= maxSpread, `${label}: women never more than ${maxSpread} apart in 300 runs`);
  check(missingKeeper === 0, `${label}: a keeper on every team in all 300 runs`);
  check(repeats === 0, `${label}: Reshuffle never repeats the previous split`);
}

run("18 players, 5 women, 2 teams", 18, 5, 2, 2, 1);
run("20 players, 6 women, 4 teams", 20, 6, 4, 4, 1);
run("12 players, 2 women, 2 teams", 12, 2, 2, 2, 0);
run("16 players, 4 women, 2 teams", 16, 4, 2, 2, 0);

const even = squad(12, 0, 2);
const { split } = makeTeams(even, 2);
const skills = split.teams.map((t) => totalSkill(t.players));
check(Math.max(...skills) - Math.min(...skills) <= 2, "12 mixed players: skill gap of 2 or less");
