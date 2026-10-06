import { createClient } from "@supabase/supabase-js";
import type { Position } from "./teams";

/**
 * The central player database, stored in Supabase.
 *
 * The browser cannot touch the tables directly. It can only call the named
 * functions defined in supabase/schema.sql: lookup_players is open to anyone,
 * and every admin_ function checks the shared database password inside the
 * database itself. The publishable key used here is designed to be public.
 */

// import.meta.env only exists inside a Vite build. Falling back to an empty
// object lets this file load elsewhere (for example in a quick logic test),
// where the database simply counts as not configured.
const env: Partial<ImportMetaEnv> = import.meta.env ?? {};
const url = env.VITE_SUPABASE_URL as string | undefined;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const dbConfigured = Boolean(url && key && !key.startsWith("paste-your"));

const supabase = dbConfigured ? createClient(url!, key!) : null;

/** A player as the open lookup returns them. */
export type KnownPlayer = {
  id: string;
  firstName: string;
  lastName: string;
  skill: number;
  positions: Position[];
};

/** A player as password holders see them, with their game history. */
export type SavedPlayer = KnownPlayer & {
  gamesPlayed: number;
  lastPlayedAt: string | null;
};

export type PlayerDetails = {
  firstName: string;
  lastName: string;
  skill: number;
  positions: Position[];
};

export type GameSummary = {
  id: string;
  playedAt: string;
  players: number;
};

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

export type Match =
  | { kind: "found"; player: KnownPlayer }
  | { kind: "ambiguous"; candidates: KnownPlayer[] }
  | { kind: "none" };

/**
 * Find a typed or pasted name among known players.
 *
 * A full name must match exactly. A first name on its own matches only when
 * exactly one known player has that first name. Two Marlos and a plain "Marlo"
 * is ambiguous, and the app asks for the last name rather than guessing.
 */
export function findSaved(name: string, known: KnownPlayer[]): Match {
  const wanted = nameKey(name);
  if (!wanted) return { kind: "none" };

  const exact = known.find((p) => nameKey(fullName(p)) === wanted);
  if (exact) return { kind: "found", player: exact };

  if (!wanted.includes(" ")) {
    const byFirst = known.filter((p) => nameKey(p.firstName) === wanted);
    if (byFirst.length === 1) return { kind: "found", player: byFirst[0]! };
    if (byFirst.length > 1) return { kind: "ambiguous", candidates: byFirst };
  }

  return { kind: "none" };
}

/** Turn database errors into something a person can act on. */
export function friendlyError(err: unknown): string {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
  if (message.includes("Wrong password")) return "That password is not right.";
  if (message.includes("players_unique_name")) {
    return "Someone with that name is already in the database.";
  }
  if (message.toLowerCase().includes("failed to fetch")) {
    return "Could not reach the database. Check your connection and try again.";
  }
  return message;
}

function client() {
  if (!supabase) {
    throw new Error(
      "The player database is not set up. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.",
    );
  }
  return supabase;
}

type PlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
  skill: number;
  positions: Position[];
  games_played?: number;
  last_played_at?: string | null;
};

const toKnown = (r: PlayerRow): KnownPlayer => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  skill: r.skill,
  positions: r.positions,
});

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// --- Open to anyone ---------------------------------------------------------

/** Look up only these names. Returns nothing for names not in the database. */
export async function lookupPlayers(names: string[]): Promise<KnownPlayer[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (!unique.length) return [];
  const rows = await call<PlayerRow[] | null>("lookup_players", { p_names: unique });
  return (rows ?? []).map(toKnown);
}

export async function verifyPassword(password: string): Promise<boolean> {
  return Boolean(await call<boolean>("admin_verify", { p_password: password }));
}

// --- Password holders only --------------------------------------------------

export async function listPlayers(password: string): Promise<SavedPlayer[]> {
  const rows = await call<PlayerRow[] | null>("admin_list_players", { p_password: password });
  return (rows ?? []).map((r) => ({
    ...toKnown(r),
    gamesPlayed: Number(r.games_played ?? 0),
    lastPlayedAt: r.last_played_at ?? null,
  }));
}

export async function savePlayers(password: string, players: PlayerDetails[]): Promise<void> {
  if (!players.length) return;
  await call("admin_upsert_players", {
    p_password: password,
    p_players: players.map((p) => ({
      first_name: p.firstName.trim(),
      last_name: p.lastName.trim(),
      skill: p.skill,
      positions: p.positions,
    })),
  });
}

export async function updatePlayer(
  password: string,
  id: string,
  p: PlayerDetails,
): Promise<void> {
  await call("admin_update_player", {
    p_password: password,
    p_id: id,
    p_first_name: p.firstName.trim(),
    p_last_name: p.lastName.trim(),
    p_skill: p.skill,
    p_positions: p.positions,
  });
}

export async function removePlayer(password: string, id: string): Promise<void> {
  await call("admin_remove_player", { p_password: password, p_id: id });
}

/** Save a game. Returns how many saved players were counted. */
export async function recordGame(
  password: string,
  playedAt: Date,
  playerIds: string[],
): Promise<number> {
  return Number(
    await call<number>("admin_record_game", {
      p_password: password,
      p_played_at: playedAt.toISOString(),
      p_player_ids: playerIds,
    }),
  );
}

export async function listGames(password: string): Promise<GameSummary[]> {
  const rows = await call<{ id: string; played_at: string; players: number }[] | null>(
    "admin_list_games",
    { p_password: password },
  );
  return (rows ?? []).map((r) => ({
    id: r.id,
    playedAt: r.played_at,
    players: Number(r.players),
  }));
}

export async function removeGame(password: string, id: string): Promise<void> {
  await call("admin_remove_game", { p_password: password, p_id: id });
}
