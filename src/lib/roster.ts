import { createClient } from "@supabase/supabase-js";
import type { Position } from "./teams";

/**
 * The saved player database, stored in Supabase.
 *
 * The browser talks to Supabase directly with the publishable key, which is
 * designed to be public. What protects the data is Row Level Security and the
 * table's own constraints (see supabase/schema.sql), not secrecy of the key.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const rosterConfigured = Boolean(
  url && key && !key.startsWith("paste-your"),
);

const supabase = rosterConfigured ? createClient(url!, key!) : null;

const SPORT = "soccer";

export type SavedPlayer = {
  id: string;
  firstName: string;
  lastName: string;
  skill: number;
  positions: Position[];
  practices: number;
  lastPracticeAt: string | null;
};

export type PlayerDetails = {
  firstName: string;
  lastName: string;
  skill: number;
  positions: Position[];
};

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  skill: number;
  positions: Position[];
  practices: number;
  last_practice_at: string | null;
};

const fromRow = (r: Row): SavedPlayer => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  skill: r.skill,
  positions: r.positions,
  practices: r.practices,
  lastPracticeAt: r.last_practice_at,
});

/** "Marlo Silva", or just "Marlo" when there is no last name. */
export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

/** Same rule the database uses: lower-case, trimmed, single spaces. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Split "Marlo Silva da Costa" into first "Marlo", last "Silva da Costa". */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

/** Normalise a squad code so "CBS Sunday" and "cbs-sunday" mean the same squad. */
export function normaliseSquad(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);
}

export type Match =
  | { kind: "found"; player: SavedPlayer }
  | { kind: "ambiguous"; candidates: SavedPlayer[] }
  | { kind: "none" };

/**
 * Find a typed or pasted name in the saved database.
 *
 * A full name must match exactly. A first name on its own matches only when
 * exactly one saved player has that first name. Two saved Marlos and a plain
 * "Marlo" is ambiguous, and the app asks for the last name rather than guessing.
 */
export function findSaved(name: string, saved: SavedPlayer[]): Match {
  const key = nameKey(name);
  if (!key) return { kind: "none" };

  const exact = saved.find((p) => nameKey(fullName(p)) === key);
  if (exact) return { kind: "found", player: exact };

  if (!key.includes(" ")) {
    const byFirst = saved.filter((p) => nameKey(p.firstName) === key);
    if (byFirst.length === 1) return { kind: "found", player: byFirst[0]! };
    if (byFirst.length > 1) return { kind: "ambiguous", candidates: byFirst };
  }

  return { kind: "none" };
}

function requireClient() {
  if (!supabase) {
    throw new Error(
      "The player database is not set up. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.",
    );
  }
  return supabase;
}

export async function loadRoster(squad: string): Promise<SavedPlayer[]> {
  const { data, error } = await requireClient()
    .from("players")
    .select("id, first_name, last_name, skill, positions, practices, last_practice_at")
    .eq("squad", squad)
    .eq("sport", SPORT)
    .order("first_name")
    .order("last_name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(fromRow);
}

/**
 * Save players to the squad's database. A name already saved is updated with
 * the new skill and positions rather than duplicated. The practice count is
 * never touched here, only by recordPractice.
 */
export async function saveToRoster(squad: string, players: PlayerDetails[]): Promise<void> {
  if (!players.length) return;
  // Collapse duplicates within one batch, keeping the last one, so a single
  // upsert never tries to write the same name twice.
  const byKey = new Map<string, PlayerDetails>();
  for (const p of players) byKey.set(nameKey(fullName(p)), p);

  const rows = [...byKey.values()].map((p) => ({
    squad,
    sport: SPORT,
    first_name: p.firstName.trim(),
    last_name: p.lastName.trim(),
    skill: p.skill,
    positions: p.positions,
  }));

  const { error } = await requireClient()
    .from("players")
    .upsert(rows, { onConflict: "squad,sport,name_key" });
  if (error) throw new Error(error.message);
}

/**
 * Edit one saved player in place. Unlike saveToRoster, this keeps the same row
 * even when the name changes, so the practice count stays with the player.
 */
export async function updatePlayer(id: string, p: PlayerDetails): Promise<void> {
  const { error } = await requireClient()
    .from("players")
    .update({
      first_name: p.firstName.trim(),
      last_name: p.lastName.trim(),
      skill: p.skill,
      positions: p.positions,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Turn database errors into something a person can act on. */
export function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("players_unique_name")) {
    return "Someone with that name is already saved in this squad.";
  }
  if (message.includes("200 players")) {
    return "This squad already has 200 saved players.";
  }
  if (message.toLowerCase().includes("failed to fetch")) {
    return "Could not reach the database. Check your connection and try again.";
  }
  return message;
}

export async function removeFromRoster(id: string): Promise<void> {
  const { error } = await requireClient().from("players").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Add one practice to each of these players. Returns how many were updated. */
export async function recordPractice(squad: string, names: string[]): Promise<number> {
  const { data, error } = await requireClient().rpc("record_practice", {
    p_squad: squad,
    p_sport: SPORT,
    p_keys: names.map(nameKey),
  });
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}
