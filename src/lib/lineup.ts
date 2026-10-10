import { POSITIONS, POSITION_SHORT, type Team } from "./teams";
import type { Formation } from "./formation";

/**
 * The confirmed line-ups as a message to paste into the WhatsApp group. Each
 * player is listed under the position they play on the pitch, so swaps made on
 * the pitch show up here. Skill ratings are left out on purpose: they are for
 * the organiser, not for broadcasting to the group. WhatsApp shows text
 * between asterisks in bold.
 */
export function lineupText(formations: Formation[], teams: Team[]): string {
  const blocks = formations.map((formation, i) => {
    const names = new Map(teams[i]!.players.map((p) => [p.id, p.name]));
    const rows = POSITIONS.map((pos) => {
      const who = formation.slots
        .filter((s) => s.role === pos && s.playerId)
        .map((s) => names.get(s.playerId!))
        .filter((n): n is string => !!n);
      return who.length ? `${POSITION_SHORT[pos]}: ${who.join(", ")}` : null;
    }).filter((row): row is string => row !== null);
    return [`*Team ${i + 1}* (${formation.name})`, ...rows].join("\n");
  });
  return ["⚽ Teams", ...blocks].join("\n\n");
}
