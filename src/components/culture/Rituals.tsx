import { useState } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";

import { useEditRituals, useRituals, useToggleRitual } from "@/hooks/useCulture";
import type { Profile } from "@/lib/warriors";

export function Rituals({
  me,
  onCelebrate,
  style,
}: {
  me: Profile;
  onCelebrate?: (message: string) => void;
  style?: React.CSSProperties;
}) {
  const { data } = useRituals(me.id);
  const toggle = useToggleRitual(me.org_id);
  const { add, remove } = useEditRituals(me.org_id, me.id);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");

  const rituals = data?.rituals ?? [];
  const doneIds = new Set(data?.doneIds ?? []);
  const doneCount = rituals.filter((r) => doneIds.has(r.id)).length;

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="ce-label">Daily rituals</p>
          <h2 className="mt-1 font-display text-2xl text-ink">
            {doneCount} of {rituals.length} done
          </h2>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-full border border-line px-4 text-[13px] font-bold text-soft"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "Close" : "Edit"}
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {rituals.map((r) => {
          const done = doneIds.has(r.id);
          return (
            <li key={r.id} className="flex items-center gap-2">
              <button
                type="button"
                className={`flex min-h-12 flex-1 items-center gap-3 rounded-[14px] border px-4 text-left text-[14px] transition ${
                  done
                    ? "border-emer/40 bg-emer/8 font-bold text-ink"
                    : "border-line bg-cream text-ink"
                }`}
                onClick={() => {
                  toggle.mutate(
                    { ritualId: r.id, done: !done },
                    {
                      onSuccess: () => {
                        if (!done && doneCount + 1 === rituals.length && rituals.length > 0) {
                          onCelebrate?.("Every ritual done today. That is how good days are built.");
                        }
                      },
                    },
                  );
                }}
              >
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full border text-[12px] ${
                    done ? "border-emer bg-emer text-white" : "border-line bg-ivory"
                  }`}
                >
                  {done ? "✓" : ""}
                </span>
                <span className={done ? "line-through opacity-70" : ""}>{r.text}</span>
              </button>
              {adding ? (
                <ConfirmButton
                  label="✕"
                  ariaLabel={`Remove ${r.text}`}
                  message={`Remove the ritual “${r.text}”? Everyone loses it from today's checklist; the ticks already recorded stay.`}
                  confirmLabel="Yes, remove it"
                  onConfirm={() => remove.mutate(r.id)}
                  className="min-h-12 min-w-12 rounded-[14px] border border-line text-[15px] text-red"
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            add.mutate(
              { text, sortOrder: rituals.length + 1 },
              { onSuccess: () => setText("") },
            );
          }}
        >
          <input
            className="min-h-12 flex-1 rounded-lg border border-line bg-ivory px-3 text-[15px] text-ink"
            placeholder="Add your own ritual"
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
