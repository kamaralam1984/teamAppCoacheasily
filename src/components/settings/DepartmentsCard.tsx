import { useState } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/ConfirmButton";
import { useDepartments, useEditDepartments } from "@/hooks/useDepartments";
import { useWarriors } from "@/hooks/useWarriors";

export function DepartmentsCard({ orgId }: { orgId: string | null }) {
  const { data: departments, isLoading } = useDepartments();
  const { data: warriors } = useWarriors();
  const { add, rename, remove } = useEditDepartments(orgId);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const headcount = (name: string) =>
    (warriors ?? []).filter((w) => w.status === "active" && w.department === name).length;

  const fail = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "That didn't save. Please try again.");

  return (
    <section className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Departments</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-soft">
        Adding one immediately gives it goal templates and a daily playbook. Renaming carries the
        people, the playbook and the daily code across with it.
      </p>

      <ul className="mt-4 space-y-2">
        {isLoading ? <li className="text-sm text-soft">Loading departments…</li> : null}
        {(departments ?? []).map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-3 py-2"
          >
            {editingId === d.id ? (
              <>
                <input
                  className="ce-input flex-1"
                  value={draft}
                  aria-label={`Rename ${d.name}`}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  type="button"
                  className="btn3d min-h-11"
                  onClick={() =>
                    rename.mutate(
                      { id: d.id, from: d.name, to: draft },
                      {
                        onSuccess: () => {
                          setEditingId(null);
                          toast.success("Department renamed everywhere.");
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
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{d.name}</p>
                  <p className="text-[12px] text-soft">
                    {headcount(d.name)} warrior{headcount(d.name) === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-line px-3 text-sm font-bold text-ink"
                  onClick={() => {
                    setEditingId(d.id);
                    setDraft(d.name);
                  }}
                >
                  Rename
                </button>
                <ConfirmButton
                  label="Remove"
                  message={`Remove the ${d.name} department? ${headcount(d.name)} warrior${headcount(d.name) === 1 ? " keeps" : "s keep"} their title, but the department's daily playbook lines go with it.`}
                  confirmLabel="Yes, remove it"
                  pending={remove.isPending}
                  onConfirm={() =>
                    remove.mutate(
                      { id: d.id, name: d.name },
                      {
                        onSuccess: () => toast.success(`${d.name} removed.`),
                        onError: fail,
                      },
                    )
                  }
                />
              </>
            )}
          </li>
        ))}
        {!isLoading && (departments ?? []).length === 0 ? (
          <li className="text-sm text-soft">
            No departments yet — add the first one and the playbook follows.
          </li>
        ) : null}
      </ul>

      <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
        <input
          className="ce-input flex-1"
          placeholder="New department"
          aria-label="New department"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          type="button"
          className="btn3d min-h-11"
          disabled={add.isPending}
          onClick={() =>
            add.mutate(newName, {
              onSuccess: () => {
                setNewName("");
                toast.success("Department added, with a starter playbook.");
              },
              onError: fail,
            })
          }
        >
          Add department
        </button>
      </div>
    </section>
  );
}
