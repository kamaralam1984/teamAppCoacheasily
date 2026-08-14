import { useState } from "react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { useEditPlaybook, usePlaybook, useTogglePlaybook } from "@/hooks/useCulture";
import type { Profile } from "@/lib/warriors";

/** The 3–4 things this person's department does every working day. Resets each morning. */
export function Playbook({
  me,
  canEdit,
  style,
}: {
  me: Profile;
  canEdit: boolean;
  style?: React.CSSProperties;
}) {
  const department = me.department ?? null;
  const { data } = usePlaybook(me.id, department);
  const toggle = useTogglePlaybook(me.org_id, me.id);
  const { add, remove } = useEditPlaybook(me.org_id);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  const items = data?.items ?? [];
  const doneIds = new Set(data?.doneIds ?? []);
  const doneCount = items.filter((i) => doneIds.has(i.id)).length;

  if (!department) return null;

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ce-label">My daily playbook</p>
          <h2 className="mt-1 font-display text-2xl text-ink">
            {department} · {doneCount} of {items.length}
          </h2>
          <p className="mt-1 text-[13px] text-soft">Fresh every working morning.</p>
        </div>
        {canEdit ? (
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-full border border-line px-4 text-[13px] font-bold text-soft"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Close" : "Edit"}
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-[13px] text-soft">
          No playbook written for {department} yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => {
            const done = doneIds.has(item.id);
            return (
              <li key={item.id} className="flex items-center gap-2">
                <button
                  type="button"
                  className={`flex min-h-12 flex-1 items-center gap-3 rounded-[14px] border px-4 text-left text-[14px] transition ${
                    done
                      ? "border-emer/40 bg-emer/8 font-bold text-ink"
                      : "border-line bg-cream text-ink"
                  }`}
                  onClick={() => toggle.mutate({ itemId: item.id, done: !done })}
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full border text-[12px] ${
                      done ? "border-emer bg-emer text-white" : "border-line bg-ivory"
                    }`}
                  >
                    {done ? "✓" : ""}
                  </span>
                  <span className={done ? "line-through opacity-70" : ""}>{item.text}</span>
                </button>
                {editing ? (
                  <ConfirmButton
                    label="✕"
                    ariaLabel={`Remove ${item.text}`}
                    message={`Delete the playbook line “${item.text}”? It disappears from every warrior in this department; the ticks already recorded stay.`}
                    confirmLabel="Yes, delete it"
                    onConfirm={() => remove.mutate(item.id)}
                    className="min-h-12 min-w-12 rounded-[14px] border border-line text-[15px] text-red"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {editing ? (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            add.mutate(
              { department, text, sortOrder: items.length + 1 },
              { onSuccess: () => setText("") },
            );
          }}
        >
          <input
            className="min-h-12 flex-1 rounded-lg border border-line bg-ivory px-3 text-[15px] text-ink"
            placeholder={`Add a daily step for ${department}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn3d sm:w-auto">
            Add
          </button>
        </form>
      ) : null}
    </section>
  );
}
