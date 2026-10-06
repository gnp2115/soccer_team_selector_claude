import { createClient } from "@supabase/supabase-js";
import type { Player, Position } from "./teams";

/**
 * The saved player roster, stored in Supabase.
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
  name: string;
  skill: number;
  positions: Position[];
};

/** Normalise a squad code so "CBS Sunday" and "cbs-sunday" mean the same squad. */
export function normaliseSquad(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);
}

export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

function requireClient() {
  if (!supabase) {
    throw new Error(
      "The roster is not set up. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.",
    );
  }
  return supabase;
}

export async function loadRoster(squad: string): Promise<SavedPlayer[]> {
  const { data, error } = await requireClient()
    .from("players")
    .select("id, name, skill, positions")
    .eq("squad", squad)
    .eq("sport", SPORT)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedPlayer[];
}

/**
 * Save players to the squad's roster. A name already on the roster is updated
 * with the new skill and positions rather than duplicated, because the table
 * treats names case-insensitively per squad.
 */
export async function saveToRoster(
  squad: string,
  players: Pick<Player, "name" | "skill" | "positions">[],
): Promise<void> {
  if (!players.length) return;
  // Collapse duplicates within one batch, keeping the last one, so a single
  // upsert never tries to write the same name twice.
  const byKey = new Map<string, (typeof players)[number]>();
  for (const p of players) byKey.set(nameKey(p.name), p);

  const rows = [...byKey.values()].map((p) => ({
    squad,
    sport: SPORT,
    name: p.name.trim(),
    skill: p.skill,
    positions: p.positions,
  }));

  const { error } = await requireClient()
    .from("players")
    .upsert(rows, { onConflict: "squad,sport,name_key" });
  if (error) throw new Error(error.message);
}

export async function removeFromRoster(id: string): Promise<void> {
  const { error } = await requireClient().from("players").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
