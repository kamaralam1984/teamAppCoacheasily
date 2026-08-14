import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useSaveGoal } from "@/hooks/useGoals";
import type { Cycle } from "@/lib/goals";
import type { Profile } from "@/lib/warriors";

interface Row {
  key: string;
  person: string;
  name: string;
  metric: string;
  baseline: string;
  target: string;
  unit: string;
}

const SAMPLE =
  "Kirti | Enrolments this cycle | Enrolments closed | 12 | 30 | students\nSaurabh | Reels published | Reels | 40 | 120 | reels";

function normalise(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** A name matches a warrior on full name, first name, or a unique prefix. */
function matchPerson(raw: string, people: Profile[]): Profile | null {
  const q = normalise(raw);
  if (!q) return null;
  const active = people.filter((p) => p.status === "active");
  const exact = active.filter((p) => normalise(p.full_name) === q);
  if (exact.length === 1) return exact[0]!;
  const first = active.filter((p) => normalise(p.full_name).split(" ")[0] === q);
  if (first.length === 1) return first[0]!;
  const starts = active.filter((p) => normalise(p.full_name).startsWith(q));
  if (starts.length === 1) return starts[0]!;
  return null;
}

function parse(text: string): Row[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^name\s*\|/i.test(l))
    .map((line, i) => {
      const c = line.split("|").map((x) => x.trim());
      return {
        key: `${i}-${line.slice(0, 12)}`,
        person: c[0] ?? "",
        name: c[1] ?? "",
        metric: c[2] ?? "",
        baseline: c[3] ?? "0",
        target: c[4] ?? "",
        unit: c[5] ?? "",
      };
    });
}

/** People & Culture type up goal documents once, review, then commit. */
export function ImportGoals({
  cycle,
  orgId,
  people,
  style,
}: {
  cycle: Cycle;
  orgId: string;
  people: Profile[];
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const save = useSaveGoal();

  const resolved = useMemo(
    () => (rows ?? []).map((r) => ({ row: r, person: matchPerson(r.person, people) })),
    [rows, people],
  );

  const problems = resolved.filter(
    ({ row, person }) =>
      !person ||
      !row.name ||
      !row.target ||
      Number.isNaN(Number(row.target)) ||
      Number.isNaN(Number(row.baseline || "0")) ||
      Number(row.target) === Number(row.baseline || "0"),
  );
  const ready = resolved.length - problems.length;

  const patch = (key: string, field: keyof Row, value: string) =>
    setRows((prev) => (prev ?? []).map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const commit = async () => {
    setBusy(true);
    let made = 0;
    try {
      for (const { row, person } of resolved) {
        if (!person || !row.name || !row.target) continue;
        const baseline = Number(row.baseline || "0");
        const target = Number(row.target);
        if (Number.isNaN(baseline) || Number.isNaN(target) || baseline === target) continue;
        await save.mutateAsync({
          profile_id: person.id,
          org_id: orgId,
          cycle_id: cycle.id,
          kind: "number",
          name: row.name,
          metric: row.metric || null,
          unit: row.unit || null,
          baseline,
          target,
          stages: null,
          plan: null,
        });
        made += 1;
      }
      toast.success(`${made} goal${made === 1 ? "" : "s"} added to ${cycle.name}.`);
      setRows(null);
      setText("");
      setOpen(false);
    } catch {
      toast.error("Some rows didn't save. Nothing was lost — fix and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="ce-rise min-h-11 w-full rounded-full border border-line bg-ivory px-4 text-[13px] font-bold text-ink sm:w-auto"
        style={style}
        onClick={() => setOpen(true)}
      >
        ⇪ Import goals
      </button>
    );
  }

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <h2 className="font-display text-2xl text-ink">Import goals into {cycle.name}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-soft">
        One goal a line, columns separated by a pipe:
        <br />
        <span className="font-bold text-ink">
          Name | Goal | What you're counting | Today | Target | Unit
        </span>
      </p>

      {!rows ? (
        <>
          <textarea
            className="ce-input mt-4 min-h-40 w-full font-mono text-[13px]"
            placeholder={SAMPLE}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn3d w-full sm:w-auto"
              disabled={!text.trim()}
              onClick={() => setRows(parse(text))}
            >
              Review {parse(text).length || ""} rows
            </button>
            <button
              type="button"
              className="min-h-11 rounded-full border border-line bg-ivory px-4 text-[13px] font-bold text-soft"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-4 text-[13px] font-bold text-ink">
            {ready} ready · {problems.length} need a look
          </p>

          <div className="mt-3 space-y-3">
            {resolved.map(({ row, person }) => {
              const bad = !person;
              return (
                <div
                  key={row.key}
                  className={`rounded-[14px] border p-3 ${
                    bad ? "border-red/50 bg-red/8" : "border-line bg-cream"
                  }`}
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label>
                      <span className="ce-label">Warrior</span>
                      <input
                        className="ce-input"
                        value={row.person}
                        onChange={(e) => patch(row.key, "person", e.target.value)}
                      />
                      <span
                        className={`mt-1 block text-[11px] font-bold ${
                          person ? "text-goldD" : "text-red"
                        }`}
                      >
                        {person ? `→ ${person.full_name}` : "No warrior with that name"}
                      </span>
                    </label>
                    <label>
                      <span className="ce-label">Goal</span>
                      <input
                        className="ce-input"
                        value={row.name}
                        onChange={(e) => patch(row.key, "name", e.target.value)}
                      />
                    </label>
                    <label>
                      <span className="ce-label">What you're counting</span>
                      <input
                        className="ce-input"
                        value={row.metric}
                        onChange={(e) => patch(row.key, "metric", e.target.value)}
                      />
                    </label>
                    <label>
                      <span className="ce-label">Unit</span>
                      <input
                        className="ce-input"
                        value={row.unit}
                        onChange={(e) => patch(row.key, "unit", e.target.value)}
                      />
                    </label>
                    <label>
                      <span className="ce-label">Today</span>
                      <input
                        className="ce-input"
                        inputMode="decimal"
                        value={row.baseline}
                        onChange={(e) => patch(row.key, "baseline", e.target.value)}
                      />
                    </label>
                    <label>
                      <span className="ce-label">Target</span>
                      <input
                        className="ce-input"
                        inputMode="decimal"
                        value={row.target}
                        onChange={(e) => patch(row.key, "target", e.target.value)}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="mt-2 text-[12px] font-bold text-soft underline"
                    onClick={() => setRows((prev) => (prev ?? []).filter((r) => r.key !== row.key))}
                  >
                    Remove this row
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn3d w-full sm:w-auto"
              disabled={busy || ready === 0}
              onClick={() => void commit()}
            >
              {busy ? "Creating…" : `Create ${ready} goal${ready === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-full border border-line bg-ivory px-4 text-[13px] font-bold text-soft"
              onClick={() => setRows(null)}
            >
              Back to paste
            </button>
          </div>
        </>
      )}
    </section>
  );
}
