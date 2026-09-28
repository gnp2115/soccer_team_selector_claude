import { useState } from "react";
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

const TEST_LIST_PLACEHOLDER = "Mario Braga, 5, Goalkeeper";

function PosTags({ positions }: { positions: Position[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {positions.map((p) => (
        <span
          key={p}
          className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800"
        >
          {POSITION_SHORT[p]}
        </span>
      ))}
    </div>
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

  const canMake = players.length >= teamCount * 2;

  const togglePosition = (p: Position) =>
    setPositions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );

  const addPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setFormError("Give the player a name");
    if (!positions.length) return setFormError("Pick at least one position");
    setPlayers((prev) => [
      ...prev,
      { id: newId(), name: name.trim(), skill, positions: [...positions] },
    ]);
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
    const result = parsePlayerList(
      pasteText,
      players.map((p) => p.name),
    );
    setPreview(result);
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
    setSplit(null);
    setPreview(null);
    setPasteNote(`Added ${count} player${count === 1 ? "" : "s"}`);
    if (!preview.skipped.length) setPasteText("");
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl pb-16">
      <header className="bg-emerald-700 px-4 py-6 text-white">
        <h1 className="text-2xl font-extrabold">Soccer Team Selector</h1>
        <p className="mt-1 text-sm text-emerald-50">
          Fair sides in one tap, balanced by skill, keepers and positions.
        </p>
      </header>

      {/* Add players */}
      <section className="px-4 pt-6">
        <h2 className="mb-3 text-lg font-bold">Add players</h2>
        <form
          onSubmit={addPlayer}
          className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"
        >
          <label className="block text-sm font-semibold" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Marlo"
            className="mt-1 h-12 w-full rounded-xl border border-slate-200 px-3 text-base"
          />

          <p className="mt-4 text-sm font-semibold">Skill level</p>
          <div className="mt-1 grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSkill(n)}
                className={`h-12 rounded-xl border text-base font-bold ${
                  skill === n
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-slate-200 bg-white"
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <p className="mt-4 text-sm font-semibold">Positions</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {POSITIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePosition(p)}
                className={`h-12 rounded-xl border text-sm font-semibold ${
                  positions.includes(p)
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-slate-200 bg-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {formError && (
            <p className="mt-3 text-sm font-semibold text-red-600">
              {formError}
            </p>
          )}

          <button
            type="submit"
            className="mt-4 h-12 w-full rounded-xl bg-emerald-700 text-base font-bold text-white"
          >
            Add player
          </button>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={loadExample}
              className="h-12 rounded-xl border border-slate-200 bg-white text-sm font-semibold"
            >
              Load example players
            </button>
            <button
              type="button"
              onClick={() => setPasteOpen((v) => !v)}
              className="h-12 rounded-xl border border-slate-200 bg-white text-sm font-semibold"
            >
              Paste list
            </button>
          </div>

          {pasteOpen && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-600">
                One player per line: name, skill, positions
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={TEST_LIST_PLACEHOLDER}
                rows={6}
                className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-mono text-sm"
              />
              <button
                type="button"
                onClick={readList}
                className="h-11 w-full rounded-xl border border-emerald-700 bg-white text-sm font-bold text-emerald-800"
              >
                Read list
              </button>

              {pasteNote && (
                <p className="mt-2 text-sm font-semibold text-emerald-800">
                  {pasteNote}
                </p>
              )}

              {preview && (
                <div className="mt-3">
                  {preview.players.map((p, i) => (
                    <div
                      key={`${p.name}-${i}`}
                      className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">
                        {p.skill}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {p.name}
                        </p>
                        <PosTags positions={p.positions} />
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
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm font-bold text-amber-900">
                        Skipped {preview.skipped.length} line
                        {preview.skipped.length === 1 ? "" : "s"}
                      </p>
                      {preview.skipped.map((s, i) => (
                        <div key={i} className="mt-2 text-xs">
                          <p className="font-mono text-slate-700">{s.line}</p>
                          <p className="text-amber-800">{s.reason}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {preview.players.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-600">
                      Nothing could be read from this list.
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={addFromPreview}
                    disabled={preview.players.length === 0}
                    className="mt-3 h-11 w-full rounded-xl bg-emerald-700 text-sm font-bold text-white disabled:bg-slate-300"
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
          <h2 className="text-lg font-bold">
            {players.length} player{players.length === 1 ? "" : "s"}
          </h2>
          {players.length > 0 &&
            (confirmClear ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearAll}
                  className="h-11 rounded-xl bg-red-600 px-3 text-sm font-semibold text-white"
                >
                  Clear {players.length}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600"
              >
                Clear all
              </button>
            ))}
        </div>

        {players.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No players yet. Add someone or load the example squad.
          </p>
        ) : (
          <ul className="space-y-2">
            {players.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">
                  {p.skill}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.name}</p>
                  <PosTags positions={p.positions} />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPlayers((prev) => prev.filter((x) => x.id !== p.id));
                    setSplit(null);
                  }}
                  aria-label={`Remove ${p.name}`}
                  className="h-11 w-11 rounded-xl border border-slate-200 text-lg font-bold text-slate-500"
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
        <h2 className="mb-2 text-lg font-bold">Make teams</h2>
        <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold">Number of teams</p>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setTeamCount(n);
                  setSplit(null);
                }}
                className={`h-12 rounded-xl border text-base font-bold ${
                  teamCount === n
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-slate-200 bg-white"
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={run}
            disabled={!canMake}
            className="mt-3 h-12 w-full rounded-xl bg-emerald-700 text-base font-bold text-white disabled:bg-slate-300"
          >
            Make teams
          </button>
          {!canMake && (
            <p className="mt-2 text-sm text-slate-600">
              Need at least {teamCount * 2} players for {teamCount} teams.
            </p>
          )}
        </div>
      </section>

      {/* Results */}
      {split && (
        <section className="px-4 pt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Teams</h2>
            <span className="text-sm font-semibold text-slate-600">
              Skill gap: {skillGap(split.teams)}
            </span>
          </div>

          {split.warning && (
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              {split.warning}
            </p>
          )}
          {reshuffleNote && (
            <p className="mt-2 text-sm text-slate-600">{reshuffleNote}</p>
          )}

          <div className="mt-3 space-y-3">
            {split.teams.map((team, i) => (
              <div
                key={i}
                className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="font-bold">Team {i + 1}</h3>
                  <span className="text-sm text-slate-600">
                    {team.players.length} players ·{" "}
                    {totalSkill(team.players)} skill
                  </span>
                </div>
                <ul className="mt-2 space-y-2">
                  {team.players.map((p) => (
                    <li key={p.id} className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">
                        {p.skill}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {p.name}
                          {team.keeperId === p.id && (
                            <span className="ml-2 rounded-md bg-emerald-700 px-1.5 py-0.5 text-xs font-bold text-white">
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
            className="mt-3 h-12 w-full rounded-xl border border-emerald-700 bg-white text-base font-bold text-emerald-800"
          >
            Reshuffle
          </button>
        </section>
      )}
    </div>
  );
}
