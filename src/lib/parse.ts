import type { Position } from "./teams";
import {
  findSaved,
  fullName,
  splitName,
  type KnownPlayer,
} from "./roster";

/** A player read from the list with everything known: ready to add. */
export type ParsedPlayer = {
  firstName: string;
  lastName: string;
  skill: number;
  positions: Position[];
  /** True when the skill or positions came from the saved database. */
  fromRoster: boolean;
  /** True when this name is not in the saved database yet. */
  isNew: boolean;
  /** The database id for a known player; null for a new one. */
  dbId: string | null;
};

/**
 * A new name the list did not fully describe. It cannot be added until someone
 * fills in what is missing. Whatever the line did say is kept.
 */
export type PendingPlayer = {
  line: string;
  firstName: string;
  lastName: string;
  skill: number | null;
  positions: Position[];
};

export type SkippedLine = {
  line: string;
  reason: string;
};

export type ParseResult = {
  players: ParsedPlayer[];
  needsDetails: PendingPlayer[];
  skipped: SkippedLine[];
};

/** Accepted spellings for each position, lower-cased and accent-stripped. */
const POSITION_WORDS: Record<string, Position> = {
  goalkeeper: "Goalkeeper",
  keeper: "Goalkeeper",
  gk: "Goalkeeper",
  goleiro: "Goalkeeper",
  defender: "Defender",
  defence: "Defender",
  defense: "Defender",
  def: "Defender",
  zagueiro: "Defender",
  defensor: "Defender",
  midfielder: "Midfielder",
  midfield: "Midfielder",
  mid: "Midfielder",
  meia: "Midfielder",
  "meio-campo": "Midfielder",
  "meio campo": "Midfielder",
  attacker: "Attacker",
  attack: "Attacker",
  att: "Attacker",
  forward: "Attacker",
  striker: "Attacker",
  atacante: "Attacker",
};

/** Strip accents so "meio-campo" and "meio-câmpo" both match. */
function normalise(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Remove WhatsApp clutter from the START of a line only: list numbering
 * ("1.", "1)"), bullets ("-", "*", "•") and emoji such as checkmarks.
 * Deliberately does not touch the rest of the line, so an empty first field
 * stays empty rather than letting the next field slide into the name slot.
 */
function stripLeadingClutter(line: string) {
  return line
    .replace(/^[\s​]+/, "")
    .replace(/^(?:\d+\s*[.)\]-]\s*)/, "")
    .replace(/^[-*•·–—]+\s*/, "")
    .replace(
      /^(?:[←-⯿☀-➿️\u{1F000}-\u{1FAFF}]\s*)+/u,
      "",
    )
    .trim();
}

/**
 * Read a pasted list into players.
 *
 * Each line is a name, optionally followed by a skill and positions. For a name
 * already in the saved database, anything the line leaves out comes from the
 * database, and anything the line does say wins. A new name has no fallback: if
 * the line does not give both a skill and a position, it goes to `needsDetails`
 * so someone fills it in, rather than being given a made-up default.
 *
 * `todayNames` are the players already in today's list, which get skipped.
 */
/**
 * Just the names from a pasted list, cleaned the same way the parser cleans
 * them, so they can be looked up in the database before parsing.
 */
export function extractNames(text: string): string[] {
  const names: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const cleaned = stripLeadingClutter(rawLine);
    const name = (cleaned.split(",")[0] ?? "").trim().replace(/\s+/g, " ");
    if (name) names.push(name);
  }
  return names;
}

export function parsePlayerList(
  text: string,
  todayNames: string[] = [],
  saved: KnownPlayer[] = [],
): ParseResult {
  const players: ParsedPlayer[] = [];
  const needsDetails: PendingPlayer[] = [];
  const skipped: SkippedLine[] = [];
  const inToday = new Set(todayNames.map((n) => normalise(n)));
  const inThisList = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const original = rawLine.trim();
    if (!original) continue;

    const cleaned = stripLeadingClutter(rawLine);
    if (!cleaned) continue;

    // The first field is always the name, even when it is empty.
    const fields = cleaned.split(",").map((f) => f.trim());
    const typedName = (fields[0] ?? "").replace(/\s+/g, " ");

    if (!typedName) {
      skipped.push({ line: original, reason: "no name found" });
      continue;
    }

    let rest = fields.slice(1).filter((f) => f.length > 0);
    let skill: number | null = null;

    // A purely numeric second field is the skill.
    if (rest.length && /^-?\d+([.,]\d+)?$/.test(rest[0]!)) {
      const value = Number(rest[0]!.replace(",", "."));
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        skipped.push({ line: original, reason: "skill must be 1 to 5" });
        continue;
      }
      skill = value;
      rest = rest.slice(1);
    }

    const positions: Position[] = [];
    let badPosition = false;
    for (const field of rest) {
      const match = POSITION_WORDS[normalise(field)];
      if (!match) {
        badPosition = true;
        break;
      }
      if (!positions.includes(match)) positions.push(match);
    }
    if (badPosition) {
      skipped.push({ line: original, reason: "position not recognised" });
      continue;
    }

    const match = findSaved(typedName, saved);
    if (match.kind === "ambiguous") {
      skipped.push({
        line: original,
        reason: `more than one saved ${typedName}, add the last name`,
      });
      continue;
    }

    // Use the saved spelling for a known player, so "marlo" shows as "Marlo Silva".
    const resolvedName =
      match.kind === "found" ? fullName(match.player) : typedName;
    const key = normalise(resolvedName);

    if (inToday.has(key) || inToday.has(normalise(typedName))) {
      skipped.push({ line: original, reason: "already in today's list" });
      continue;
    }
    if (inThisList.has(key)) {
      skipped.push({ line: original, reason: "listed twice" });
      continue;
    }
    inThisList.add(key);

    if (match.kind === "found") {
      const known = match.player;
      players.push({
        firstName: known.firstName,
        lastName: known.lastName,
        skill: skill ?? known.skill,
        positions: positions.length ? positions : [...known.positions],
        fromRoster: skill === null || positions.length === 0,
        isNew: false,
        dbId: known.id,
      });
      continue;
    }

    const { firstName, lastName } = splitName(typedName);
    if (skill !== null && positions.length > 0) {
      players.push({
        firstName,
        lastName,
        skill,
        positions,
        fromRoster: false,
        isNew: true,
        dbId: null,
      });
    } else {
      needsDetails.push({ line: original, firstName, lastName, skill, positions });
    }
  }

  return { players, needsDetails, skipped };
}
