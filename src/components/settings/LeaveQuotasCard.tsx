import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useOrgSettings, useSaveOrgSettings } from "@/hooks/useOrg";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { istToday } from "@/lib/birthdays";
import { niceDate } from "@/lib/calendar";

interface QuotaRow {
  from: string;
  casual: number;
  sick: number;
}

/** A quota change starts on a date. Last year's balances stay as they were. */
function useSetQuotas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { casual: number; sick: number; from: string }) => {
      const { error } = await supabase.rpc("set_leave_quotas", {
        p_casual: args.casual,
        p_sick: args.sick,
        p_effective_from: args.from,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["org-settings"] });
      void qc.invalidateQueries({ queryKey: ["leave-balances"] });
      void qc.invalidateQueries({ queryKey: ["leave"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function LeaveQuotasCard() {
  const { data: settings } = useOrgSettings();
  const saveSettings = useSaveOrgSettings();
  const setQuotas = useSetQuotas();

  const history = useMemo(() => {
    const rows = ((settings as { leave_quotas?: QuotaRow[] } | undefined)?.leave_quotas ??
      []) as QuotaRow[];
    return [...rows].sort((a, b) => b.from.localeCompare(a.from));
  }, [settings]);

  const current = history.find((r) => r.from <= istToday()) ?? history[0] ?? null;

  const [casual, setCasual] = useState("8");
  const [sick, setSick] = useState("6");
  const [from, setFrom] = useState(`${istToday().slice(0, 4)}-01-01`);

  useEffect(() => {
    if (!settings) return;
    setCasual(String(current?.casual ?? settings.casual_quota ?? 8));
    setSick(String(current?.sick ?? settings.sick_quota ?? 6));
  }, [settings, current?.casual, current?.sick]);

  const busy = setQuotas.isPending || saveSettings.isPending;

  return (
    <section className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Leave entitlements</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-soft">
        The yearly quotas everybody starts with. Earned leave is worked for and comp-off is
        granted, so neither is set here. A change starts on the date you choose — earlier years
        keep the quota they were actually given.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
        <label>
          <span className="ce-label">Effective from</span>
          <input
            type="date"
            className="ce-input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
      </div>

      <button
        type="button"
        className="btn3d mt-4 min-h-11 w-full sm:w-auto"
        disabled={busy}
        onClick={() => {
          const c = Number(casual) || 0;
          const s = Number(sick) || 0;
          setQuotas.mutate(
            { casual: c, sick: s, from },
            {
              onSuccess: () => {
                // Keep the flat keys in step so older readers stay correct.
                saveSettings.mutate({ casual_quota: c, sick_quota: s });
                toast.success("Entitlements saved. Balances update everywhere.");
              },
              onError: () => toast.error("That didn't save. Please try again."),
            },
          );
        }}
      >
        {busy ? "Saving…" : "Save entitlements"}
      </button>

      {history.length > 0 ? (
        <div className="mt-5">
          <p className="ce-label">History</p>
          <ul className="mt-2 space-y-1">
            {history.map((r) => (
              <li
                key={r.from}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-cream px-3 py-2 text-[13px] text-ink"
              >
                <span className="font-bold">From {niceDate(r.from)}</span>
                <span className="text-soft">
                  Casual {r.casual} · Sick {r.sick}
                  {r === current ? " · in force today" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
