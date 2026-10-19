import { toast } from "sonner";
import { useEffect, useState } from "react";

import { useOrgSettings, useSaveOrgSettings } from "@/hooks/useOrg";

const CHOICES = [
  { days: 7, label: "7 days before" },
  { days: 3, label: "3 days before" },
  { days: 1, label: "The day before" },
  { days: 0, label: "On the day" },
];

/** HR and admin get a notice before each birthday. Switch it off, or pick the lead times. */
export function BirthdayRemindersCard() {
  const { data: settings } = useOrgSettings();
  const save = useSaveOrgSettings();
  const [enabled, setEnabled] = useState(true);
  const [days, setDays] = useState<number[]>([7, 3, 1]);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.birthday_reminders_enabled !== false);
    setDays(settings.birthday_reminder_days ?? [7, 3, 1]);
  }, [settings]);

  const toggle = (d: number) =>
    setDays((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => b - a),
    );

  return (
    <section className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Birthday reminders</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-soft">
        HR and admin get a notification ahead of each birthday so something small can be planned.
        Only birthdays people have shared are used, and each person is told about a birthday once.
      </p>

      <label className="mt-4 flex items-center gap-3">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span className="text-sm font-semibold text-ink">Send birthday reminders</span>
      </label>

      <fieldset className="mt-3 space-y-2" disabled={!enabled}>
        <legend className="ce-label">When</legend>
        {CHOICES.map((c) => (
          <label key={c.days} className="flex items-center gap-3">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={days.includes(c.days)}
              onChange={() => toggle(c.days)}
            />
            <span className="text-sm text-ink">{c.label}</span>
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        className="btn3d mt-4"
        disabled={save.isPending || (enabled && days.length === 0)}
        onClick={() =>
          save.mutate(
            { birthday_reminders_enabled: enabled, birthday_reminder_days: days },
            {
              onSuccess: () => toast.success("Saved."),
              onError: (e) => toast.error((e as Error).message || "That didn't save."),
            },
          )
        }
      >
        {save.isPending ? "Saving…" : "Save"}
      </button>
    </section>
  );
}
