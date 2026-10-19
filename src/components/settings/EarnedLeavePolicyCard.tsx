import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  useEarnedLeavePolicy,
  useEarnedLeavePolicyLog,
  useRecalculateEarnedLeave,
  useSaveEarnedLeavePolicy,
  type PolicyEdit,
} from "@/hooks/useEarnedLeave";
import { useWarriors } from "@/hooks/useWarriors";

const FIELDS: { key: keyof PolicyEdit; label: string }[] = [
  { key: "required_days", label: "Eligible working days per credit" },
  { key: "credit_amount", label: "Earned leave credited" },
  { key: "max_balance", label: "Maximum balance" },
];

const TOGGLES: { key: keyof PolicyEdit; label: string; hint: string }[] = [
  {
    key: "exclude_weekly_off",
    label: "Skip weekly offs",
    hint: "A day worked on someone's weekly off doesn't count (it earns comp-off instead).",
  },
  {
    key: "exclude_holidays",
    label: "Skip company holidays",
    hint: "A day worked on a holiday in the holiday calendar doesn't count.",
  },
  {
    key: "count_approved_leave",
    label: "Count approved full-day leave",
    hint: "Approved paid leave days count as worked. Half-days and unpaid leave never do.",
  },
  {
    key: "count_wfh",
    label: "Count work-from-home days",
    hint: "A day marked as work from home counts as a working day.",
  },
  {
    key: "count_half_day",
    label: "Count half days as a full working day",
    hint: "Off by default: a day marked as a half day does not count towards the target.",
  },
  {
    key: "count_during_probation",
    label: "Count days during probation",
    hint: "Turn this off if earned leave should only start once probation is over. Days before someone's joining date never count.",
  },
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const PLAIN: Record<string, string> = {
  required_days: "working days",
  credit_amount: "credit",
  max_balance: "max balance",
  exclude_weekly_off: "skip weekly offs",
  exclude_holidays: "skip holidays",
  count_approved_leave: "count approved leave",
  count_wfh: "count work from home",
  count_half_day: "count half days",
  count_during_probation: "count probation days",
  carry_forward_limit: "carry-forward limit",
  year_start_month: "leave year starts in month",
};

function describeChange(oldP: Record<string, unknown>, newP: Record<string, unknown>) {
  return Object.keys(PLAIN)
    .filter((k) => oldP[k] !== newP[k])
    .map((k) => `${PLAIN[k]}: ${String(oldP[k])} → ${String(newP[k])}`)
    .join(" · ");
}

export function EarnedLeavePolicyCard({ orgId }: { orgId: string | null }) {
  const { data: policy } = useEarnedLeavePolicy();
  const { data: log } = useEarnedLeavePolicyLog();
  const { data: warriors } = useWarriors();
  const save = useSaveEarnedLeavePolicy(orgId);
  const recalc = useRecalculateEarnedLeave();
  const [draft, setDraft] = useState<PolicyEdit | null>(null);

  useEffect(() => {
    if (!policy) return;
    setDraft({
      required_days: policy.required_days,
      credit_amount: policy.credit_amount,
      max_balance: policy.max_balance,
      exclude_weekly_off: policy.exclude_weekly_off,
      exclude_holidays: policy.exclude_holidays,
      count_approved_leave: policy.count_approved_leave,
      count_wfh: policy.count_wfh,
      count_half_day: policy.count_half_day,
      count_during_probation: policy.count_during_probation,
      carry_forward_limit: policy.carry_forward_limit,
      year_start_month: policy.year_start_month,
    });
  }, [policy]);

  if (!draft) return null;

  const nameOf = (id: string | null) => warriors?.find((w) => w.id === id)?.full_name ?? "Someone";
  const valid =
    FIELDS.every(({ key }) => Number.isInteger(draft[key]) && Number(draft[key]) >= 1) &&
    (draft.carry_forward_limit === null ||
      (Number.isInteger(draft.carry_forward_limit) && draft.carry_forward_limit >= 0));

  return (
    <section className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Earned leave policy</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-soft">
        Earned leave is credited automatically every night, and the moment someone completes the
        target. Each credit is written to a ledger, so a change here only affects days that haven't
        been credited yet — earlier credits stay exactly as they were.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {FIELDS.map(({ key, label }) => (
          <label key={key}>
            <span className="ce-label">{label}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              className="ce-input"
              value={Number.isNaN(draft[key]) ? "" : String(draft[key])}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.valueAsNumber })}
            />
          </label>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {TOGGLES.map(({ key, label, hint }) => (
          <label key={key} className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5"
              checked={Boolean(draft[key])}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
            />
            <span>
              <span className="block text-sm font-semibold text-ink">{label}</span>
              <span className="block text-[12px] text-soft">{hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <p className="ce-label">Leave year and carry-forward</p>
        <p className="mt-1 text-[12px] leading-relaxed text-soft">
          When a new leave year starts, earned leave above the limit lapses. People are told, and
          the lapse is written to their ledger. A new limit only applies to leave years that start
          after you save it, so turning it on today never wipes the current year.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label>
            <span className="ce-label">Leave year starts in</span>
            <select
              className="ce-input"
              value={draft.year_start_month}
              onChange={(e) => setDraft({ ...draft, year_start_month: Number(e.target.value) })}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <div>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={draft.carry_forward_limit !== null}
                onChange={(e) =>
                  setDraft({ ...draft, carry_forward_limit: e.target.checked ? 10 : null })
                }
              />
              <span className="text-sm font-semibold text-ink">Limit what carries forward</span>
            </label>
            {draft.carry_forward_limit !== null ? (
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className="ce-input mt-2"
                aria-label="Days that carry forward"
                value={
                  Number.isNaN(draft.carry_forward_limit) ? "" : String(draft.carry_forward_limit)
                }
                onChange={(e) =>
                  setDraft({ ...draft, carry_forward_limit: e.target.valueAsNumber })
                }
              />
            ) : (
              <p className="mt-1 text-[12px] text-soft">No limit: the full balance carries on.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn3d min-h-11"
          disabled={!valid || save.isPending}
          onClick={() =>
            save.mutate(draft, {
              onSuccess: () => toast.success("Policy saved and logged."),
              onError: () => toast.error("That didn't save. Please try again."),
            })
          }
        >
          {save.isPending ? "Saving…" : "Save policy"}
        </button>
        <button
          type="button"
          className="btn3d btn3d-ghost min-h-11"
          disabled={recalc.isPending}
          onClick={() =>
            recalc.mutate(undefined, {
              onSuccess: (n) =>
                toast.success(
                  n === 0 ? "Everyone is already up to date." : `${n} credit(s) added.`,
                ),
              onError: () => toast.error("The recalculation failed. Please try again."),
            })
          }
        >
          {recalc.isPending ? "Working…" : "Credit anyone who's due now"}
        </button>
      </div>

      {log && log.length > 0 ? (
        <div className="mt-5">
          <p className="ce-label">Policy changes</p>
          <ul className="mt-2 space-y-1">
            {log.map((l) => (
              <li
                key={l.id}
                className="rounded-lg border border-line bg-cream px-3 py-2 text-[13px] text-ink"
              >
                <span className="font-bold">
                  {nameOf(l.changed_by)} · {new Date(l.changed_at).toLocaleString("en-IN")}
                </span>
                <span className="block text-soft">
                  {describeChange(
                    l.old_policy as Record<string, unknown>,
                    l.new_policy as Record<string, unknown>,
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
