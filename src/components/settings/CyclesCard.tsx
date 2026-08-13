import { useState } from "react";
import { toast } from "sonner";

import { useCycles, useUpdateCycle } from "@/hooks/useGoals";
import { shortDate } from "@/lib/warriors";

export function CyclesCard() {
  const { data: cycles } = useCycles();
  const update = useUpdateCycle();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const fail = () => toast.error("That didn't save. Please try again.");

  return (
    <section className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Cycles</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-soft">
        Correct a name or the dates at any time. Goals, reports and the strategic meeting follow.
      </p>

      <ul className="mt-4 space-y-2">
        {(cycles ?? []).map((c) => (
          <li key={c.id} className="rounded-lg border border-line bg-white px-3 py-3">
            {editingId === c.id ? (
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="sm:col-span-3">
                  <span className="ce-label">Name</span>
                  <input className="ce-input" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label>
                  <span className="ce-label">Starts</span>
                  <input
                    type="date"
                    className="ce-input"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  <span className="ce-label">Ends</span>
                  <input
                    type="date"
                    className="ce-input"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    className="btn3d min-h-11"
                    onClick={() =>
                      update.mutate(
                        { id: c.id, name, start_date: start, end_date: end },
                        {
                          onSuccess: () => {
                            setEditingId(null);
                            toast.success("Cycle updated.");
                          },
                          onError: fail,
                        },
                      )
                    }
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-lg border border-line px-3 text-sm font-bold text-ink"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{c.name}</p>
                  <p className="text-[12px] text-soft">
                    {shortDate(c.start_date)} → {shortDate(c.end_date)} · {c.status}
                  </p>
                </div>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-line px-3 text-sm font-bold text-ink"
                  onClick={() => {
                    setEditingId(c.id);
                    setName(c.name);
                    setStart(c.start_date);
                    setEnd(c.end_date);
                  }}
                >
                  Edit
                </button>
              </div>
            )}
          </li>
        ))}
        {(cycles ?? []).length === 0 ? (
          <li className="text-sm text-soft">No cycles yet — open the first one from Goals.</li>
        ) : null}
      </ul>
    </section>
  );
}
