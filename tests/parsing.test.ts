import { check, section } from "./check";
import { findSaved, type KnownPlayer } from "../src/lib/roster";
import { extractNames, parsePlayerList, splitNickname } from "../src/lib/parse";

section("Matching names and reading a pasted list");

const k = (id: string, first: string, last: string, extra: Partial<KnownPlayer> = {}): KnownPlayer => ({
  id,
  firstName: first,
  lastName: last,
  skill: 3,
  positions: ["Midfielder"],
  gender: "M",
  nickname: null,
  photo: null,
  ...extra,
});

const saved: KnownPlayer[] = [
  k("pirlo", "Andrea", "Pirlo", { nickname: "Pirlo", skill: 5 }),
  k("marlo", "Marlo", "Silva", { skill: 5, positions: ["Attacker"] }),
  k("gabi", "Gabriel", "Pecora", { nickname: "Gabi" }),
  k("x", "Gordon", "Malykos", { nickname: "Marlo Silva" }),
  k("g2", "Gordon", "Ramsey"),
  k("bia", "Bia", "Lopes", { gender: null }),
];
const found = (name: string) => {
  const m = findSaved(name, saved);
  return m.kind === "found" ? m.player.id : m.kind;
};

check(found("Pirlo") === "pirlo" && found("  PIRLO ") === "pirlo", "a nickname finds the player, in any capitals");
check(found("Marlo Silva") === "marlo", "a full name beats a nickname that spells the same");
check(found("Marlo") === "marlo", "a first name only one player has still works");
check(found("Gordon") === "ambiguous", "two players with the same first name: ask, never guess");
check(found("Nobody") === "none", "an unknown name is not found");

check(
  JSON.stringify(splitNickname("Gabriel  Pecora ( Gabi ) ✅")) === JSON.stringify({ name: "Gabriel Pecora", nickname: "Gabi" }),
  "name and bracketed nickname split cleanly, check mark ignored",
);

let r = parsePlayerList("Ana Costa, 3, W, DEF", [], saved);
check(r.players[0]?.gender === "W" && r.players[0]?.skill === 3 && r.players[0]?.isNew === true, "a new player with full details is ready");

r = parsePlayerList("Ana Costa, W, 3, mulher, def", [], saved);
check(r.players[0]?.gender === "W" && r.players[0]?.skill === 3, "fields after the name in any order, Portuguese words too");

r = parsePlayerList("Ana Costa, 3, DEF", [], saved);
check(r.needsDetails.length === 1 && r.needsDetails[0]!.gender === null, "a new name missing its gender waits for details");

r = parsePlayerList("1. Pirlo ✅\n2. Gabi\n3. Marlo Silva ✔️", [], saved);
check(r.players.map((p) => p.dbId).join() === "pirlo,gabi,marlo", "a WhatsApp list of nicknames and names, check marks ignored");

r = parsePlayerList("Bia, W", [], saved);
check(r.players[0]?.gender === "W" && r.players[0]?.skill === 3, "a saved player gets a gender from the line and keeps the rest");

r = parsePlayerList("Andrea Pirlo (Maestro), 5, M, MID", [], saved);
check(r.players[0]?.nickname === "Maestro" && r.players[0]?.dbId === "pirlo", "a bracket updates a saved player's nickname");

r = parsePlayerList("Gordon\nPirlo\nPirlo\n, 4, MID\nGabi, 9\nAna Costa, 3, W, M, DEF", [], saved);
const reasons = r.skipped.map((s) => s.reason);
check(reasons.includes("more than one saved Gordon, add the last name"), "ambiguous first name is skipped with a reason");
check(reasons.includes("listed twice"), "a name listed twice is skipped");
check(reasons.includes("no name found"), "a line with no name is skipped, never a player called 4");
check(reasons.includes("skill must be 1 to 5"), "a skill of 9 is skipped");
check(reasons.includes("more than one gender"), "two genders on one line is skipped");

r = parsePlayerList("Pirlo", ["Andrea Pirlo"], saved);
check(r.skipped[0]?.reason === "already in today's list", "a player already in today's list is skipped");

check(extractNames("Andrea Pirlo (Pirlo), 5\n2. Gabi ✅").join("|") === "Andrea Pirlo|Gabi", "names for the database lookup leave out brackets and emoji");
