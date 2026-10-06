import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  EXAMPLE_PLAYERS,
  POSITIONS,
  POSITION_SHORT,
  makeTeams,
  newId,
  skillGap,
  totalSkill,
  type Player,
  type Position,
  type Split,
} from "./lib/teams";
import {
  parsePlayerList,
  type ParseResult,
  type PendingPlayer,
} from "./lib/parse";
import {
  findSaved,
  friendlyError,
  fullName,
  loadRoster,
  nameKey,
  normaliseSquad,
  recordPractice,
  removeFromRoster,
  rosterConfigured,
  saveToRoster,
  splitName,
  updatePlayer,
  type PlayerDetails,
  type SavedPlayer,
} from "./lib/roster";

const NAVY = "#13375e";
const BLUE = "#1d4f91";
const COLUMBIA = "#b9d9eb";
const COLUMBIA_SOFT = "#e2eff8";
const GOLD = "#c9a43c";

const SQUAD_STORAGE_KEY = "soccer-selector-squad";

/** Shared button styles, so the whole app stays on the club palette. */
const primaryBtn =
  "h-12 w-full rounded-xl text-base font-bold text-white shadow-sm transition disabled:bg-slate-300 disabled:text-slate-500";
const ghostBtn =
  "h-12 rounded-xl border-2 bg-white text-sm font-semibold transition";

const selectedStyle = { borderColor: BLUE, backgroundColor: BLUE, color: "#fff" };
const unselectedStyle = {
  borderColor: COLUMBIA_SOFT,
  backgroundColor: "#fff",
  color: NAVY,
};

type Tab = "teams" | "players";

function readStoredSquad(): string {
  try {
    return localStorage.getItem(SQUAD_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function PosTags({ positions }: { positions: Position[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {positions.map((p) => (
        <span
          key={p}
          className="rounded-md px-1.5 py-0.5 text-xs font-bold"
          style={{ backgroundColor: COLUMBIA_SOFT, color: BLUE }}
        >
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

function SkillPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) {
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
    <div
      className="rounded-2xl border-2 bg-white p-4 shadow-sm"
      style={{ borderColor: COLUMBIA }}
    >
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

export default function App() {
  const [tab, setTab] = useState<Tab>("teams");

  // ---------------------------------------------------------------------------
  // Squad and the saved player database (Supabase)
  // ---------------------------------------------------------------------------
  const [squad, setSquad] = useState(readStoredSquad);
  const [squadInput, setSquadInput] = useState(readStoredSquad);
  const [roster, setRoster] = useState<SavedPlayer[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const dbReady = rosterConfigured && squad.length > 0;

  const refreshRoster = async (code: string) => {
    if (!rosterConfigured || !code) {
      setRoster([]);
      return;
    }
    setRosterLoading(true);
    try {
      setRoster(await loadRoster(code));
      setRosterError(null);
    } catch (err) {
      setRosterError(friendlyError(err));
    } finally {
      setRosterLoading(false);
    }
  };

  useEffect(() => {
    void refreshRoster(squad);
  }, [squad]);

  const openSquad = () => {
    const code = normaliseSquad(squadInput);
    setSquadInput(code);
    setSquad(code);
    try {
      localStorage.setItem(SQUAD_STORAGE_KEY, code);
    } catch {
      /* storage blocked; the squad still works for this visit */
    }
  };

  /** Save players to the database in the background. Today's list works even if this fails. */
  const remember = async (details: PlayerDetails[]) => {
    if (!dbReady || !details.length) return;
    try {
      await saveToRoster(squad, details);
      await refreshRoster(squad);
    } catch (err) {
      setRosterError(friendlyError(err));
    }
  };

  // ---------------------------------------------------------------------------
  // Today's list and teams
  // ---------------------------------------------------------------------------
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamCount, setTeamCount] = useState(2);
  const [split, setSplit] = useState<Split | null>(null);
  const [reshuffleNote, setReshuffleNote] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [practiceNote, setPracticeNote] = useState<string | null>(null);
  const [recordedFor, setRecordedFor] = useState<string | null>(null);

  const todaySignature = players
    .map((p) => nameKey(p.name))
    .sort()
    .join("|");
  const alreadyRecorded = recordedFor === todaySignature;
  const canMake = players.length >= teamCount * 2;

  const inToday = (name: string) =>
    players.some((p) => nameKey(p.name) === nameKey(name));

  const addToToday = (list: { name: string; skill: number; positions: Position[] }[]) => {
    setPlayers((prev) => {
      const next = [...prev];
      for (const p of list) {
        if (next.some((x) => nameKey(x.name) === nameKey(p.name))) continue;
        next.push({ id: newId(), name: p.name, skill: p.skill, positions: [...p.positions] });
      }
      return next;
    });
    setSplit(null);
    setPracticeNote(null);
  };

  const loadExample = () => {
    setPlayers(EXAMPLE_PLAYERS.map((p) => ({ ...p, id: newId() })));
    setSplit(null);
    setConfirmClear(false);
    setPracticeNote(null);
  };

  const clearAll = () => {
    setPlayers([]);
    setSplit(null);
    setConfirmClear(false);
    setReshuffleNote(null);
    setPracticeNote(null);
  };

  const run = () => {
    const { split: next, unchanged } = makeTeams(players, teamCount, split);
    setSplit(next);
    setReshuffleNote(unchanged ? "No other fair split with these players" : null);
  };

  const record = async () => {
    if (!dbReady || !players.length) return;
    const names = players.map((p) => p.name);
    try {
      const counted = await recordPractice(squad, names);
      const notSaved = names.length - counted;
      setRecordedFor(todaySignature);
      setPracticeNote(
        `Practice recorded for ${counted} player${counted === 1 ? "" : "s"}.` +
          (notSaved
            ? ` ${notSaved} ${notSaved === 1 ? "is" : "are"} not in the saved database, so not counted.`
            : ""),
      );
      await refreshRoster(squad);
    } catch (err) {
      setPracticeNote(friendlyError(err));
    }
  };

  // ---------------------------------------------------------------------------
  // Adding one player by name
  // ---------------------------------------------------------------------------
  const [quickName, setQuickName] = useState("");
  const [quickSkill, setQuickSkill] = useState<number | null>(null);
  const [quickPositions, setQuickPositions] = useState<Position[]>([]);
  const [quickError, setQuickError] = useState<string | null>(null);

  const quickTyped = quickName.trim().replace(/\s+/g, " ");
  const quickMatch = quickTyped ? findSaved(quickTyped, roster) : null;
  const quickIsNew = quickTyped.length > 0 && quickMatch?.kind === "none";

  const resetQuick = () => {
    setQuickName("");
    setQuickSkill(null);
    setQuickPositions([]);
    setQuickError(null);
  };

  const submitQuick = (e: FormEvent) => {
    e.preventDefault();
    if (!quickTyped || !quickMatch) return setQuickError("Type a name");

    if (quickMatch.kind === "ambiguous") {
      return setQuickError(
        `More than one ${quickTyped} is saved: ${quickMatch.candidates
          .map(fullName)
          .join(", ")}. Type the last name too.`,
      );
    }

    if (quickMatch.kind === "found") {
      const known = quickMatch.player;
      const name = fullName(known);
      if (inToday(name)) return setQuickError(`${name} is already in today's list`);
      addToToday([{ name, skill: known.skill, positions: known.positions }]);
      resetQuick();
      return;
    }

    // A new name: skill and positions are required, never defaulted.
    if (inToday(quickTyped)) return setQuickError(`${quickTyped} is already in today's list`);
    if (quickSkill === null) return setQuickError("New player: pick a skill level");
    if (!quickPositions.length) return setQuickError("New player: pick at least one position");
    addToToday([{ name: quickTyped, skill: quickSkill, positions: quickPositions }]);
    void remember([{ ...splitName(quickTyped), skill: quickSkill, positions: quickPositions }]);
    resetQuick();
  };

  // ---------------------------------------------------------------------------
  // Pasting a list from WhatsApp
  // ---------------------------------------------------------------------------
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [pending, setPending] = useState<PendingPlayer[]>([]);
  const [pasteNote, setPasteNote] = useState<string | null>(null);

  const pendingIncomplete = pending.filter(
    (p) => p.skill === null || p.positions.length === 0,
  ).length;
  const pasteTotal = (preview?.players.length ?? 0) + pending.length;

  const readList = () => {
    const result = parsePlayerList(
      pasteText,
      players.map((p) => p.name),
      roster,
    );
    setPreview(result);
    setPending(result.needsDetails);
    setPasteNote(null);
  };

  const updatePending = (i: number, patch: Partial<PendingPlayer>) =>
    setPending((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const addFromPreview = () => {
    if (!preview || pendingIncomplete > 0) return;
    const all: PlayerDetails[] = [
      ...preview.players.map((p) => ({
        firstName: p.firstName,
        lastName: p.lastName,
        skill: p.skill,
        positions: p.positions,
      })),
      ...pending.map((p) => ({
        firstName: p.firstName,
        lastName: p.lastName,
        skill: p.skill as number,
        positions: p.positions,
      })),
    ];
    if (!all.length) return;
    addToToday(all.map((p) => ({ name: fullName(p), skill: p.skill, positions: p.positions })));
    // Saves new players, and updates any known player whose line gave a new skill or position.
    void remember(all);
    setPreview(null);
    setPending([]);
    setPasteNote(`Added ${all.length} player${all.length === 1 ? "" : "s"}`);
    if (!preview.skipped.length) setPasteText("");
  };

  // ---------------------------------------------------------------------------
  // Players tab: add, edit and remove saved players
  // ---------------------------------------------------------------------------
  const [formFirst, setFormFirst] = useState("");
  const [formLast, setFormLast] = useState("");
  const [formSkill, setFormSkill] = useState<number | null>(null);
  const [formPositions, setFormPositions] = useState<Position[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "practices">("name");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const resetForm = () => {
    setFormFirst("");
    setFormLast("");
    setFormSkill(null);
    setFormPositions([]);
    setEditingId(null);
    setFormError(null);
  };

  const editPlayer = (p: SavedPlayer) => {
    setEditingId(p.id);
    setFormFirst(p.firstName);
    setFormLast(p.lastName);
    setFormSkill(p.skill);
    setFormPositions([...p.positions]);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const savePlayer = async (e: FormEvent) => {
    e.preventDefault();
    if (!dbReady) return;
    if (!formFirst.trim()) return setFormError("First name is required");
    if (formSkill === null) return setFormError("Pick a skill level");
    if (!formPositions.length) return setFormError("Pick at least one position");
    const details: PlayerDetails = {
      firstName: formFirst,
      lastName: formLast,
      skill: formSkill,
      positions: formPositions,
    };
    setFormSaving(true);
    try {
      if (editingId) await updatePlayer(editingId, details);
      else await saveToRoster(squad, [details]);
      await refreshRoster(squad);
      resetForm();
    } catch (err) {
      setFormError(friendlyError(err));
    } finally {
      setFormSaving(false);
    }
  };

  const removeSaved = async (id: string) => {
    try {
      await removeFromRoster(id);
      setRoster((prev) => prev.filter((p) => p.id !== id));
      setConfirmRemoveId(null);
      if (editingId === id) resetForm();
    } catch (err) {
      setRosterError(friendlyError(err));
    }
  };

  const sortedRoster = [...roster].sort((a, b) =>
    sortBy === "practices"
      ? b.practices - a.practices || fullName(a).localeCompare(fullName(b))
      : fullName(a).localeCompare(fullName(b)),
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl pb-16">
      {/* Header */}
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

      {/* Squad code, shared by both tabs */}
      <section className="px-4 pt-5">
        {!rosterConfigured ? (
          <p className="rounded-xl bg-white p-3 text-sm text-slate-600">
            The saved player database is not set up on this copy of the app. Picking teams still
            works.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label
                htmlFor="squad"
                className="block text-xs font-bold tracking-wide uppercase"
                style={{ color: BLUE }}
              >
                Squad code{squad ? `: ${squad}` : ""}
              </label>
              <input
                id="squad"
                value={squadInput}
                onChange={(e) => setSquadInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && squadInput.trim() && openSquad()}
                placeholder="e.g. cbs-sunday"
                maxLength={40}
                className="mt-1 h-11 w-full rounded-xl border-2 bg-white px-3 text-base outline-none focus:border-[#1d4f91]"
                style={{ borderColor: COLUMBIA_SOFT }}
              />
            </div>
            <button
              type="button"
              onClick={openSquad}
              disabled={!squadInput.trim() || normaliseSquad(squadInput) === squad}
              className="h-11 rounded-xl px-4 text-sm font-bold text-white disabled:bg-slate-300"
              style={
                squadInput.trim() && normaliseSquad(squadInput) !== squad
                  ? { backgroundColor: BLUE }
                  : undefined
              }
            >
              Open
            </button>
          </div>
        )}
        {rosterConfigured && (
          <p className="mt-1 text-xs text-slate-500">
            Everyone using the same code shares the same saved players. It is not a password:
            anyone who knows the code can edit the squad.
          </p>
        )}
        {rosterError && (
          <p className="mt-2 text-sm font-semibold text-red-700">{rosterError}</p>
        )}
      </section>

      {/* Tabs */}
      <nav className="mx-4 mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 shadow-sm">
        {(
          [
            ["teams", "Pick teams"],
            ["players", `Players${dbReady ? ` (${roster.length})` : ""}`],
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
          {/* Add players */}
          <section className="px-4 pt-6">
            <SectionTitle>Who is playing?</SectionTitle>
            <Card>
              <form onSubmit={submitQuick}>
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
                  className="h-12 w-full rounded-xl border-2 px-3 text-base outline-none focus:border-[#1d4f91]"
                  style={{ borderColor: COLUMBIA_SOFT }}
                />

                {quickMatch?.kind === "found" && (
                  <p className="mt-2 text-sm" style={{ color: BLUE }}>
                    Found <strong>{fullName(quickMatch.player)}</strong>, skill{" "}
                    {quickMatch.player.skill},{" "}
                    {quickMatch.player.positions.map((p) => POSITION_SHORT[p]).join(", ")}
                  </p>
                )}
                {quickMatch?.kind === "ambiguous" && (
                  <p className="mt-2 text-sm text-amber-800">
                    More than one {quickTyped}:{" "}
                    {quickMatch.candidates.map(fullName).join(", ")}. Add the last name.
                  </p>
                )}

                {quickIsNew && (
                  <div
                    className="mt-3 rounded-xl border-2 p-3"
                    style={{ borderColor: GOLD, backgroundColor: "#fdf8ea" }}
                  >
                    <p className="text-sm font-bold" style={{ color: NAVY }}>
                      New player. Set their skill and positions
                      {dbReady ? " and they'll be saved for next time." : "."}
                    </p>
                    <FieldLabel>Skill level</FieldLabel>
                    <SkillPicker value={quickSkill} onChange={setQuickSkill} />
                    <FieldLabel>Positions</FieldLabel>
                    <PositionPicker value={quickPositions} onChange={setQuickPositions} />
                  </div>
                )}

                {quickError && (
                  <p className="mt-3 text-sm font-bold text-red-700">{quickError}</p>
                )}

                <button
                  type="submit"
                  disabled={!quickTyped}
                  className={`mt-3 ${primaryBtn}`}
                  style={quickTyped ? { backgroundColor: BLUE } : undefined}
                >
                  Add to today
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
                    One player per line. Saved players only need a name. New players need
                    a skill and positions, or you'll be asked for them.
                  </p>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={"Marlo Silva\nMario Braga, 5, Goalkeeper"}
                    rows={6}
                    className="mt-2 w-full rounded-xl border-2 p-3 font-mono text-sm outline-none focus:border-[#1d4f91]"
                    style={{ borderColor: COLUMBIA_SOFT }}
                  />
                  <button
                    type="button"
                    onClick={readList}
                    className="h-11 w-full rounded-xl border-2 bg-white text-sm font-bold"
                    style={{ borderColor: BLUE, color: BLUE }}
                  >
                    Read list
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
                            <PosTags positions={p.positions} />
                          </div>
                          <span
                            className="shrink-0 rounded-md px-2 py-0.5 text-xs font-bold"
                            style={
                              p.isNew
                                ? { backgroundColor: "#f5ead0", color: "#7d6218" }
                                : { backgroundColor: COLUMBIA_SOFT, color: BLUE }
                            }
                          >
                            {p.isNew ? "new" : p.fromRoster ? "from database" : "saved"}
                          </span>
                        </div>
                      ))}

                      {pending.length > 0 && (
                        <div
                          className="mt-3 rounded-xl border-2 p-3"
                          style={{ borderColor: GOLD, backgroundColor: "#fdf8ea" }}
                        >
                          <p className="text-sm font-bold" style={{ color: NAVY }}>
                            New players: needs details ({pending.length})
                          </p>
                          <p className="text-xs text-slate-600">
                            These names are not saved yet. Set each one's skill and positions
                            to add them.
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
                          className="mt-3 rounded-xl border-2 p-3"
                          style={{ borderColor: COLUMBIA, backgroundColor: "#ffffff" }}
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
                      <PosTags positions={p.positions} />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPlayers((prev) => prev.filter((x) => x.id !== p.id));
                        setSplit(null);
                        setPracticeNote(null);
                      }}
                      aria-label={`Remove ${p.name} from today`}
                      className="h-11 w-11 rounded-xl border-2 text-lg font-bold"
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
            </Card>
          </section>

          {/* Results */}
          {split && (
            <section className="px-4 pt-6">
              <div className="flex items-baseline justify-between">
                <SectionTitle>Teams</SectionTitle>
                <span
                  className="rounded-lg px-2 py-1 text-sm font-bold"
                  style={{ backgroundColor: "#f5ead0", color: "#7d6218" }}
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
                            <PosTags positions={p.positions} />
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

              {dbReady && (
                <>
                  <button
                    type="button"
                    onClick={() => void record()}
                    disabled={alreadyRecorded}
                    className={`mt-2 ${primaryBtn}`}
                    style={alreadyRecorded ? undefined : { backgroundColor: NAVY }}
                  >
                    {alreadyRecorded ? "Practice recorded" : "Record practice"}
                  </button>
                  <p className="mt-1 text-xs text-slate-500">
                    Adds one practice to everyone in today's list. Do this once, when the
                    teams are final.
                  </p>
                </>
              )}
              {practiceNote && (
                <p className="mt-2 text-sm font-semibold" style={{ color: BLUE }}>
                  {practiceNote}
                </p>
              )}
            </section>
          )}
        </>
      ) : (
        /* ------------------------------ Players tab ------------------------------ */
        <section className="px-4 pt-6">
          {!rosterConfigured ? (
            <Card>
              <p className="text-sm text-slate-600">
                The saved player database is not set up on this copy of the app.
              </p>
            </Card>
          ) : !squad ? (
            <Card>
              <p className="text-sm" style={{ color: NAVY }}>
                Type a squad code above and tap <strong>Open</strong> to see and save players.
              </p>
            </Card>
          ) : (
            <>
              <SectionTitle>{editingId ? "Edit player" : "Add a player"}</SectionTitle>
              <Card>
                <form onSubmit={(e) => void savePlayer(e)}>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel htmlFor="first">First name</FieldLabel>
                      <input
                        id="first"
                        value={formFirst}
                        onChange={(e) => setFormFirst(e.target.value)}
                        maxLength={30}
                        className="h-12 w-full rounded-xl border-2 px-3 text-base outline-none focus:border-[#1d4f91]"
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
                        className="h-12 w-full rounded-xl border-2 px-3 text-base outline-none focus:border-[#1d4f91]"
                        style={{ borderColor: COLUMBIA_SOFT }}
                      />
                    </div>
                  </div>
                  <FieldLabel>Skill level</FieldLabel>
                  <SkillPicker value={formSkill} onChange={setFormSkill} />
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

              <div className="mt-6 mb-2 flex items-center justify-between gap-2">
                <SectionTitle>
                  Saved players
                  <span className="font-normal text-slate-500">
                    {" "}
                    ({rosterLoading ? "loading" : roster.length})
                  </span>
                </SectionTitle>
                <div className="flex gap-1">
                  {(
                    [
                      ["name", "A to Z"],
                      ["practices", "Most practices"],
                    ] as ["name" | "practices", string][]
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

              {!rosterLoading && roster.length === 0 ? (
                <p
                  className="rounded-2xl border-2 border-dashed bg-white p-6 text-center text-sm"
                  style={{ borderColor: COLUMBIA, color: BLUE }}
                >
                  No saved players in {squad} yet. Add one above, or add players on the Pick
                  teams tab and they'll be saved here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sortedRoster.map((p) => {
                    const playing = inToday(fullName(p));
                    return (
                      <li
                        key={p.id}
                        className="rounded-xl border-2 bg-white p-3"
                        style={{
                          borderColor: editingId === p.id ? BLUE : COLUMBIA_SOFT,
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <SkillBadge value={p.skill} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-bold" style={{ color: NAVY }}>
                              {fullName(p)}
                            </p>
                            <PosTags positions={p.positions} />
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-lg leading-none font-extrabold" style={{ color: NAVY }}>
                              {p.practices}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              practice{p.practices === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              addToToday([
                                { name: fullName(p), skill: p.skill, positions: p.positions },
                              ])
                            }
                            disabled={playing}
                            className="h-9 rounded-lg px-3 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-slate-500"
                            style={playing ? undefined : { backgroundColor: BLUE }}
                          >
                            {playing ? "Playing today" : "Add to today"}
                          </button>
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
                          {p.lastPracticeAt && (
                            <span className="ml-auto text-[11px] text-slate-500">
                              Last: {new Date(p.lastPracticeAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
