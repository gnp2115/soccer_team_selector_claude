import type { Player, Position } from "./teams";

export type ParsedPlayer = Omit<Player, "id"> & {
  skillDefaulted: boolean;
  positionDefaulted: boolean;
};

export type SkippedLine = {
  line: string;
  reason: string;
};

export type ParseResult = {
  players: ParsedPlayer[];
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

const DEFAULT_SKILL = 3;
const DEFAULT_POSITION: Position = "Midfielder";

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

export function parsePlayerList(
  text: string,
  existingNames: string[] = [],
): ParseResult {
  const players: ParsedPlayer[] = [];
  const skipped: SkippedLine[] = [];
  const taken = new Set(existingNames.map((n) => normalise(n)));

  for (const rawLine of text.split(/\r?\n/)) {
    const original = rawLine.trim();
    if (!original) continue;

    const cleaned = stripLeadingClutter(rawLine);
    if (!cleaned) continue;

    // The first field is always the name, even when it is empty.
    const fields = cleaned.split(",").map((f) => f.trim());
    const name = fields[0] ?? "";

    if (!name) {
      skipped.push({ line: original, reason: "no name found" });
      continue;
    }

    if (taken.has(normalise(name))) {
      skipped.push({ line: original, reason: "already on the roster" });
      continue;
    }

    let rest = fields.slice(1).filter((f) => f.length > 0);
    let skill = DEFAULT_SKILL;
    let skillDefaulted = true;
    let badSkill = false;

    // A purely numeric second field is the skill.
    if (rest.length && /^-?\d+([.,]\d+)?$/.test(rest[0]!)) {
      const value = Number(rest[0]!.replace(",", "."));
      if (Number.isInteger(value) && value >= 1 && value <= 5) {
        skill = value;
        skillDefaulted = false;
      } else {
        badSkill = true;
      }
      rest = rest.slice(1);
    }

    if (badSkill) {
      skipped.push({ line: original, reason: "skill must be 1 to 5" });
      continue;
    }

    const positions: Position[] = [];
    let badPosition: string | null = null;
    for (const field of rest) {
      const match = POSITION_WORDS[normalise(field)];
      if (!match) {
        badPosition = field;
        break;
      }
      if (!positions.includes(match)) positions.push(match);
    }

    if (badPosition) {
      skipped.push({ line: original, reason: "position not recognised" });
      continue;
    }

    const positionDefaulted = positions.length === 0;
    if (positionDefaulted) positions.push(DEFAULT_POSITION);

    taken.add(normalise(name));
    players.push({ name, skill, positions, skillDefaulted, positionDefaulted });
  }

  return { players, skipped };
}
