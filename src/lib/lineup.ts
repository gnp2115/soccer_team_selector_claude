import { POSITIONS, POSITION_SHORT, type Team } from "./teams";
import type { Formation } from "./formation";

/** When and where the game is, for the top line of the message. Either can be left out. */
export type GameDetails = {
  when?: string | null;
  where?: string | null;
};

/**
 * The confirmed line-ups as a message to paste into the WhatsApp group. Each
 * player is listed under the position they play on the pitch, so swaps made on
 * the pitch show up here, and by nickname when they have one, since that is
 * what the group calls them. Skill ratings are left out on purpose: they are
 * for the organiser, not for broadcasting to the group. WhatsApp shows text
 * between asterisks in bold.
 */
export function lineupText(formations: Formation[], teams: Team[], game: GameDetails = {}): string {
  const header = ["⚽ Teams", game.when?.trim(), game.where?.trim()].filter(Boolean).join(" · ");
  const blocks = formations.map((formation, i) => {
    const names = new Map(teams[i]!.players.map((p) => [p.id, p.nickname?.trim() || p.name]));
    const rows = POSITIONS.map((pos) => {
      const who = formation.slots
        .filter((s) => s.role === pos && s.playerId)
        .map((s) => names.get(s.playerId!))
        .filter((n): n is string => !!n);
      return who.length ? `${POSITION_SHORT[pos]}: ${who.join(", ")}` : null;
    }).filter((row): row is string => row !== null);
    return [`*Team ${i + 1}* (${formation.name})`, ...rows].join("\n");
  });
  return [header, ...blocks].join("\n\n");
}
