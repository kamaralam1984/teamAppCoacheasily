import { useState } from "react";
import { toast } from "sonner";

import {
  useProbationDecide,
  useProbationHistory,
  useProbationOverview,
  type ProbationDecision,
} from "@/hooks/useProbation";
import { niceDate } from "@/lib/calendar";
import { PROBATION_LABEL, probationLeftText, probationLengthText } from "@/lib/probation";

const DECISION_LABEL: Record<ProbationDecision, string> = {
  confirm: "Confirmed",
  extend: "Extended",
  review: "Marked for review",
};

/**
 * One person's probation: dates, status, the confirm / extend / review decision
 * (only for HR/Admin or their manager) and every decision made so far.
 */
export function ProbationSection({
  profileId,
  canDecide,
}: {
  profileId: string;
  canDecide: boolean;
}) {
  const { data: rows } = useProbationOverview();
  const { data: history } = useProbationHistory(profileId);
  const decide = useProbationDecide();
  const [months, setMonths] = useState("1");
  const [note, setNote] = useState("");

  const row = rows?.find((r) => r.profile_id === profileId);
  if (!row) return null;

  const open = row.status !== "confirmed";
  const run = (decision: ProbationDecision) =>
    decide.mutate(
      {
        profileId,
        decision,
        ...(decision === "extend" ? { months: Number(months) } : {}),
        note,
      },
      {
        onSuccess: () => {
          setNote("");
          toast.success("Decision saved.");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "That didn't save."),
      },
    );

  return (
    <div className="mt-6 border-t border-line pt-5">
      <p className="text-[11px] font-bold tracking-[0.14em] text-soft uppercase">Probation</p>
      <p className="mt-2 text-[15px] text-ink">
        <span className="font-bold">{PROBATION_LABEL[row.status]}</span>
        {open ? ` · ${probationLeftText(row.days_left)}` : ""}
      </p>
      <p className="mt-1 text-[13px] text-soft">
        {niceDate(row.start_date)} → {niceDate(row.end_date)} ·{" "}
        {probationLengthText(row.start_date, row.end_date)}
      </p>

      {open && canDecide ? (
        <div className="mt-3 space-y-3">
          <textarea
            className="ce-input"
            rows={2}
            maxLength={500}
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn3d min-h-11"
              disabled={decide.isPending}
              onClick={() => run("confirm")}
            >
              Confirm employee
            </button>
            <button
              className="btn3d btn3d-ghost min-h-11"
              disabled={decide.isPending || row.status === "under_review"}
              onClick={() => run("review")}
            >
              Mark for review
            </button>
            <span className="flex items-center gap-2">
              <select
                className="ce-input"
                style={{ width: "auto" }}
                aria-label="Extend by"
                value={months}
                onChange={(e) => setMonths(e.target.value)}
              >
                {[1, 2, 3, 6].map((m) => (
                  <option key={m} value={m}>
                    {m} month{m > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
              <button
                className="btn3d btn3d-ghost min-h-11"
                disabled={decide.isPending}
                onClick={() => run("extend")}
              >
                Extend
              </button>
            </span>
          </div>
        </div>
      ) : null}

      {history && history.length > 0 ? (
        <ul className="mt-4 space-y-1">
          {history.map((h) => (
            <li
              key={h.id}
              className="rounded-lg border border-line bg-cream px-3 py-2 text-[13px] text-ink"
            >
              <span className="font-bold">
                {DECISION_LABEL[h.decision]}
                {h.decision === "extend" && h.new_end
                  ? ` to ${niceDate(h.new_end)} (+${h.extension_months} mo)`
                  : ""}
              </span>
              <span className="block text-soft">
                {h.decided_by ?? "—"} · {new Date(h.created_at).toLocaleDateString("en-IN")}
                {h.note ? ` · ${h.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
