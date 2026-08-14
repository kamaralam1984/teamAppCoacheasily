import { useState } from "react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/ConfirmButton";

import { useDepartmentPlaybook, useEditPlaybook } from "@/hooks/useCulture";
import { useDepartmentNames } from "@/hooks/useDepartments";

export function PlaybookEditor({ orgId }: { orgId: string | null }) {
  const departments = useDepartmentNames();
  const [department, setDepartment] = useState(departments[0] ?? "");
  const active = department || (departments[0] ?? "");
  const { data: items } = useDepartmentPlaybook(active || null);
  const { add, update, reorder, remove } = useEditPlaybook(orgId);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const list = items ?? [];
  const fail = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "That didn't save. Please try again.");

  function move(index: number, delta: number) {
    const next = [...list];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const a = next[index]!;
    next[index] = next[target]!;
    next[target] = a;
    reorder.mutate(
      next.map((i) => i.id),
      { onError: fail },
    );
  }

  return (
    <section className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Daily playbook</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-soft">
        The three or four things this department does every working day. It resets each morning on
        the Tasks screen.
      </p>

      <label className="mt-4 block">
        <span className="ce-label">Department</span>
        <select
          className="ce-input"
          value={active}
          onChange={(e) => setDepartment(e.target.value)}
        >
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      <ul className="mt-4 space-y-2">
        {list.map((item, i) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-3 py-2"
          >
            {editingId === item.id ? (
              <>
                <input
                  className="ce-input flex-1"
                  aria-label="Playbook line"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  type="button"
                  className="btn3d min-h-11"
                  onClick={() =>
                    update.mutate(
                      { id: item.id, text: draft },
                      {
                        onSuccess: () => {
                          setEditingId(null);
                          toast.success("Playbook updated.");
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
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 text-sm text-ink">{item.text}</span>
                <button
                  type="button"
                  aria-label="Move up"
                  className="min-h-11 min-w-11 rounded-lg border border-line text-ink"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  className="min-h-11 min-w-11 rounded-lg border border-line text-ink"
                  disabled={i === list.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-line px-3 text-sm font-bold text-ink"
                  onClick={() => {
                    setEditingId(item.id);
                    setDraft(item.text);
                  }}
                >
                  Edit
                </button>
                <ConfirmButton
                  label="Remove"
                  message={`Delete the playbook line “${item.text}”? It disappears from every ${active || "department"} warrior's daily list; the ticks already recorded stay.`}
                  confirmLabel="Yes, delete it"
                  pending={remove.isPending}
                  onConfirm={() =>
                    remove.mutate(item.id, {
                      onSuccess: () => toast.success("Line removed."),
                      onError: fail,
                    })
                  }
                />
              </>
            )}
          </li>
        ))}
        {list.length === 0 ? (
          <li className="text-sm text-soft">
            Nothing here yet. Add the first daily habit for {active || "this department"}.
          </li>
        ) : null}
      </ul>

      <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
        <input
          className="ce-input flex-1"
          placeholder="One thing they do every day"
          aria-label="New playbook line"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="button"
          className="btn3d min-h-11"
          disabled={add.isPending || !active}
          onClick={() =>
            add.mutate(
              { department: active, text, sortOrder: (list.length + 1) * 10 },
              {
                onSuccess: () => {
                  setText("");
                  toast.success("Added to the playbook.");
                },
                onError: fail,
              },
            )
          }
        >
          Add
        </button>
      </div>
    </section>
  );
}
