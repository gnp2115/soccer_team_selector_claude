import { useState, type FormEvent, type ReactNode } from "react";
import {
  EXAMPLE_PLAYERS,
  GENDER_LABEL,
  POSITIONS,
  POSITION_SHORT,
  countWomen,
  makeTeams,
  newId,
  skillGap,
  splitKey,
  totalSkill,
  type Gender,
  type Player,
  type Position,
  type Split,
  type Team,
} from "./lib/teams";
import { makeFormation, swapSlots, type Formation } from "./lib/formation";
import {
  extractNames,
  parsePlayerList,
  type ParsedPlayer,
  type ParseResult,
  type PendingPlayer,
} from "./lib/parse";
import {
  dbConfigured,
  findSaved,
  friendlyError,
  fullName,
  listGames,
  listPlayers,
  lookupPlayers,
  nameKey,
  recordGame,
  removeGame,
  removePlayer,
  savePlayers,
  splitName,
  updatePlayer,
  verifyPassword,
  type GameSummary,
  type PlayerDetails,
  type SavedPlayer,
} from "./lib/roster";

const NAVY = "#13375e";
const BLUE = "#1d4f91";
const COLUMBIA = "#b9d9eb";
const COLUMBIA_SOFT = "#e2eff8";
const GOLD = "#c9a43c";

const primaryBtn =
  "h-12 w-full rounded-xl text-base font-bold text-white shadow-sm transition disabled:bg-slate-300 disabled:text-slate-500";
const ghostBtn = "h-12 rounded-xl border-2 bg-white text-sm font-semibold transition";

const selectedStyle = { borderColor: BLUE, backgroundColor: BLUE, color: "#fff" };
const unselectedStyle = { borderColor: COLUMBIA_SOFT, backgroundColor: "#fff", color: NAVY };
const newTagStyle = { backgroundColor: "#f5ead0", color: "#7d6218" };
const dbTagStyle = { backgroundColor: COLUMBIA_SOFT, color: BLUE };
const womanTagStyle = { backgroundColor: "#f3e6f1", color: "#7a2e6b" };

type Tab = "teams" | "players";

/** "2026-10-06T19:00" for the date-time input, in local time. */
function localNow(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function formatGameTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Position tags, led by a gender tag: "W" for women, "M" only where asked for,
 * and a warning for players whose gender was never recorded.
 */
function PosTags({
  positions,
  gender,
  showMan,
}: {
  positions: Position[];
  gender?: Gender | null;
  showMan?: boolean;
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {gender === "W" && (
        <span className="rounded-md px-1.5 py-0.5 text-xs font-bold" style={womanTagStyle}>
          W
        </span>
      )}
      {gender === "M" && showMan && (
        <span className="rounded-md px-1.5 py-0.5 text-xs font-bold" style={dbTagStyle}>
          M
        </span>
      )}
      {gender === null && (
        <span className="rounded-md px-1.5 py-0.5 text-xs font-bold" style={newTagStyle}>
          gender missing
        </span>
      )}
      {positions.map((p) => (
        <span key={p} className="rounded-md px-1.5 py-0.5 text-xs font-bold" style={dbTagStyle}>
          {POSITION_SHORT[p]}
        </span>
      ))}
    </div>
  );
}

function SkillBadge({ value, small }: { value: number; small?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${
        small ? "h-8 w-8 text-sm" : "h-9 w-9 text-sm"
      }`}
      style={{ backgroundColor: COLUMBIA, color: NAVY }}
    >
      {value}
    </span>
  );
}

function Tag({ isNew }: { isNew: boolean }) {
  return (
    <span
      className="shrink-0 rounded-md px-2 py-0.5 text-xs font-bold"
      style={isNew ? newTagStyle : dbTagStyle}
    >
      {isNew ? "new" : "in database"}
    </span>
  );
}

function SkillPicker({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="h-11 rounded-xl border-2 text-base font-bold transition"
          style={value === n ? selectedStyle : unselectedStyle}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function GenderPicker({
  value,
  onChange,
}: {
  value: Gender | null;
  onChange: (g: Gender) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["M", "W"] as Gender[]).map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onChange(g)}
          className="h-11 rounded-xl border-2 text-sm font-semibold transition"
          style={value === g ? selectedStyle : unselectedStyle}
        >
          {GENDER_LABEL[g]}
        </button>
      ))}
    </div>
  );
}

function PositionPicker({
  value,
  onChange,
}: {
  value: Position[];
  onChange: (next: Position[]) => void;
}) {
  const toggle = (p: Position) =>
    onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  return (
    <div className="grid grid-cols-2 gap-2">
      {POSITIONS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => toggle(p)}
          className="h-11 rounded-xl border-2 text-sm font-semibold transition"
          style={value.includes(p) ? selectedStyle : unselectedStyle}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

/** "Marlo Silva" becomes "Marlo S." so names fit on the pitch. */
function pitchName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]}.` : parts[0]!;
}

/**
 * One team laid out on a vertical pitch, its goal at the bottom. Each player is
 * a circle with their skill (gold for the keeper), then their name and the
 * position they are playing. Tapping a player picks them for a swap.
 */
function Pitch({
  formation,
  team,
  picked,
  onTap,
}: {
  formation: Formation;
  team: Team;
  picked: number | null;
  onTap: (slot: number) => void;
}) {
  const line = "rgba(255,255,255,0.7)";
  return (
    <div
      className="relative aspect-[3/4] w-full overflow-hidden rounded-xl"
      style={{ background: "repeating-linear-gradient(180deg, #2f7d3b 0 10%, #2a7135 10% 20%)" }}
    >
      <div className="absolute inset-[3%] rounded-sm border-2" style={{ borderColor: line }} />
      <div className="absolute top-1/2 right-[3%] left-[3%] border-t-2" style={{ borderColor: line }} />
      <div
        className="absolute top-1/2 left-1/2 aspect-square w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
        style={{ borderColor: line }}
      />
      <div
        className="absolute top-[3%] left-1/2 h-[15%] w-[54%] -translate-x-1/2 border-2 border-t-0"
        style={{ borderColor: line }}
      />
      <div
        className="absolute bottom-[3%] left-1/2 h-[15%] w-[54%] -translate-x-1/2 border-2 border-b-0"
        style={{ borderColor: line }}
      />

      {formation.slots.map((slot, si) => {
        const p = team.players.find((x) => x.id === slot.playerId);
        if (!p) return null;
        const on = picked === si;
        // Fewer players in a row leaves more room for each name.
        const inRow = formation.slots.filter((x) => x.role === slot.role).length;
        const width = Math.min(30, 95 / (inRow + 1));
        return (
          <button
            key={si}
            type="button"
            onClick={() => onTap(si)}
            aria-label={`${p.name}, ${slot.role}${on ? ", picked to swap" : ""}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
            style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: `${width}%` }}
          >
            <span className="relative mx-auto block h-10 w-10">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold shadow-md transition"
                style={{
                  backgroundColor: slot.role === "Goalkeeper" ? GOLD : "#fff",
                  color: NAVY,
                  boxShadow: on ? `0 0 0 4px ${COLUMBIA}` : undefined,
                  transform: on ? "scale(1.12)" : undefined,
                }}
              >
                {p.skill}
              </span>
              {p.gender === "W" && (
                <span
                  className="absolute -top-1 -right-2 rounded-full px-1 text-[9px] font-bold"
                  style={womanTagStyle}
                >
                  W
                </span>
              )}
            </span>
            <span
              className="mt-1 block truncate text-[11px] font-bold text-white"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
            >
              {pitchName(p.name)}
            </span>
            <span className="block text-[10px] font-semibold text-white/85">
              {POSITION_SHORT[slot.role]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mt-4 mb-1 block text-sm font-bold first:mt-0"
      style={{ color: NAVY }}
    >
      {children}
    </label>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 bg-white p-4 shadow-sm" style={{ borderColor: COLUMBIA }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-lg font-bold" style={{ color: NAVY }}>
      {children}
    </h2>
  );
}

const inputClass =
  "h-12 w-full rounded-xl border-2 px-3 text-base outline-none focus:border-[#1d4f91]";

export default function App() {
  const [tab, setTab] = useState<Tab>("teams");

  // ---------------------------------------------------------------------------
  // Database password. Held in memory only: gone on refresh or Lock.
  // ---------------------------------------------------------------------------
  const [adminPw, setAdminPw] = useState<string | null>(null);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [dbPlayers, setDbPlayers] = useState<SavedPlayer[]>([]);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);

  const refreshAdmin = async (pw: string) => {
    try {
      const [p, g] = await Promise.all([listPlayers(pw), listGames(pw)]);
      setDbPlayers(p);
      setGames(g);
      setDbError(null);
    } catch (err) {
      setDbError(friendlyError(err));
    }
  };

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!pwInput) return;
    setPwBusy(true);
    setPwError(null);
    try {
      if (await verifyPassword(pwInput)) {
        setAdminPw(pwInput);
        setPwInput("");
        await refreshAdmin(pwInput);
      } else {
        setPwError("That password is not right.");
      }
    } catch (err) {
      setPwError(friendlyError(err));
    } finally {
      setPwBusy(false);
    }
  };

  const lock = () => {
    setAdminPw(null);
    setDbPlayers([]);
    setGames([]);
    resetForm();
  };

  // ---------------------------------------------------------------------------
  // Today's list and teams
  // ---------------------------------------------------------------------------
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamCount, setTeamCount] = useState(2);
  const [split, setSplit] = useState<Split | null>(null);
  const [reshuffleNote, setReshuffleNote] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [gameAt, setGameAt] = useState(localNow);
  const [recordNote, setRecordNote] = useState<string | null>(null);
  const [recordedFor, setRecordedFor] = useState<string | null>(null);
  const [recordBusy, setRecordBusy] = useState(false);

  // Line-ups on the pitch, and the split they were confirmed for. Any change to
  // the teams (reshuffle, a player added or removed) makes the key stop matching,
  // which hides the pitches until the teams are confirmed again.
  const [formations, setFormations] = useState<Formation[] | null>(null);
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ team: number; slot: number } | null>(null);

  const todaySignature = `${gameAt}|${players
    .map((p) => nameKey(p.name))
    .sort()
    .join(",")}`;
  const alreadyRecorded = recordedFor === todaySignature;
  const canMake = players.length >= teamCount * 2;
  const savedToday = players.filter((p) => p.dbId);
  const newToday = players.filter((p) => !p.dbId);
  const womenToday = countWomen(players);
  const missingGenderToday = players.filter((p) => !p.gender).length;

  const inToday = (name: string) => players.some((p) => nameKey(p.name) === nameKey(name));

  const addToToday = (list: Omit<Player, "id">[]) => {
    setPlayers((prev) => {
      const next = [...prev];
      for (const p of list) {
        if (next.some((x) => nameKey(x.name) === nameKey(p.name))) continue;
        next.push({ ...p, id: newId(), positions: [...p.positions] });
      }
      return next;
    });
    setSplit(null);
    setRecordNote(null);
  };

  const loadExample = () => {
    setPlayers(EXAMPLE_PLAYERS.map((p) => ({ ...p, id: newId() })));
    setSplit(null);
    setConfirmClear(false);
    setRecordNote(null);
  };

  const clearAll = () => {
    setPlayers([]);
    setSplit(null);
    setConfirmClear(false);
    setReshuffleNote(null);
    setRecordNote(null);
  };

  const run = () => {
    const { split: next, unchanged } = makeTeams(players, teamCount, split);
    setSplit(next);
    setReshuffleNote(unchanged ? "No other fair split with these players" : null);
  };

  const confirmed = !!split && !!formations && confirmedKey === splitKey(split);

  const confirmTeams = () => {
    if (!split) return;
    setFormations(split.teams.map(makeFormation));
    setConfirmedKey(splitKey(split));
    setPicked(null);
  };

  const reshufflePositions = (ti: number) => {
    if (!split || !formations) return;
    setFormations(formations.map((f, i) => (i === ti ? makeFormation(split.teams[ti]!) : f)));
    setPicked(null);
  };

  /** Tap one player, then a team-mate on the same pitch, to swap their spots. */
  const tapSlot = (ti: number, si: number) => {
    if (!formations) return;
    if (!picked || picked.team !== ti) return setPicked({ team: ti, slot: si });
    if (picked.slot === si) return setPicked(null);
    setFormations(formations.map((f, i) => (i === ti ? swapSlots(f, picked.slot, si) : f)));
    setPicked(null);
  };

  const record = async () => {
    if (!adminPw || !savedToday.length) return;
    setRecordBusy(true);
    try {
      const counted = await recordGame(
        adminPw,
        new Date(gameAt),
        savedToday.map((p) => p.dbId!),
      );
      setRecordedFor(todaySignature);
      setRecordNote(
        `Game on ${formatGameTime(new Date(gameAt).toISOString())} recorded. ` +
          `${counted} player${counted === 1 ? "" : "s"} counted.` +
          (newToday.length
            ? ` ${newToday.length} new player${newToday.length === 1 ? " was" : "s were"} not counted, since they are not in the database yet.`
            : ""),
      );
      await refreshAdmin(adminPw);
    } catch (err) {
      setRecordNote(friendlyError(err));
    } finally {
      setRecordBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Adding one player by name
  // ---------------------------------------------------------------------------
  const [quickName, setQuickName] = useState("");
  const [quickSkill, setQuickSkill] = useState<number | null>(null);
  const [quickPositions, setQuickPositions] = useState<Position[]>([]);
  const [quickGender, setQuickGender] = useState<Gender | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);
  /** Set when the typed name was looked up and is not in the database. */
  const [quickNewFor, setQuickNewFor] = useState<string | null>(null);

  const quickTyped = quickName.trim().replace(/\s+/g, " ");
  const quickIsNew = quickNewFor !== null && nameKey(quickNewFor) === nameKey(quickTyped);

  const resetQuick = () => {
    setQuickName("");
    setQuickSkill(null);
    setQuickPositions([]);
    setQuickGender(null);
    setQuickError(null);
    setQuickNewFor(null);
  };

  const submitQuick = async (e: FormEvent) => {
    e.preventDefault();
    if (!quickTyped) return setQuickError("Type a name");

    // Already confirmed as new: add with today's details, not saved.
    if (quickIsNew) {
      if (inToday(quickTyped)) return setQuickError(`${quickTyped} is already in today's list`);
      if (quickSkill === null) return setQuickError("Pick a skill level for today");
      if (!quickPositions.length) return setQuickError("Pick at least one position for today");
      if (quickGender === null) return setQuickError("Pick man or woman for today");
      addToToday([
        { name: quickTyped, skill: quickSkill, positions: quickPositions, gender: quickGender },
      ]);
      resetQuick();
      return;
    }

    setQuickBusy(true);
    setQuickError(null);
    try {
      const found = dbConfigured ? await lookupPlayers([quickTyped]) : [];
      const match = findSaved(quickTyped, found);
      if (match.kind === "ambiguous") {
        setQuickError(
          `More than one ${quickTyped} is in the database: ${match.candidates
            .map(fullName)
            .join(", ")}. Type the last name too.`,
        );
      } else if (match.kind === "found") {
        const known = match.player;
        const name = fullName(known);
        if (inToday(name)) setQuickError(`${name} is already in today's list`);
        else {
          addToToday([
            {
              name,
              skill: known.skill,
              positions: known.positions,
              gender: known.gender,
              dbId: known.id,
            },
          ]);
          resetQuick();
        }
      } else if (inToday(quickTyped)) {
        setQuickError(`${quickTyped} is already in today's list`);
      } else {
        setQuickNewFor(quickTyped);
      }
    } catch (err) {
      setQuickError(friendlyError(err));
    } finally {
      setQuickBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Pasting a list from WhatsApp
  // ---------------------------------------------------------------------------
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [pending, setPending] = useState<PendingPlayer[]>([]);
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [pasteBusy, setPasteBusy] = useState(false);

  const pendingIncomplete = pending.filter(
    (p) => p.skill === null || p.positions.length === 0 || p.gender === null,
  ).length;
  const pasteTotal = (preview?.players.length ?? 0) + pending.length;

  const readList = async () => {
    setPasteBusy(true);
    setPasteNote(null);
    try {
      const found = dbConfigured ? await lookupPlayers(extractNames(pasteText)) : [];
      const result = parsePlayerList(
        pasteText,
        players.map((p) => p.name),
        found,
      );
      setPreview(result);
      setPending(result.needsDetails);
    } catch (err) {
      setPasteNote(friendlyError(err));
    } finally {
      setPasteBusy(false);
    }
  };

  const updatePending = (i: number, patch: Partial<PendingPlayer>) =>
    setPending((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const addFromPreview = () => {
    if (!preview || pendingIncomplete > 0) return;
    const ready: Omit<Player, "id">[] = [
      ...preview.players.map((p) => ({
        name: fullName(p),
        skill: p.skill,
        positions: p.positions,
        gender: p.gender,
        ...(p.dbId ? { dbId: p.dbId } : {}),
      })),
      ...pending.map((p) => ({
        name: fullName(p),
        skill: p.skill as number,
        positions: p.positions,
        gender: p.gender,
      })),
    ];
    if (!ready.length) return;
    addToToday(ready);
    setPreview(null);
    setPending([]);
    setPasteNote(`Added ${ready.length} player${ready.length === 1 ? "" : "s"}`);
    if (!preview.skipped.length) setPasteText("");
  };

  // ---------------------------------------------------------------------------
  // Players tab
  // ---------------------------------------------------------------------------
  const [formFirst, setFormFirst] = useState("");
  const [formLast, setFormLast] = useState("");
  const [formSkill, setFormSkill] = useState<number | null>(null);
  const [formPositions, setFormPositions] = useState<Position[]>([]);
  const [formGender, setFormGender] = useState<Gender | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "games">("name");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmGameId, setConfirmGameId] = useState<string | null>(null);
  const [savingNewId, setSavingNewId] = useState<string | null>(null);

  function resetForm() {
    setFormFirst("");
    setFormLast("");
    setFormSkill(null);
    setFormPositions([]);
    setFormGender(null);
    setEditingId(null);
    setFormError(null);
  }

  const editPlayer = (p: SavedPlayer) => {
    setEditingId(p.id);
    setFormFirst(p.firstName);
    setFormLast(p.lastName);
    setFormSkill(p.skill);
    setFormPositions([...p.positions]);
    setFormGender(p.gender);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const savePlayerForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!adminPw) return;
    if (!formFirst.trim()) return setFormError("First name is required");
    if (formSkill === null) return setFormError("Pick a skill level");
    if (!formPositions.length) return setFormError("Pick at least one position");
    if (formGender === null) return setFormError("Pick man or woman");
    const details: PlayerDetails = {
      firstName: formFirst,
      lastName: formLast,
      skill: formSkill,
      positions: formPositions,
      gender: formGender,
    };
    setFormSaving(true);
    try {
      if (editingId) await updatePlayer(adminPw, editingId, details);
      else await savePlayers(adminPw, [details]);
      await refreshAdmin(adminPw);
      resetForm();
    } catch (err) {
      setFormError(friendlyError(err));
    } finally {
      setFormSaving(false);
    }
  };

  /** "Save later": put a new player from today's list into the database. */
  const saveNewToday = async (p: Player) => {
    if (!adminPw) return;
    setSavingNewId(p.id);
    try {
      await savePlayers(adminPw, [
        { ...splitName(p.name), skill: p.skill, positions: p.positions, gender: p.gender ?? null },
      ]);
      const [saved] = (await lookupPlayers([p.name])).filter(
        (k) => nameKey(fullName(k)) === nameKey(p.name),
      );
      if (saved) {
        setPlayers((prev) => prev.map((x) => (x.id === p.id ? { ...x, dbId: saved.id } : x)));
      }
      await refreshAdmin(adminPw);
    } catch (err) {
      setDbError(friendlyError(err));
    } finally {
      setSavingNewId(null);
    }
  };

  const removeSaved = async (id: string) => {
    if (!adminPw) return;
    try {
      await removePlayer(adminPw, id);
      setPlayers((prev) => prev.map((x) => (x.dbId === id ? { ...x, dbId: undefined } : x)));
      setConfirmRemoveId(null);
      if (editingId === id) resetForm();
      await refreshAdmin(adminPw);
    } catch (err) {
      setDbError(friendlyError(err));
    }
  };

  const removeGameEntry = async (id: string) => {
    if (!adminPw) return;
    try {
      await removeGame(adminPw, id);
      setConfirmGameId(null);
      await refreshAdmin(adminPw);
    } catch (err) {
      setDbError(friendlyError(err));
    }
  };

  // ---------------------------------------------------------------------------
  // Players tab: paste a whole list into the database
  // ---------------------------------------------------------------------------
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState<ParseResult | null>(null);
  const [bulkPending, setBulkPending] = useState<PendingPlayer[]>([]);
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  const samePositions = (a: Position[], b: Position[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();

  /** A known player whose pasted line says nothing different from what is saved. */
  const unchangedFromSaved = (p: ParsedPlayer) => {
    if (p.isNew || !p.dbId) return false;
    const saved = dbPlayers.find((d) => d.id === p.dbId);
    return (
      !!saved &&
      saved.skill === p.skill &&
      saved.gender === p.gender &&
      samePositions(saved.positions, p.positions)
    );
  };

  const bulkChanges = bulkPreview ? bulkPreview.players.filter((p) => !unchangedFromSaved(p)) : [];
  const bulkUnchanged = bulkPreview ? bulkPreview.players.filter(unchangedFromSaved) : [];
  const bulkIncomplete = bulkPending.filter(
    (p) => p.skill === null || p.positions.length === 0 || p.gender === null,
  ).length;
  const bulkCount = bulkChanges.length + bulkPending.length;

  const bulkRead = () => {
    // The whole database is already loaded while unlocked, so match against it directly.
    const result = parsePlayerList(bulkText, [], dbPlayers);
    setBulkPreview(result);
    setBulkPending(result.needsDetails);
    setBulkNote(null);
  };

  const updateBulkPending = (i: number, patch: Partial<PendingPlayer>) =>
    setBulkPending((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const bulkSave = async () => {
    if (!adminPw || !bulkPreview || bulkIncomplete > 0 || bulkCount === 0) return;
    const toSave: PlayerDetails[] = [
      ...bulkChanges.map((p) => ({
        firstName: p.firstName,
        lastName: p.lastName,
        skill: p.skill,
        positions: p.positions,
        gender: p.gender,
      })),
      ...bulkPending.map((p) => ({
        firstName: p.firstName,
        lastName: p.lastName,
        skill: p.skill as number,
        positions: p.positions,
        gender: p.gender,
      })),
    ];
    const added = bulkChanges.filter((p) => p.isNew).length + bulkPending.length;
    const updated = toSave.length - added;
    setBulkSaving(true);
    try {
      // The database accepts up to 60 players per call, so send longer lists in batches.
      for (let i = 0; i < toSave.length; i += 60) {
        await savePlayers(adminPw, toSave.slice(i, i + 60));
      }
      await refreshAdmin(adminPw);
      setBulkNote(
        `Saved ${toSave.length} player${toSave.length === 1 ? "" : "s"}: ${added} added, ${updated} updated.`,
      );
      if (!bulkPreview.skipped.length) setBulkText("");
      setBulkPreview(null);
      setBulkPending([]);
    } catch (err) {
      setBulkNote(friendlyError(err));
    } finally {
      setBulkSaving(false);
    }
  };

  const dbMissingGender = dbPlayers.filter((p) => p.gender === null).length;

  const sortedDb = [...dbPlayers].sort((a, b) =>
    sortBy === "games"
      ? b.gamesPlayed - a.gamesPlayed || fullName(a).localeCompare(fullName(b))
      : fullName(a).localeCompare(fullName(b)),
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl pb-16">
      <header
        className="flex items-center gap-4 px-4 py-5 text-white"
        style={{
          background: `linear-gradient(135deg, ${NAVY} 0%, ${BLUE} 100%)`,
          borderBottom: `4px solid ${GOLD}`,
        }}
      >
        <img
          src="/columbia-fc.png"
          alt="Columbia Football Club crest"
          className="h-16 w-16 shrink-0 rounded-full bg-white p-0.5 shadow-md"
        />
        <div className="min-w-0">
          <p
            className="text-xs font-bold tracking-[0.2em] uppercase"
            style={{ color: COLUMBIA }}
          >
            Columbia Football Club
          </p>
          <h1 className="text-2xl leading-tight font-extrabold">Team Selector</h1>
          <p className="mt-0.5 text-sm" style={{ color: COLUMBIA }}>
            Fair sides in one tap, balanced by skill, keepers and positions.
          </p>
        </div>
      </header>

      {/* Tabs */}
      <nav className="mx-4 mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 shadow-sm">
        {(
          [
            ["teams", "Pick teams"],
            ["players", adminPw ? `Players (${dbPlayers.length})` : "Players 🔒"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="h-11 rounded-xl text-sm font-bold transition"
            style={
              tab === key
                ? { backgroundColor: NAVY, color: "#fff" }
                : { backgroundColor: "transparent", color: NAVY }
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "teams" ? (
        <>
          {/* Who is playing */}
          <section className="px-4 pt-6">
            <SectionTitle>Who is playing?</SectionTitle>
            <Card>
              <form onSubmit={(e) => void submitQuick(e)}>
                <FieldLabel htmlFor="quick-name">Add a player by name</FieldLabel>
                <input
                  id="quick-name"
                  value={quickName}
                  onChange={(e) => {
                    setQuickName(e.target.value);
                    setQuickError(null);
                  }}
                  placeholder="e.g. Marlo Silva"
                  maxLength={61}
                  autoComplete="off"
                  className={inputClass}
                  style={{ borderColor: COLUMBIA_SOFT }}
                />

                {quickIsNew && (
                  <div
                    className="mt-3 rounded-xl border-2 p-3"
                    style={{ borderColor: GOLD, backgroundColor: "#fdf8ea" }}
                  >
                    <p className="text-sm font-bold" style={{ color: NAVY }}>
                      {quickTyped} is a new player, not in the database.
                    </p>
                    <p className="text-xs text-slate-600">
                      Set a skill, gender and position for today. They will not be saved:
                      someone with the database password can add them on the Players tab.
                    </p>
                    <FieldLabel>Skill level</FieldLabel>
                    <SkillPicker value={quickSkill} onChange={setQuickSkill} />
                    <FieldLabel>Gender</FieldLabel>
                    <GenderPicker value={quickGender} onChange={setQuickGender} />
                    <FieldLabel>Positions</FieldLabel>
                    <PositionPicker value={quickPositions} onChange={setQuickPositions} />
                  </div>
                )}

                {quickError && (
                  <p className="mt-3 text-sm font-bold text-red-700">{quickError}</p>
                )}

                <button
                  type="submit"
                  disabled={!quickTyped || quickBusy}
                  className={`mt-3 ${primaryBtn}`}
                  style={quickTyped && !quickBusy ? { backgroundColor: BLUE } : undefined}
                >
                  {quickBusy ? "Looking up..." : quickIsNew ? "Add for today" : "Add to today"}
                </button>
              </form>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={loadExample}
                  className={ghostBtn}
                  style={{ borderColor: COLUMBIA, color: NAVY }}
                >
                  Load example players
                </button>
                <button
                  type="button"
                  onClick={() => setPasteOpen((v) => !v)}
                  className={ghostBtn}
                  style={{ borderColor: COLUMBIA, color: NAVY }}
                >
                  Paste list
                </button>
              </div>

              {pasteOpen && (
                <div
                  className="mt-3 rounded-xl border-2 p-3"
                  style={{ borderColor: COLUMBIA, backgroundColor: "#f6fbfe" }}
                >
                  <p className="text-xs font-semibold" style={{ color: BLUE }}>
                    One player per line. Players in the database only need a name. New players
                    need a skill, M or W, and a position for today.
                  </p>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={"Marlo Silva\nAna Costa, 3, W, Defender"}
                    rows={6}
                    className="mt-2 w-full rounded-xl border-2 p-3 font-mono text-sm outline-none focus:border-[#1d4f91]"
                    style={{ borderColor: COLUMBIA_SOFT }}
                  />
                  <button
                    type="button"
                    onClick={() => void readList()}
                    disabled={pasteBusy || !pasteText.trim()}
                    className="h-11 w-full rounded-xl border-2 bg-white text-sm font-bold disabled:opacity-50"
                    style={{ borderColor: BLUE, color: BLUE }}
                  >
                    {pasteBusy ? "Checking the database..." : "Read list"}
                  </button>

                  {pasteNote && (
                    <p className="mt-2 text-sm font-bold" style={{ color: BLUE }}>
                      {pasteNote}
                    </p>
                  )}

                  {preview && (
                    <div className="mt-3">
                      {preview.players.map((p, i) => (
                        <div
                          key={`ready-${i}`}
                          className="mt-2 flex items-center gap-3 rounded-xl border-2 bg-white p-2"
                          style={{ borderColor: COLUMBIA_SOFT }}
                        >
                          <SkillBadge value={p.skill} small />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold" style={{ color: NAVY }}>
                              {fullName(p)}
                            </p>
                            <PosTags positions={p.positions} gender={p.gender ?? null} />
                          </div>
                          <Tag isNew={p.isNew} />
                        </div>
                      ))}

                      {pending.length > 0 && (
                        <div
                          className="mt-3 rounded-xl border-2 p-3"
                          style={{ borderColor: GOLD, backgroundColor: "#fdf8ea" }}
                        >
                          <p className="text-sm font-bold" style={{ color: NAVY }}>
                            New players, not in the database ({pending.length})
                          </p>
                          <p className="text-xs text-slate-600">
                            Set each one's skill, gender and positions for today. They will not
                            be saved; someone with the database password can add them later.
                          </p>
                          {pending.map((p, i) => (
                            <div
                              key={`pending-${i}`}
                              className="mt-3 rounded-xl border-2 bg-white p-3"
                              style={{ borderColor: COLUMBIA_SOFT }}
                            >
                              <p className="text-sm font-bold" style={{ color: NAVY }}>
                                {fullName(p)}
                              </p>
                              <FieldLabel>Skill level</FieldLabel>
                              <SkillPicker
                                value={p.skill}
                                onChange={(n) => updatePending(i, { skill: n })}
                              />
                              <FieldLabel>Gender</FieldLabel>
                              <GenderPicker
                                value={p.gender}
                                onChange={(g) => updatePending(i, { gender: g })}
                              />
                              <FieldLabel>Positions</FieldLabel>
                              <PositionPicker
                                value={p.positions}
                                onChange={(next) => updatePending(i, { positions: next })}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {preview.skipped.length > 0 && (
                        <div
                          className="mt-3 rounded-xl border-2 bg-white p-3"
                          style={{ borderColor: COLUMBIA }}
                        >
                          <p className="text-sm font-bold" style={{ color: NAVY }}>
                            Skipped {preview.skipped.length} line
                            {preview.skipped.length === 1 ? "" : "s"}
                          </p>
                          {preview.skipped.map((s, i) => (
                            <div key={i} className="mt-2 text-xs">
                              <p className="font-mono text-slate-700">{s.line}</p>
                              <p className="font-semibold" style={{ color: "#8a6d1f" }}>
                                {s.reason}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {pasteTotal === 0 && (
                        <p className="mt-3 text-sm text-slate-600">
                          Nothing could be read from this list.
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={addFromPreview}
                        disabled={pasteTotal === 0 || pendingIncomplete > 0}
                        className="mt-3 h-11 w-full rounded-xl text-sm font-bold text-white disabled:bg-slate-300 disabled:text-slate-500"
                        style={
                          pasteTotal > 0 && pendingIncomplete === 0
                            ? { backgroundColor: BLUE }
                            : undefined
                        }
                      >
                        {pendingIncomplete > 0
                          ? `Set details for ${pendingIncomplete} new player${
                              pendingIncomplete === 1 ? "" : "s"
                            } first`
                          : `Add ${pasteTotal} player${pasteTotal === 1 ? "" : "s"}`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </section>

          {/* Today's list */}
          <section className="px-4 pt-6">
            <div className="mb-2 flex items-center justify-between gap-3">
              <SectionTitle>
                Today: {players.length} player{players.length === 1 ? "" : "s"}
              </SectionTitle>
              {players.length > 0 &&
                (confirmClear ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={clearAll}
                      className="h-11 rounded-xl px-3 text-sm font-bold text-white"
                      style={{ backgroundColor: "#a3242f" }}
                    >
                      Clear {players.length}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="h-11 rounded-xl border-2 bg-white px-3 text-sm font-semibold"
                      style={{ borderColor: COLUMBIA, color: NAVY }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="h-11 rounded-xl border-2 bg-white px-3 text-sm font-semibold"
                    style={{ borderColor: COLUMBIA, color: NAVY }}
                  >
                    Clear all
                  </button>
                ))}
            </div>

            {players.length === 0 ? (
              <p
                className="rounded-2xl border-2 border-dashed bg-white p-6 text-center text-sm"
                style={{ borderColor: COLUMBIA, color: BLUE }}
              >
                No one yet. Add players by name, paste a list, or load the example squad.
              </p>
            ) : (
              <ul className="space-y-2">
                {players.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl border-2 bg-white p-3"
                    style={{ borderColor: COLUMBIA_SOFT }}
                  >
                    <SkillBadge value={p.skill} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold" style={{ color: NAVY }}>
                        {p.name}
                      </p>
                      <PosTags positions={p.positions} gender={p.gender ?? null} />
                    </div>
                    {dbConfigured && <Tag isNew={!p.dbId} />}
                    <button
                      type="button"
                      onClick={() => {
                        setPlayers((prev) => prev.filter((x) => x.id !== p.id));
                        setSplit(null);
                        setRecordNote(null);
                      }}
                      aria-label={`Remove ${p.name} from today`}
                      className="h-11 w-11 shrink-0 rounded-xl border-2 text-lg font-bold"
                      style={{ borderColor: COLUMBIA_SOFT, color: BLUE }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Make teams */}
          <section className="px-4 pt-6">
            <SectionTitle>Make teams</SectionTitle>
            <Card>
              <p className="text-sm font-bold" style={{ color: NAVY }}>
                Number of teams
              </p>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setTeamCount(n);
                      setSplit(null);
                    }}
                    className="h-12 rounded-xl border-2 text-base font-bold transition"
                    style={teamCount === n ? selectedStyle : unselectedStyle}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={run}
                disabled={!canMake}
                className={`mt-3 ${primaryBtn}`}
                style={canMake ? { backgroundColor: BLUE } : undefined}
              >
                Make teams
              </button>
              {!canMake && (
                <p className="mt-2 text-sm" style={{ color: BLUE }}>
                  Need at least {teamCount * 2} players for {teamCount} teams.
                </p>
              )}
              {dbConfigured && missingGenderToday > 0 && (
                <p className="mt-2 text-sm" style={{ color: "#7d6218" }}>
                  {missingGenderToday} player{missingGenderToday === 1 ? " has" : "s have"} no
                  gender saved, so the split of women may be off. Add it on the Players tab.
                </p>
              )}
            </Card>
          </section>

          {/* Results */}
          {split && (
            <section className="px-4 pt-6">
              <div className="flex items-baseline justify-between">
                <SectionTitle>Teams</SectionTitle>
                <span
                  className="rounded-lg px-2 py-1 text-sm font-bold"
                  style={newTagStyle}
                >
                  Skill gap: {skillGap(split.teams)}
                </span>
              </div>

              {split.warning && (
                <p
                  className="mt-2 rounded-xl border-2 p-3 text-sm font-bold"
                  style={{ borderColor: GOLD, backgroundColor: "#fdf8ea", color: "#7d6218" }}
                >
                  {split.warning}
                </p>
              )}
              {reshuffleNote && (
                <p className="mt-2 text-sm" style={{ color: BLUE }}>
                  {reshuffleNote}
                </p>
              )}

              <div className="mt-3 space-y-3">
                {split.teams.map((team, i) => (
                  <div
                    key={i}
                    className="overflow-hidden rounded-2xl border-2 bg-white shadow-sm"
                    style={{ borderColor: COLUMBIA }}
                  >
                    <div
                      className="flex items-baseline justify-between px-4 py-2 text-white"
                      style={{ backgroundColor: NAVY }}
                    >
                      <h3 className="font-extrabold">Team {i + 1}</h3>
                      <span className="text-sm" style={{ color: COLUMBIA }}>
                        {team.players.length} players · {totalSkill(team.players)} skill
                        {womenToday > 0 &&
                          ` · ${countWomen(team.players)} ${
                            countWomen(team.players) === 1 ? "woman" : "women"
                          }`}
                      </span>
                    </div>
                    <ul className="space-y-2 p-4">
                      {team.players.map((p) => (
                        <li key={p.id} className="flex items-center gap-3">
                          <SkillBadge value={p.skill} small />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold" style={{ color: NAVY }}>
                              {p.name}
                              {team.keeperId === p.id && (
                                <span
                                  className="ml-2 rounded-md px-1.5 py-0.5 text-xs font-extrabold"
                                  style={{ backgroundColor: GOLD, color: "#3d2f08" }}
                                >
                                  GK
                                </span>
                              )}
                            </p>
                            <PosTags positions={p.positions} gender={p.gender ?? null} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={run}
                className="mt-3 h-12 w-full rounded-xl border-2 bg-white text-base font-bold"
                style={{ borderColor: BLUE, color: BLUE }}
              >
                Reshuffle
              </button>

              {!confirmed && (
                <button
                  type="button"
                  onClick={confirmTeams}
                  className={`mt-3 ${primaryBtn}`}
                  style={{ backgroundColor: NAVY }}
                >
                  Confirm teams
                </button>
              )}

              {confirmed && formations && (
                <div className="mt-6">
                  <SectionTitle>Line-ups</SectionTitle>
                  <p className="mb-3 text-xs text-slate-600">
                    Tap a player, then a team-mate on the same pitch, to swap their spots.
                  </p>
                  <div className="space-y-4">
                    {formations.map((formation, ti) => (
                      <Card key={ti}>
                        <div className="mb-2 flex items-baseline justify-between">
                          <h3 className="font-extrabold" style={{ color: NAVY }}>
                            Team {ti + 1}
                          </h3>
                          <span className="text-sm font-bold" style={{ color: BLUE }}>
                            {formation.name}
                          </span>
                        </div>
                        <Pitch
                          formation={formation}
                          team={split.teams[ti]!}
                          picked={picked?.team === ti ? picked.slot : null}
                          onTap={(si) => tapSlot(ti, si)}
                        />
                        <button
                          type="button"
                          onClick={() => reshufflePositions(ti)}
                          className="mt-3 h-11 w-full rounded-xl border-2 bg-white text-sm font-bold"
                          style={{ borderColor: BLUE, color: BLUE }}
                        >
                          Reshuffle positions
                        </button>
                      </Card>
                    ))}
                  </div>

                  {/* Record the game */}
                  {dbConfigured && (
                    <div className="mt-6">
                      <SectionTitle>Record this game</SectionTitle>
                      <Card>
                        {!adminPw ? (
                          <p className="text-sm" style={{ color: NAVY }}>
                            Recording a game needs the database password. Unlock it on the{" "}
                            <button
                              type="button"
                              onClick={() => setTab("players")}
                              className="font-bold underline"
                              style={{ color: BLUE }}
                            >
                              Players tab
                            </button>
                            .
                          </p>
                        ) : (
                          <>
                            <FieldLabel htmlFor="game-at">Game date and time</FieldLabel>
                            <input
                              id="game-at"
                              type="datetime-local"
                              value={gameAt}
                              onChange={(e) => setGameAt(e.target.value)}
                              className={inputClass}
                              style={{ borderColor: COLUMBIA_SOFT }}
                            />
                            <p className="mt-2 text-xs text-slate-600">
                              Counts one game for each of the {savedToday.length} player
                              {savedToday.length === 1 ? "" : "s"} in the database.
                              {newToday.length > 0 &&
                                ` ${newToday.length} new player${
                                  newToday.length === 1 ? " is" : "s are"
                                } not in the database and will not be counted.`}
                            </p>
                            <button
                              type="button"
                              onClick={() => void record()}
                              disabled={
                                alreadyRecorded || recordBusy || !gameAt || savedToday.length === 0
                              }
                              className={`mt-3 ${primaryBtn}`}
                              style={
                                alreadyRecorded || recordBusy || savedToday.length === 0
                                  ? undefined
                                  : { backgroundColor: NAVY }
                              }
                            >
                              {alreadyRecorded
                                ? "Game recorded"
                                : recordBusy
                                  ? "Recording..."
                                  : "Record game"}
                            </button>
                          </>
                        )}
                        {recordNote && (
                          <p className="mt-2 text-sm font-semibold" style={{ color: BLUE }}>
                            {recordNote}
                          </p>
                        )}
                      </Card>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        /* ------------------------------ Players tab ------------------------------ */
        <section className="px-4 pt-6">
          {!dbConfigured ? (
            <Card>
              <p className="text-sm text-slate-600">
                The player database is not set up on this copy of the app.
              </p>
            </Card>
          ) : !adminPw ? (
            <>
              <SectionTitle>Player database</SectionTitle>
              <Card>
                <p className="text-sm" style={{ color: NAVY }}>
                  The database holds every player's skill, positions and games played. Only
                  people with the database password can see or change it.
                </p>
                <form onSubmit={(e) => void unlock(e)}>
                  <FieldLabel htmlFor="db-password">Database password</FieldLabel>
                  <input
                    id="db-password"
                    type="password"
                    value={pwInput}
                    onChange={(e) => {
                      setPwInput(e.target.value);
                      setPwError(null);
                    }}
                    autoComplete="current-password"
                    className={inputClass}
                    style={{ borderColor: COLUMBIA_SOFT }}
                  />
                  {pwError && <p className="mt-2 text-sm font-bold text-red-700">{pwError}</p>}
                  <button
                    type="submit"
                    disabled={!pwInput || pwBusy}
                    className={`mt-3 ${primaryBtn}`}
                    style={pwInput && !pwBusy ? { backgroundColor: NAVY } : undefined}
                  >
                    {pwBusy ? "Checking..." : "Unlock"}
                  </button>
                </form>
              </Card>
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold" style={{ color: BLUE }}>
                  Unlocked until you refresh or lock.
                </p>
                <button
                  type="button"
                  onClick={lock}
                  className="h-9 rounded-lg border-2 bg-white px-3 text-xs font-bold"
                  style={{ borderColor: COLUMBIA, color: NAVY }}
                >
                  Lock
                </button>
              </div>

              {dbError && <p className="mb-3 text-sm font-semibold text-red-700">{dbError}</p>}

              {newToday.length > 0 && (
                <div className="mb-6">
                  <SectionTitle>New today, not saved ({newToday.length})</SectionTitle>
                  <Card>
                    <p className="text-xs text-slate-600">
                      Added to today's list without being in the database. Save them with the
                      skill and positions used today.
                    </p>
                    <ul className="mt-2 space-y-2">
                      {newToday.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center gap-3 rounded-xl border-2 p-2"
                          style={{ borderColor: COLUMBIA_SOFT }}
                        >
                          <SkillBadge value={p.skill} small />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold" style={{ color: NAVY }}>
                              {p.name}
                            </p>
                            <PosTags positions={p.positions} gender={p.gender ?? null} />
                          </div>
                          <button
                            type="button"
                            onClick={() => void saveNewToday(p)}
                            disabled={savingNewId === p.id}
                            className="h-9 shrink-0 rounded-lg px-3 text-xs font-bold text-white disabled:bg-slate-300"
                            style={savingNewId === p.id ? undefined : { backgroundColor: BLUE }}
                          >
                            {savingNewId === p.id ? "Saving..." : "Save to database"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </div>
              )}

              <SectionTitle>{editingId ? "Edit player" : "Add a player"}</SectionTitle>
              <Card>
                <form onSubmit={(e) => void savePlayerForm(e)}>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel htmlFor="first">First name</FieldLabel>
                      <input
                        id="first"
                        value={formFirst}
                        onChange={(e) => setFormFirst(e.target.value)}
                        maxLength={30}
                        className={inputClass}
                        style={{ borderColor: COLUMBIA_SOFT }}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="last">Last name</FieldLabel>
                      <input
                        id="last"
                        value={formLast}
                        onChange={(e) => setFormLast(e.target.value)}
                        maxLength={30}
                        className={inputClass}
                        style={{ borderColor: COLUMBIA_SOFT }}
                      />
                    </div>
                  </div>
                  <FieldLabel>Skill level</FieldLabel>
                  <SkillPicker value={formSkill} onChange={setFormSkill} />
                  <FieldLabel>Gender</FieldLabel>
                  <GenderPicker value={formGender} onChange={setFormGender} />
                  <FieldLabel>Positions</FieldLabel>
                  <PositionPicker value={formPositions} onChange={setFormPositions} />
                  {formError && (
                    <p className="mt-3 text-sm font-bold text-red-700">{formError}</p>
                  )}
                  <div className="mt-4 flex gap-2">
                    <button
                      type="submit"
                      disabled={formSaving}
                      className={primaryBtn}
                      style={formSaving ? undefined : { backgroundColor: BLUE }}
                    >
                      {formSaving ? "Saving..." : editingId ? "Save changes" : "Save player"}
                    </button>
                    {editingId && (
                      <button
                        type="button"
                        onClick={resetForm}
                        className="h-12 rounded-xl border-2 bg-white px-4 text-sm font-semibold"
                        style={{ borderColor: COLUMBIA, color: NAVY }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </Card>

              <div className="mt-6">
                <SectionTitle>Paste a list into the database</SectionTitle>
                <Card>
                  {!bulkOpen ? (
                    <button
                      type="button"
                      onClick={() => setBulkOpen(true)}
                      className={`${ghostBtn} w-full`}
                      style={{ borderColor: COLUMBIA, color: NAVY }}
                    >
                      Paste a list of players
                    </button>
                  ) : (
                    <>
                      <p className="text-xs font-semibold" style={{ color: BLUE }}>
                        One player per line: name, skill, M or W, positions. New names are
                        added. Names already in the database are updated if anything differs,
                        and keep their games history. A name plus M or W is enough to fill in a
                        saved player's gender.
                      </p>
                      <textarea
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        placeholder={"Gabriel Pecora, 4, M, MID, ATT\nAna Costa, 3, W, DEF"}
                        rows={8}
                        className="mt-2 w-full rounded-xl border-2 p-3 font-mono text-sm outline-none focus:border-[#1d4f91]"
                        style={{ borderColor: COLUMBIA_SOFT }}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={bulkRead}
                          disabled={!bulkText.trim()}
                          className="h-11 rounded-xl border-2 bg-white text-sm font-bold disabled:opacity-50"
                          style={{ borderColor: BLUE, color: BLUE }}
                        >
                          Read list
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBulkOpen(false);
                            setBulkPreview(null);
                            setBulkPending([]);
                            setBulkNote(null);
                          }}
                          className="h-11 rounded-xl border-2 bg-white text-sm font-semibold"
                          style={{ borderColor: COLUMBIA, color: NAVY }}
                        >
                          Close
                        </button>
                      </div>

                      {bulkNote && (
                        <p className="mt-2 text-sm font-bold" style={{ color: BLUE }}>
                          {bulkNote}
                        </p>
                      )}

                      {bulkPreview && (
                        <div className="mt-3">
                          {bulkChanges.map((p, i) => (
                            <div
                              key={`bulk-${i}`}
                              className="mt-2 flex items-center gap-3 rounded-xl border-2 bg-white p-2"
                              style={{ borderColor: COLUMBIA_SOFT }}
                            >
                              <SkillBadge value={p.skill} small />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold" style={{ color: NAVY }}>
                                  {fullName(p)}
                                </p>
                                <PosTags positions={p.positions} gender={p.gender ?? null} />
                              </div>
                              <span
                                className="shrink-0 rounded-md px-2 py-0.5 text-xs font-bold"
                                style={p.isNew ? newTagStyle : dbTagStyle}
                              >
                                {p.isNew ? "add" : "update"}
                              </span>
                            </div>
                          ))}

                          {bulkPending.length > 0 && (
                            <div
                              className="mt-3 rounded-xl border-2 p-3"
                              style={{ borderColor: GOLD, backgroundColor: "#fdf8ea" }}
                            >
                              <p className="text-sm font-bold" style={{ color: NAVY }}>
                                New players missing details ({bulkPending.length})
                              </p>
                              <p className="text-xs text-slate-600">
                                Set a skill, gender and positions for each before saving.
                              </p>
                              {bulkPending.map((p, i) => (
                                <div
                                  key={`bulk-pending-${i}`}
                                  className="mt-3 rounded-xl border-2 bg-white p-3"
                                  style={{ borderColor: COLUMBIA_SOFT }}
                                >
                                  <p className="text-sm font-bold" style={{ color: NAVY }}>
                                    {fullName(p)}
                                  </p>
                                  <FieldLabel>Skill level</FieldLabel>
                                  <SkillPicker
                                    value={p.skill}
                                    onChange={(n) => updateBulkPending(i, { skill: n })}
                                  />
                                  <FieldLabel>Gender</FieldLabel>
                                  <GenderPicker
                                    value={p.gender}
                                    onChange={(g) => updateBulkPending(i, { gender: g })}
                                  />
                                  <FieldLabel>Positions</FieldLabel>
                                  <PositionPicker
                                    value={p.positions}
                                    onChange={(next) => updateBulkPending(i, { positions: next })}
                                  />
                                </div>
                              ))}
                            </div>
                          )}

                          {bulkUnchanged.length > 0 && (
                            <p className="mt-3 text-xs text-slate-600">
                              Already in the database, nothing to change:{" "}
                              {bulkUnchanged.map(fullName).join(", ")}.
                            </p>
                          )}

                          {bulkPreview.skipped.length > 0 && (
                            <div
                              className="mt-3 rounded-xl border-2 bg-white p-3"
                              style={{ borderColor: COLUMBIA }}
                            >
                              <p className="text-sm font-bold" style={{ color: NAVY }}>
                                Skipped {bulkPreview.skipped.length} line
                                {bulkPreview.skipped.length === 1 ? "" : "s"}
                              </p>
                              {bulkPreview.skipped.map((s, i) => (
                                <div key={i} className="mt-2 text-xs">
                                  <p className="font-mono text-slate-700">{s.line}</p>
                                  <p className="font-semibold" style={{ color: "#8a6d1f" }}>
                                    {s.reason}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => void bulkSave()}
                            disabled={bulkCount === 0 || bulkIncomplete > 0 || bulkSaving}
                            className="mt-3 h-11 w-full rounded-xl text-sm font-bold text-white disabled:bg-slate-300 disabled:text-slate-500"
                            style={
                              bulkCount > 0 && bulkIncomplete === 0 && !bulkSaving
                                ? { backgroundColor: BLUE }
                                : undefined
                            }
                          >
                            {bulkSaving
                              ? "Saving..."
                              : bulkIncomplete > 0
                                ? `Set details for ${bulkIncomplete} new player${
                                    bulkIncomplete === 1 ? "" : "s"
                                  } first`
                                : bulkCount === 0
                                  ? "Nothing to save"
                                  : `Save ${bulkCount} player${bulkCount === 1 ? "" : "s"} to the database`}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </Card>
              </div>

              <div className="mt-6 mb-2 flex items-center justify-between gap-2">
                <SectionTitle>Players ({dbPlayers.length})</SectionTitle>
                <div className="flex gap-1">
                  {(
                    [
                      ["name", "A to Z"],
                      ["games", "Most games"],
                    ] as ["name" | "games", string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSortBy(key)}
                      className="h-9 rounded-lg border-2 px-2 text-xs font-bold"
                      style={sortBy === key ? selectedStyle : unselectedStyle}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {dbMissingGender > 0 && (
                <p
                  className="mb-2 rounded-xl border-2 p-3 text-sm"
                  style={{ borderColor: GOLD, backgroundColor: "#fdf8ea", color: "#7d6218" }}
                >
                  {dbMissingGender} player{dbMissingGender === 1 ? " has" : "s have"} no gender
                  yet. Edit them, or paste their names with M or W in the list above.
                </p>
              )}

              {dbPlayers.length === 0 ? (
                <p
                  className="rounded-2xl border-2 border-dashed bg-white p-6 text-center text-sm"
                  style={{ borderColor: COLUMBIA, color: BLUE }}
                >
                  No players in the database yet. Add one above.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sortedDb.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-xl border-2 bg-white p-3"
                      style={{ borderColor: editingId === p.id ? BLUE : COLUMBIA_SOFT }}
                    >
                      <div className="flex items-center gap-3">
                        <SkillBadge value={p.skill} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold" style={{ color: NAVY }}>
                            {fullName(p)}
                          </p>
                          <PosTags positions={p.positions} gender={p.gender} showMan />
                        </div>
                        <div className="shrink-0 text-right">
                          <p
                            className="text-lg leading-none font-extrabold"
                            style={{ color: NAVY }}
                          >
                            {p.gamesPlayed}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            game{p.gamesPlayed === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => editPlayer(p)}
                          className="h-9 rounded-lg border-2 px-3 text-xs font-bold"
                          style={{ borderColor: COLUMBIA, color: NAVY }}
                        >
                          Edit
                        </button>
                        {confirmRemoveId === p.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void removeSaved(p.id)}
                              className="h-9 rounded-lg px-3 text-xs font-bold text-white"
                              style={{ backgroundColor: "#a3242f" }}
                            >
                              Delete {p.firstName}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveId(null)}
                              className="h-9 rounded-lg border-2 px-3 text-xs font-semibold"
                              style={{ borderColor: COLUMBIA, color: NAVY }}
                            >
                              Keep
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveId(p.id)}
                            className="h-9 rounded-lg border-2 px-3 text-xs font-semibold text-slate-500"
                            style={{ borderColor: COLUMBIA_SOFT }}
                          >
                            Remove
                          </button>
                        )}
                        {p.lastPlayedAt && (
                          <span className="ml-auto text-[11px] text-slate-500">
                            Last game: {formatGameTime(p.lastPlayedAt)}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-8">
                <SectionTitle>Recent games ({games.length})</SectionTitle>
                {games.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No games recorded yet. Make teams on the Pick teams tab, then record the game.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {games.map((g) => (
                      <li
                        key={g.id}
                        className="flex items-center gap-2 rounded-xl border-2 bg-white p-3"
                        style={{ borderColor: COLUMBIA_SOFT }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold" style={{ color: NAVY }}>
                            {formatGameTime(g.playedAt)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {g.players} player{g.players === 1 ? "" : "s"}
                          </p>
                        </div>
                        {confirmGameId === g.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void removeGameEntry(g.id)}
                              className="h-9 rounded-lg px-3 text-xs font-bold text-white"
                              style={{ backgroundColor: "#a3242f" }}
                            >
                              Delete game
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmGameId(null)}
                              className="h-9 rounded-lg border-2 px-3 text-xs font-semibold"
                              style={{ borderColor: COLUMBIA, color: NAVY }}
                            >
                              Keep
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmGameId(g.id)}
                            className="h-9 rounded-lg border-2 px-3 text-xs font-semibold text-slate-500"
                            style={{ borderColor: COLUMBIA_SOFT }}
                          >
                            Remove
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
