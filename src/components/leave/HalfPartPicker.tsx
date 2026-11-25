import type { HalfPart } from "@/hooks/useLeave";

export function HalfPartPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: HalfPart;
  onChange: (v: HalfPart) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-5">
      <legend className="ce-label">Which half?</legend>
      {(["first", "second"] as const).map((v) => (
        <label key={v} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink">
          <input
            type="radio"
            name={name}
            className="h-5 w-5 accent-[var(--ce-saffBtn)]"
            checked={value === v}
            onChange={() => onChange(v)}
          />
          {v === "first" ? "First half" : "Second half"}
        </label>
      ))}
    </fieldset>
  );
}
