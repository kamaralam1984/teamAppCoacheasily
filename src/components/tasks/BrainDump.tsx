import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";

import { readBrainDump, type DumpCandidate } from "@/lib/brainDump.functions";
import { PRIORITIES, SLOTS, istToday, type Priority, type Slot } from "@/lib/tasks";
import type { Profile } from "@/lib/warriors";
import type { TaskInput } from "@/hooks/useTasks";

interface Draft extends DumpCandidate {
  owner_id: string;
}

export interface BrainDumpProps {
  meId: string;
  line: Profile[];
  pending?: boolean;
  onConfirm: (inputs: TaskInput[]) => void;
}

export function BrainDump({ meId, line, pending, onConfirm }: BrainDumpProps) {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const read = useServerFn(readBrainDump);

  const parse = useMutation({
    mutationFn: async () => read({ data: { text, today: istToday() } }),
    onSuccess: (res) =>
      setDrafts(res.tasks.map((t) => ({ ...t, owner_id: meId }))),
  });

  const patch = (i: number, p: Partial<Draft>) =>
    setDrafts((d) => (d ? d.map((row, idx) => (idx === i ? { ...row, ...p } : row)) : d));

  return (
    <section className="ce-card p-6">
      <h2 className="font-display text-2xl text-ink">Brain dump</h2>
      <p className="mt-1.5 text-[13px] text-soft">
        Type everything in your head. We'll shape it into tasks — nothing is saved until you say so.
      </p>

      <textarea
        className="ce-input mt-4 min-h-28"
        placeholder={"Call the Pune batch parents tomorrow morning\nRefund queue before Friday, urgent\nDraft the CBA welcome note"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <button
        type="button"
        className="btn3d mt-3 w-full sm:w-auto"
        disabled={parse.isPending || !text.trim()}
        onClick={() => parse.mutate()}
      >
        {parse.isPending ? "Reading…" : "Read with CoachEasily AI"}
      </button>

      {parse.isError ? (
        <p className="mt-3 text-[13px] font-semibold text-red">
          {(parse.error as Error).message}
        </p>
      ) : null}

      {drafts ? (
        drafts.length === 0 ? (
          <p className="mt-4 text-sm text-soft">Nothing task-shaped in there yet.</p>
        ) : (
          <div className="mt-5 space-y-3">
            {drafts.map((d, i) => (
              <div key={i} className="rounded-[12px] border border-line bg-pearl p-3.5">
                <input
                  className="ce-input"
                  value={d.title}
                  aria-label="Task title"
                  onChange={(e) => patch(i, { title: e.target.value })}
                />
                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  <input
                    type="date"
                    aria-label="Due date"
                    className="ce-input"
                    value={d.due_date ?? ""}
                    onChange={(e) => patch(i, { due_date: e.target.value || null })}
                  />
                  <select
                    aria-label="When"
                    className="ce-input"
                    value={d.slot}
                    onChange={(e) => patch(i, { slot: e.target.value as Slot })}
                  >
                    {SLOTS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Priority"
                    className="ce-input"
                    value={d.priority}
                    onChange={(e) => patch(i, { priority: e.target.value as Priority })}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Owner"
                    className="ce-input"
                    value={d.owner_id}
                    onChange={(e) => patch(i, { owner_id: e.target.value })}
                  >
                    <option value={meId}>Me</option>
                    {line.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="mt-2 min-h-11 text-[13px] font-semibold text-soft underline-offset-4 hover:underline"
                  onClick={() => setDrafts((ds) => (ds ? ds.filter((_, idx) => idx !== i) : ds))}
                >
                  Drop this one
                </button>
              </div>
            ))}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="btn3d w-full sm:w-auto"
                disabled={pending}
                onClick={() => {
                  onConfirm(
                    drafts
                      .filter((d) => d.title.trim())
                      .map((d) => ({
                        title: d.title,
                        due_date: d.due_date,
                        slot: d.slot,
                        priority: d.priority,
                        owner_id: d.owner_id,
                      })),
                  );
                  setDrafts(null);
                  setText("");
                }}
              >
                Confirm &amp; add {drafts.length}
              </button>
              <button
                type="button"
                className="min-h-11 text-[13px] font-semibold text-soft underline-offset-4 hover:underline"
                onClick={() => setDrafts(null)}
              >
                Start again
              </button>
            </div>
          </div>
        )
      ) : null}
    </section>
  );
}
