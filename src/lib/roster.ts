import { createClient } from "@supabase/supabase-js";
import type { Gender, Position } from "./teams";

/**
 * The central player database, stored in Supabase.
 *
 * The browser cannot touch the tables directly. It can only call the named
 * functions defined in supabase/schema.sql: lookup_players is open to anyone,
 * and every admin_ function checks the shared database password inside the
 * database itself. The publishable key used here is designed to be public.
 *
 * Contact details (email, phone) and the team a player supports only come back
 * from the password functions; the open lookup never returns them.
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
  /** Null for players saved before gender was recorded. */
  gender: Gender | null;
  nickname: string | null;
  /** A small square picture, stored as a data URL. */
  photo: string | null;
};

/** A player as password holders see them, with their game history and details. */
export type SavedPlayer = KnownPlayer & {
  gamesPlayed: number;
  lastPlayedAt: string | null;
  supportedTeam: string | null;
  email: string | null;
  phone: string | null;
};

/**
 * What gets saved. For the optional fields, leaving one out (undefined) keeps
 * the saved value, and null clears it.
 */
export type PlayerDetails = {
  firstName: string;
  lastName: string;
  skill: number;
  positions: Position[];
  /** Null leaves a saved player's gender as it is. */
  gender: Gender | null;
  nickname?: string | null;
  supportedTeam?: string | null;
  email?: string | null;
  phone?: string | null;
  photo?: string | null;
};

export type GameSummary = {
  id: string;
  playedAt: string;
  players: number;
  location: string | null;
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
 * Find a typed or pasted name among known players, trying in order:
 * 1. the exact full name
 * 2. a nickname (no two players can share one, so this is never ambiguous)
 * 3. a first name on its own, but only when exactly one known player has it.
 *    Two Marlos and a plain "Marlo" is ambiguous, and the app asks for the last
 *    name rather than guessing.
 */
export function findSaved(name: string, known: KnownPlayer[]): Match {
  const wanted = nameKey(name);
  if (!wanted) return { kind: "none" };

  const exact = known.find((p) => nameKey(fullName(p)) === wanted);
  if (exact) return { kind: "found", player: exact };

  const byNickname = known.find((p) => p.nickname && nameKey(p.nickname) === wanted);
  if (byNickname) return { kind: "found", player: byNickname };

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
  if (message.includes("players_unique_nickname")) {
    return "Another player already has that nickname.";
  }
  if (message.includes("players_email_check")) return "That email address does not look right.";
  if (message.includes("players_phone_check")) {
    return "That phone number does not look right. Use digits, spaces, +, - or brackets.";
  }
  if (message.includes("players_photo_check")) return "That photo is too large to save.";
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
  gender: Gender | null;
  nickname?: string | null;
  photo?: string | null;
  supported_team?: string | null;
  email?: string | null;
  phone?: string | null;
  games_played?: number;
  last_played_at?: string | null;
};

const toKnown = (r: PlayerRow): KnownPlayer => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  skill: r.skill,
  positions: r.positions,
  gender: r.gender ?? null,
  nickname: r.nickname ?? null,
  photo: r.photo ?? null,
});

const blankToNull = (v: string | null | undefined) => (v ?? "").trim() || null;

/** The JSON the database functions take. Optional fields left undefined are not sent. */
function toRow(p: PlayerDetails): Record<string, unknown> {
  const row: Record<string, unknown> = {
    first_name: p.firstName.trim(),
    last_name: p.lastName.trim(),
    skill: p.skill,
    positions: p.positions,
    gender: p.gender,
  };
  if (p.nickname !== undefined) row.nickname = blankToNull(p.nickname);
  if (p.supportedTeam !== undefined) row.supported_team = blankToNull(p.supportedTeam);
  if (p.email !== undefined) row.email = blankToNull(p.email);
  if (p.phone !== undefined) row.phone = blankToNull(p.phone);
  if (p.photo !== undefined) row.photo = p.photo || null;
  return row;
}

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
    supportedTeam: r.supported_team ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
  }));
}

export async function savePlayers(password: string, players: PlayerDetails[]): Promise<void> {
  if (!players.length) return;
  await call("admin_upsert_players", {
    p_password: password,
    p_players: players.map(toRow),
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
    p_player: toRow(p),
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
  location: string | null,
): Promise<number> {
  return Number(
    await call<number>("admin_record_game", {
      p_password: password,
      p_played_at: playedAt.toISOString(),
      p_player_ids: playerIds,
      p_location: blankToNull(location),
    }),
  );
}

export async function listGames(password: string): Promise<GameSummary[]> {
  const rows = await call<
    { id: string; played_at: string; players: number; location: string | null }[] | null
  >("admin_list_games", { p_password: password });
  return (rows ?? []).map((r) => ({
    id: r.id,
    playedAt: r.played_at,
    players: Number(r.players),
    location: r.location ?? null,
  }));
}

export async function removeGame(password: string, id: string): Promise<void> {
  await call("admin_remove_game", { p_password: password, p_id: id });
}
