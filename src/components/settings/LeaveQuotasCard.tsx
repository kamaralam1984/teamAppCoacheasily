import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useOrgSettings, useSaveOrgSettings } from "@/hooks/useOrg";

export function LeaveQuotasCard() {
  const { data: settings } = useOrgSettings();
  const save = useSaveOrgSettings();
  const [casual, setCasual] = useState("8");
  const [sick, setSick] = useState("6");

  useEffect(() => {
    if (!settings) return;
    setCasual(String(settings.casual_quota ?? 8));
    setSick(String(settings.sick_quota ?? 6));
  }, [settings]);

  return (
    <section className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Leave entitlements</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-soft">
        The yearly quotas everybody starts with. Earned leave is worked for, and comp-off is
        granted, so neither is set here.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="ce-label">Casual leave a year</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className="ce-input"
            value={casual}
            onChange={(e) => setCasual(e.target.value)}
          />
        </label>
        <label>
          <span className="ce-label">Sick leave a year</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className="ce-input"
            value={sick}
            onChange={(e) => setSick(e.target.value)}
          />
        </label>
      </div>

      <button
        type="button"
        className="btn3d mt-4 min-h-11"
        disabled={save.isPending}
        onClick={() =>
          save.mutate(
            { casual_quota: Number(casual) || 0, sick_quota: Number(sick) || 0 },
            {
              onSuccess: () => toast.success("Entitlements saved. Balances update everywhere."),
              onError: () => toast.error("That didn't save. Please try again."),
            },
          )
        }
      >
        {save.isPending ? "Saving…" : "Save entitlements"}
      </button>
    </section>
  );
}
