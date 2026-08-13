import { useRef, useState } from "react";

interface Props {
  stages: string[];
  /** true when the shape is frozen because history exists and they chose to keep it */
  renameOnly: boolean;
  onChange: (stages: string[]) => void;
}

/** Two to five stages. Rename freely, drag to reorder, add and remove — unless
    the goal already carries history and they chose to keep it. */
export function StageEditor({ stages, renameOnly, onChange }: Props) {
  const [dragging, setDragging] = useState<number | null>(null);
  const overRef = useRef<number | null>(null);

  const rename = (i: number, v: string) => onChange(stages.map((s, j) => (j === i ? v : s)));

  const move = (from: number, to: number) => {
    if (renameOnly || to < 0 || to >= stages.length || from === to) return;
    const next = [...stages];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row as string);
    onChange(next);
  };

  const add = () => {
    if (renameOnly || stages.length >= 5) return;
    onChange([...stages, ""]);
  };

  const remove = (i: number) => {
    if (renameOnly || stages.length <= 2) return;
    onChange(stages.filter((_, j) => j !== i));
  };

  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <div
          key={i}
          draggable={!renameOnly}
          onDragStart={() => setDragging(i)}
          onDragOver={(e) => {
            e.preventDefault();
            overRef.current = i;
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging !== null && overRef.current !== null) move(dragging, overRef.current);
            setDragging(null);
          }}
          onDragEnd={() => setDragging(null)}
          className={`flex items-center gap-2 rounded-[12px] border p-2 ${
            dragging === i ? "border-gold bg-gold/10" : "border-line bg-cream/40"
          }`}
        >
          <span
            aria-hidden
            className={`select-none px-1 text-[15px] text-soft ${renameOnly ? "opacity-30" : "cursor-grab"}`}
            title={renameOnly ? "Order is locked while history is kept" : "Drag to reorder"}
          >
            ⠿
          </span>
          <span className="w-5 shrink-0 text-[12px] font-bold text-soft">{i + 1}</span>
          <input
            className="ce-input h-11 w-full"
            value={s}
            onChange={(e) => rename(i, e.target.value)}
            placeholder={`Step ${i + 1}`}
            aria-label={`Step ${i + 1} name`}
          />
          {!renameOnly ? (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label={`Move step ${i + 1} up`}
                className="h-11 w-9 rounded-lg border border-line text-[13px] font-bold text-soft disabled:opacity-30"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move step ${i + 1} down`}
                className="h-11 w-9 rounded-lg border border-line text-[13px] font-bold text-soft disabled:opacity-30"
                disabled={i === stages.length - 1}
                onClick={() => move(i, i + 1)}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Remove step ${i + 1}`}
                className="h-11 w-9 rounded-lg border border-line text-[13px] font-bold text-red disabled:opacity-30"
                disabled={stages.length <= 2}
                onClick={() => remove(i)}
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="min-h-11 rounded-full border border-line px-3 text-[12px] font-bold text-soft disabled:opacity-40"
          disabled={renameOnly || stages.length >= 5}
          onClick={add}
        >
          + Another step
        </button>
        <span className="text-[12px] text-soft">
          {renameOnly
            ? "History kept — you can rename, but the order stays."
            : `${stages.length} of 5 steps · two is the minimum`}
        </span>
      </div>
    </div>
  );
}
