import type { Gender, Position } from "./teams";
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
  /** Null only for a saved player whose gender was never recorded. */
  gender: Gender | null;
  /** True when the skill, positions or gender came from the saved database. */
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
  gender: Gender | null;
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

/** Accepted spellings for gender, lower-cased and accent-stripped. */
const GENDER_WORDS: Record<string, Gender> = {
  m: "M",
  man: "M",
  male: "M",
  homem: "M",
  w: "W",
  f: "W",
  woman: "W",
  female: "W",
  mulher: "W",
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
 * Each line is a name, optionally followed by a skill, a gender (M or W) and
 * positions, in any order after the name. For a name already in the saved
 * database, anything the line leaves out comes from the database, and anything
 * the line does say wins. A new name has no fallback: if the line does not give
 * a skill, a gender and a position, it goes to `needsDetails` so someone fills
 * it in, rather than being given a made-up default.
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

    const rest = fields.slice(1).filter((f) => f.length > 0);
    let skill: number | null = null;
    let gender: Gender | null = null;
    const positions: Position[] = [];
    let problem: string | null = null;

    // After the name: a number is the skill, M or W (or the word spelled out)
    // is the gender, and anything else has to be a position.
    for (const field of rest) {
      const word = normalise(field);
      if (/^-?\d+([.,]\d+)?$/.test(field)) {
        const value = Number(field.replace(",", "."));
        if (!Number.isInteger(value) || value < 1 || value > 5) {
          problem = "skill must be 1 to 5";
          break;
        }
        if (skill !== null && skill !== value) {
          problem = "more than one skill";
          break;
        }
        skill = value;
      } else if (GENDER_WORDS[word]) {
        if (gender !== null && gender !== GENDER_WORDS[word]) {
          problem = "more than one gender";
          break;
        }
        gender = GENDER_WORDS[word];
      } else if (POSITION_WORDS[word]) {
        if (!positions.includes(POSITION_WORDS[word])) positions.push(POSITION_WORDS[word]);
      } else {
        problem = "position not recognised";
        break;
      }
    }
    if (problem) {
      skipped.push({ line: original, reason: problem });
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
        gender: gender ?? known.gender,
        fromRoster: skill === null || positions.length === 0 || gender === null,
        isNew: false,
        dbId: known.id,
      });
      continue;
    }

    const { firstName, lastName } = splitName(typedName);
    if (skill !== null && positions.length > 0 && gender !== null) {
      players.push({
        firstName,
        lastName,
        skill,
        positions,
        gender,
        fromRoster: false,
        isNew: true,
        dbId: null,
      });
    } else {
      needsDetails.push({ line: original, firstName, lastName, skill, positions, gender });
    }
  }

  return { players, needsDetails, skipped };
}
