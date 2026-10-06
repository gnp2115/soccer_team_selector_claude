import { useEffect, useState } from "react";
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
import { parsePlayerList, type ParseResult } from "./lib/parse";
import {
  loadRoster,
  nameKey,
  normaliseSquad,
  removeFromRoster,
  rosterConfigured,
  saveToRoster,
  type SavedPlayer,
} from "./lib/roster";

const SQUAD_STORAGE_KEY = "soccer-selector-squad";

function readStoredSquad(): string {
  try {
    return localStorage.getItem(SQUAD_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

const NAVY = "#13375e";
const BLUE = "#1d4f91";
const COLUMBIA = "#b9d9eb";
const COLUMBIA_SOFT = "#e2eff8";
const GOLD = "#c9a43c";

/** Shared button styles, so the whole app stays on the club palette. */
const primaryBtn =
  "h-12 w-full rounded-xl text-base font-bold text-white shadow-sm transition disabled:bg-slate-300 disabled:text-slate-500";
const ghostBtn =
  "h-12 rounded-xl border-2 bg-white text-sm font-semibold transition";

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

export default function App() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState("");
  const [skill, setSkill] = useState(3);
  const [positions, setPositions] = useState<Position[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const [teamCount, setTeamCount] = useState(2);
  const [split, setSplit] = useState<Split | null>(null);
  const [reshuffleNote, setReshuffleNote] = useState<string | null>(null);

  const [confirmClear, setConfirmClear] = useState(false);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [pasteNote, setPasteNote] = useState<string | null>(null);

  // The saved roster for the current squad, stored in Supabase.
  const [squad, setSquad] = useState(readStoredSquad);
  const [squadInput, setSquadInput] = useState(readStoredSquad);
  const [roster, setRoster] = useState<SavedPlayer[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

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
      setRosterError(err instanceof Error ? err.message : "Could not load the roster");
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

  /** Save to the roster in the background. Today's list works even if this fails. */
  const remember = async (
    toSave: Pick<Player, "name" | "skill" | "positions">[],
  ) => {
    if (!rosterConfigured || !squad || !toSave.length) return;
    try {
      await saveToRoster(squad, toSave);
      await refreshRoster(squad);
    } catch (err) {
      setRosterError(err instanceof Error ? err.message : "Could not save to the roster");
    }
  };

  const forget = async (id: string) => {
    try {
      await removeFromRoster(id);
      setRoster((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setRosterError(err instanceof Error ? err.message : "Could not remove that player");
    }
  };

  const inToday = (playerName: string) =>
    players.some((p) => nameKey(p.name) === nameKey(playerName));

  const addFromRoster = (saved: SavedPlayer) => {
    if (inToday(saved.name)) return;
    setPlayers((prev) => [
      ...prev,
      { id: newId(), name: saved.name, skill: saved.skill, positions: [...saved.positions] },
    ]);
    setSplit(null);
  };

  const canMake = players.length >= teamCount * 2;

  const togglePosition = (p: Position) =>
    setPositions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );

  const addPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setFormError("Give the player a name");
    if (!positions.length) return setFormError("Pick at least one position");
    const added = { id: newId(), name: name.trim(), skill, positions: [...positions] };
    setPlayers((prev) => [...prev, added]);
    void remember([added]);
    setName("");
    setSkill(3);
    setPositions([]);
    setFormError(null);
    setSplit(null);
  };

  const loadExample = () => {
    setPlayers(EXAMPLE_PLAYERS.map((p) => ({ ...p, id: newId() })));
    setSplit(null);
    setConfirmClear(false);
  };

  const clearAll = () => {
    setPlayers([]);
    setSplit(null);
    setConfirmClear(false);
    setReshuffleNote(null);
  };

  const run = () => {
    const { split: next, unchanged } = makeTeams(players, teamCount, split);
    setSplit(next);
    setReshuffleNote(
      unchanged ? "No other fair split with these players" : null,
    );
  };

  const readList = () => {
    setPreview(
      parsePlayerList(
        pasteText,
        players.map((p) => p.name),
        roster,
      ),
    );
    setPasteNote(null);
  };

  const addFromPreview = () => {
    if (!preview || !preview.players.length) return;
    const count = preview.players.length;
    setPlayers((prev) => [
      ...prev,
      ...preview.players.map((p) => ({
        id: newId(),
        name: p.name,
        skill: p.skill,
        positions: p.positions,
      })),
    ]);
    void remember(preview.players);
    setSplit(null);
    setPreview(null);
    setPasteNote(`Added ${count} player${count === 1 ? "" : "s"}`);
    if (!preview.skipped.length) setPasteText("");
  };

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
          <h1 className="text-2xl leading-tight font-extrabold">
            Team Selector
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: COLUMBIA }}>
            Fair sides in one tap, balanced by skill, keepers and positions.
          </p>
        </div>
      </header>

      {/* Squad and saved roster */}
      <section className="px-4 pt-6">
        <h2 className="mb-3 text-lg font-bold" style={{ color: NAVY }}>
          Your squad
        </h2>
        <div
          className="rounded-2xl border-2 bg-white p-4 shadow-sm"
          style={{ borderColor: COLUMBIA }}
        >
          {!rosterConfigured ? (
            <p className="text-sm text-slate-600">
              Saved rosters are not set up on this copy of the app. Everything else still works.
            </p>
          ) : (
            <>
              <label
                className="block text-sm font-bold"
                htmlFor="squad"
                style={{ color: NAVY }}
              >
                Squad code
              </label>
              <p className="text-xs text-slate-500">
                Everyone who uses the same code shares the same saved players. Not a password:
                anyone who knows the code can edit the squad.
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  id="squad"
                  value={squadInput}
                  onChange={(e) => setSquadInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && squadInput.trim() && openSquad()}
                  placeholder="e.g. cbs-sunday"
                  maxLength={40}
                  className="h-12 min-w-0 flex-1 rounded-xl border-2 px-3 text-base outline-none focus:border-[#1d4f91]"
                  style={{ borderColor: COLUMBIA_SOFT }}
                />
                <button
                  type="button"
                  onClick={openSquad}
                  disabled={!squadInput.trim()}
                  className="h-12 rounded-xl px-4 text-sm font-bold text-white disabled:bg-slate-300"
                  style={squadInput.trim() ? { backgroundColor: BLUE } : undefined}
                >
                  Open
                </button>
              </div>

              {rosterError && (
                <p className="mt-3 text-sm font-semibold text-red-700">{rosterError}</p>
              )}

              {squad && (
                <div className="mt-4">
                  <p className="text-sm font-bold" style={{ color: NAVY }}>
                    Saved players in <span style={{ color: BLUE }}>{squad}</span>
                    <span className="font-normal text-slate-500">
                      {" "}
                      ({rosterLoading ? "loading" : roster.length})
                    </span>
                  </p>
                  {!rosterLoading && roster.length === 0 ? (
                    <p className="mt-1 text-xs text-slate-500">
                      No one saved yet. Anyone you add below is saved here automatically.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {roster.map((p) => {
                        const already = inToday(p.name);
                        return (
                          <li
                            key={p.id}
                            className="flex items-center gap-2 rounded-xl border-2 bg-white p-2"
                            style={{ borderColor: COLUMBIA_SOFT }}
                          >
                            <SkillBadge value={p.skill} small />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold" style={{ color: NAVY }}>
                                {p.name}
                              </p>
                              <PosTags positions={p.positions} />
                            </div>
                            <button
                              type="button"
                              onClick={() => addFromRoster(p)}
                              disabled={already}
                              className="h-9 rounded-lg px-3 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-slate-500"
                              style={already ? undefined : { backgroundColor: BLUE }}
                            >
                              {already ? "Playing" : "Add"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void forget(p.id)}
                              aria-label={`Remove ${p.name} from the saved roster`}
                              className="h-9 w-9 rounded-lg border-2 text-base font-bold"
                              style={{ borderColor: COLUMBIA_SOFT, color: BLUE }}
                            >
                              ×
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Add players */}
      <section className="px-4 pt-6">
        <h2 className="mb-3 text-lg font-bold" style={{ color: NAVY }}>
          Add players
        </h2>
        <form
          onSubmit={addPlayer}
          className="rounded-2xl border-2 bg-white p-4 shadow-sm"
          style={{ borderColor: COLUMBIA }}
        >
          <label
            className="block text-sm font-bold"
            htmlFor="name"
            style={{ color: NAVY }}
          >
            Name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Marlo"
            className="mt-1 h-12 w-full rounded-xl border-2 px-3 text-base outline-none focus:border-[#1d4f91]"
            style={{ borderColor: COLUMBIA_SOFT }}
          />

          <p className="mt-4 text-sm font-bold" style={{ color: NAVY }}>
            Skill level
          </p>
          <div className="mt-1 grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSkill(n)}
                className="h-12 rounded-xl border-2 text-base font-bold transition"
                style={
                  skill === n
                    ? { borderColor: BLUE, backgroundColor: BLUE, color: "#fff" }
                    : {
                        borderColor: COLUMBIA_SOFT,
                        backgroundColor: "#fff",
                        color: NAVY,
                      }
                }
              >
                {n}
              </button>
            ))}
          </div>

          <p className="mt-4 text-sm font-bold" style={{ color: NAVY }}>
            Positions
          </p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {POSITIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePosition(p)}
                className="h-12 rounded-xl border-2 text-sm font-semibold transition"
                style={
                  positions.includes(p)
                    ? { borderColor: BLUE, backgroundColor: BLUE, color: "#fff" }
                    : {
                        borderColor: COLUMBIA_SOFT,
                        backgroundColor: "#fff",
                        color: NAVY,
                      }
                }
              >
                {p}
              </button>
            ))}
          </div>

          {formError && (
            <p className="mt-3 text-sm font-bold text-red-700">{formError}</p>
          )}

          <button
            type="submit"
            className={`mt-4 ${primaryBtn}`}
            style={{ backgroundColor: BLUE }}
          >
            Add player
          </button>

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
                One player per line: name, skill, positions
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Mario Braga, 5, Goalkeeper"
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
                      key={`${p.name}-${i}`}
                      className="mt-2 flex items-center gap-3 rounded-xl border-2 bg-white p-2"
                      style={{ borderColor: COLUMBIA_SOFT }}
                    >
                      <SkillBadge value={p.skill} small />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm font-bold"
                          style={{ color: NAVY }}
                        >
                          {p.name}
                        </p>
                        <PosTags positions={p.positions} />
                        {p.fromRoster && (
                          <p
                            className="mt-1 text-xs font-semibold"
                            style={{ color: BLUE }}
                          >
                            from roster
                          </p>
                        )}
                        {(p.skillDefaulted || p.positionDefaulted) && (
                          <p className="mt-1 text-xs text-slate-500">
                            {[
                              p.skillDefaulted ? "skill 3 (default)" : null,
                              p.positionDefaulted
                                ? "Midfielder (default)"
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}

                  {preview.skipped.length > 0 && (
                    <div
                      className="mt-3 rounded-xl border-2 p-3"
                      style={{
                        borderColor: GOLD,
                        backgroundColor: "#fdf8ea",
                      }}
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

                  {preview.players.length === 0 && (
                    <p className="mt-3 text-sm text-slate-600">
                      Nothing could be read from this list.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={addFromPreview}
                    disabled={preview.players.length === 0}
                    className="mt-3 h-11 w-full rounded-xl text-sm font-bold text-white disabled:bg-slate-300 disabled:text-slate-500"
                    style={
                      preview.players.length
                        ? { backgroundColor: BLUE }
                        : undefined
                    }
                  >
                    Add {preview.players.length} player
                    {preview.players.length === 1 ? "" : "s"}
                  </button>
                </div>
              )}
            </div>
          )}
        </form>
      </section>

      {/* Roster */}
      <section className="px-4 pt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold" style={{ color: NAVY }}>
            {players.length} player{players.length === 1 ? "" : "s"}
          </h2>
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
            No players yet. Add someone or load the example squad.
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
                  }}
                  aria-label={`Remove ${p.name}`}
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
        <h2 className="mb-2 text-lg font-bold" style={{ color: NAVY }}>
          Make teams
        </h2>
        <div
          className="rounded-2xl border-2 bg-white p-4 shadow-sm"
          style={{ borderColor: COLUMBIA }}
        >
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
                style={
                  teamCount === n
                    ? { borderColor: BLUE, backgroundColor: BLUE, color: "#fff" }
                    : {
                        borderColor: COLUMBIA_SOFT,
                        backgroundColor: "#fff",
                        color: NAVY,
                      }
                }
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
        </div>
      </section>

      {/* Results */}
      {split && (
        <section className="px-4 pt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold" style={{ color: NAVY }}>
              Teams
            </h2>
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
              style={{
                borderColor: GOLD,
                backgroundColor: "#fdf8ea",
                color: "#7d6218",
              }}
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
                    {team.players.length} players · {totalSkill(team.players)}{" "}
                    skill
                  </span>
                </div>
                <ul className="space-y-2 p-4">
                  {team.players.map((p) => (
                    <li key={p.id} className="flex items-center gap-3">
                      <SkillBadge value={p.skill} small />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm font-bold"
                          style={{ color: NAVY }}
                        >
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
        </section>
      )}
    </div>
  );
}
