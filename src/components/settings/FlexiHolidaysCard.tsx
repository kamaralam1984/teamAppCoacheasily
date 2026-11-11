import { toast } from "sonner";
import { useEffect, useState } from "react";

import { useOrgSettings, useSaveOrgSettings } from "@/hooks/useOrg";

/* The same defaults the database uses when nothing is saved (flexi_holiday_problem). */
const DEFAULT_PER_YEAR = 2;
const DEFAULT_FROM = 2027;

/**
 * Flexi holidays: how many optional holidays one person may take in a year, and the first year
 * they apply. The dates themselves are the "optional" entries on the holiday calendar.
 */
export function FlexiHolidaysCard() {
  const { data: settings } = useOrgSettings();
  const save = useSaveOrgSettings();
  const [perYear, setPerYear] = useState(String(DEFAULT_PER_YEAR));
  const [from, setFrom] = useState(String(DEFAULT_FROM));

  useEffect(() => {
    if (!settings) return;
    setPerYear(String(settings.flexi_holidays_per_year ?? DEFAULT_PER_YEAR));
    setFrom(String(settings.flexi_holidays_from ?? DEFAULT_FROM));
  }, [settings]);

  const n = Number(perYear);
  const y = Number(from);
  const validN = perYear.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 20;
  const validY = Number.isInteger(y) && y >= 2020 && y <= 2100;

  return (
    <section className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Flexi holidays</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-soft">
        Each person picks a few days from the flexi list (the optional holidays on the holiday
        calendar) and asks for them like leave; their manager approves. Pending and approved
        requests both count. Lowering the number does not cancel requests already made.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="ce-label">Flexi holidays a year, per person</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={20}
            className="ce-input"
            value={perYear}
            onChange={(e) => setPerYear(e.target.value)}
          />
        </label>
        <label>
          <span className="ce-label">Starting from the year</span>
          <input
            type="number"
            inputMode="numeric"
            min={2020}
            max={2100}
            className="ce-input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
      </div>
      <p className="mt-2 text-[13px] text-soft">
        {!validN
          ? "Use a whole number from 0 to 20."
          : !validY
            ? "Use a year such as 2027."
            : n === 0
              ? `No flexi holidays from ${y}.`
              : `From ${y}, everyone may take ${n} flexi holiday${n === 1 ? "" : "s"} a year. Before ${y} there are none.`}
      </p>

      <button
        type="button"
        className="btn3d mt-4 min-h-11 w-full sm:w-auto"
        disabled={save.isPending || !validN || !validY}
        onClick={() =>
          save.mutate(
            { flexi_holidays_per_year: n, flexi_holidays_from: y },
            {
              onSuccess: () => toast.success("Flexi holiday rules saved."),
              onError: (e) => toast.error((e as Error).message || "That didn't save."),
            },
          )
        }
      >
        {save.isPending ? "Saving…" : "Save flexi rules"}
      </button>
    </section>
  );
}
