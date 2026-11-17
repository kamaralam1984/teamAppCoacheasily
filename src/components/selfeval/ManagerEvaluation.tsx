import { useState, type ReactNode } from "react";
import { Download } from "lucide-react";

import { Cell } from "@/components/selfeval/AutoSaveCell";
import { niceDate } from "@/lib/calendar";
import {
  MANAGER_FEEDBACK,
  MANAGER_POTENTIAL,
  POTENTIAL,
  POTENTIAL_LEVELS,
  RATING_LABEL,
  RATING_MEANING,
  RATINGS,
  RECOMMENDATIONS,
  VALUES,
  selfSummary,
  type FormLike,
  type ManagerExtra,
  type ReviewLike,
} from "@/lib/selfEvaluation";

// outside the form, so its boxes keep their typing when the form redraws
function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-display text-lg text-ink">{title}</h3>
      {note ? <p className="text-sm text-soft">{note}</p> : null}
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

/**
 * The "Annual Manager Evaluation Form", box for box: About this review, Part A + summary,
 * Part B + summary, Part C overall, Part D readiness of talent, Part E manager feedback,
 * Recommendation, the team member's comments and the manager's sign-off.
 */
export function ManagerEvaluation({
  year,
  personName,
  roleTeam,
  reviewPeriod,
  reviewerName,
  receivedOn,
  completedOn,
  form,
  goalCount,
  review,
  extra,
  canWrite,
  self,
  complete,
  memberComment,
  onRate,
  onSave,
  onMemberComment,
  onSignOff,
  signingOff,
  onPdf,
}: {
  year: number;
  personName: string;
  roleTeam: string;
  reviewPeriod: string;
  reviewerName: string;
  receivedOn: string | null;
  completedOn: string | null;
  form: FormLike;
  goalCount: number;
  review: ReviewLike | null;
  extra: ManagerExtra;
  /** the direct manager, while the evaluation waits for them */
  canWrite: boolean;
  /** the viewer is the team member */
  self: boolean;
  complete: boolean;
  memberComment: string;
  /** per-goal / per-value rating and remarks, and the final rating */
  onRate: (path: string[], value: string) => void;
  /** every other box of the form */
  onSave: (path: string[], value: string) => void;
  onMemberComment: (text: string) => void;
  onSignOff: (name: string) => void;
  signingOff: boolean;
  onPdf: () => void;
}) {
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState(false);
  const th = "border border-line bg-gold/40 px-2 py-2 text-left";
  const mth = "border border-line bg-orange-300/60 px-2 py-2 text-left";
  const td = "border border-line align-top";
  const ro = (v: string | undefined | null) => (
    <div className="px-2 py-1.5 text-[13px] whitespace-pre-wrap text-ink">{v || "—"}</div>
  );
  const pick = (
    value: string | undefined | null,
    onChange: (v: string) => void,
    options: readonly string[] = RATINGS,
  ) =>
    canWrite ? (
      <select
        className="ce-input w-full min-w-[90px] text-[13px]"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {options.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    ) : (
      <div className="px-2 py-1.5 text-[13px] font-bold">{value || "—"}</div>
    );
  const text = (value: string | undefined, onChange: (v: string) => void, rows = 3) =>
    canWrite ? <Cell value={value ?? ""} multiline rows={rows} onSave={onChange} /> : ro(value);

  const goals = Array.from({ length: goalCount }, (_, i) => form.goals[i] ?? {}).map((g, i) => ({
    i,
    g,
  }));
  const shownGoals = goals.filter(({ g }) => g.goal || g.rating);
  const goalRating = (i: number) => review?.goal_ratings[String(i)] ?? {};
  const valueRating = (k: string) => review?.value_ratings[k] ?? {};
  const selfGoals = selfSummary(form.goals.map((g) => g.rating));
  const selfValues = selfSummary(VALUES.map((v) => form.value_answers[v.key]?.rating));
  const rec = extra.recommendation ?? {};

  return (
    <section className="ce-card space-y-6 overflow-hidden p-4">
      <div className="-m-4 mb-0 bg-night px-4 py-3 text-center text-white">
        <p className="font-display text-xl">ANNUAL MANAGER EVALUATION FORM</p>
        <p className="text-[12px] font-bold tracking-[0.08em] text-goldL uppercase">
          For the year January {year} to December {year}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-soft">
          {canWrite
            ? "Review the team member's self-evaluation. For every goal and value, the self-rating is shown; add your own rating and remarks that explain it. Discuss it with them before you sign off."
            : complete
              ? "The manager evaluation is complete."
              : "Waiting for the manager evaluation."}
        </p>
        <button type="button" className="btn3d btn3d-gold" onClick={onPdf}>
          <Download className="mr-1 inline h-4 w-4" />
          PDF
        </button>
      </div>

      <Section title="About this review">
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <tbody>
            {(
              [
                ["Team member name", personName],
                ["Role / team", roleTeam],
                ["Manager (reviewer)", reviewerName],
                ["Review period", reviewPeriod],
                [
                  "Self-evaluation received on",
                  receivedOn ? niceDate(receivedOn.slice(0, 10)) : "",
                ],
              ] as const
            ).map(([k, v]) => (
              <tr key={k}>
                <th className={`${th} w-64`}>{k}</th>
                <td className={td}>{ro(v)}</td>
              </tr>
            ))}
            <tr>
              <th className={th}>Review discussion date</th>
              <td className={td}>
                {canWrite ? (
                  <input
                    type="date"
                    className="ce-input w-auto"
                    value={extra.discussion_date ?? ""}
                    onChange={(e) => onSave(["discussion_date"], e.target.value)}
                  />
                ) : (
                  ro(extra.discussion_date ? niceDate(extra.discussion_date) : "")
                )}
              </td>
            </tr>
            <tr>
              <th className={th}>Date completed</th>
              <td className={td}>{ro(completedOn ? niceDate(completedOn.slice(0, 10)) : "")}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <details className="rounded-lg border border-line p-3">
        <summary className="cursor-pointer font-display text-lg text-ink">
          How this form works
        </summary>
        <p className="mt-2 text-sm text-soft">
          The appraisal has two equal parts, matching the self-evaluation form:{" "}
          <b>A. Goals and Impact (50%)</b> and <b>B. Competencies and Values (50%)</b>. Rate on
          evidence and outcomes, not on effort or hours worked. Where your rating differs from the
          self-rating, your remarks must say why.
        </p>
        <table className="mt-3 w-full border-collapse text-[13px]">
          <tbody>
            <tr>
              <th className={`${th} w-48`}>Self-rating</th>
              <td className="border border-line px-2 py-1.5">
                The rating the team member gave in their self-evaluation (shown here as they gave
                it)
              </td>
            </tr>
            <tr>
              <th className={th}>Manager rating</th>
              <td className="border border-line px-2 py-1.5">
                Your own rating on the same scale, based on the evidence and what you observed
                during the year
              </td>
            </tr>
            <tr>
              <th className={th}>Manager remarks / feedback</th>
              <td className="border border-line px-2 py-1.5">
                What went well, what could improve, and the reason for any difference from the
                self-rating
              </td>
            </tr>
            {RATINGS.map((r) => (
              <tr key={r}>
                <th className={th}>{RATING_LABEL[r]}</th>
                <td className="border border-line px-2 py-1.5">{RATING_MEANING[r]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <Section
        title="Part A: Goals and Impact (50%)"
        note="Each goal from the team member's self-evaluation with their self-rating; add your rating and remarks. Rate the outcome delivered, not the effort."
      >
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] font-bold tracking-[0.04em] text-ink uppercase">
              <th className={`${th} w-10`}>#</th>
              <th className={`${th} min-w-[240px]`}>Goal (as listed by the team member)</th>
              <th className={`${th} w-28`}>Self-rating</th>
              <th className={`${mth} w-32`}>Manager rating</th>
              <th className={`${mth} min-w-[280px]`}>Manager remarks / feedback</th>
            </tr>
          </thead>
          <tbody>
            {shownGoals.map(({ i, g }, n) => (
              <tr key={i}>
                <td className={`${td} px-2 py-1.5 text-center`}>{n + 1}</td>
                <td className={td}>{ro(g.goal)}</td>
                <td className={`${td} px-2 py-1.5 font-bold`}>{g.rating || "—"}</td>
                <td className={`${td} p-1`}>
                  {pick(goalRating(i).rating, (v) => onRate(["goals", String(i), "rating"], v))}
                </td>
                <td className={td}>
                  {text(goalRating(i).comment, (v) => onRate(["goals", String(i), "comment"], v))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="mt-3 w-full min-w-[700px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] font-bold tracking-[0.04em] text-ink uppercase">
              <th className={`${th} w-64`}>Part A summary</th>
              <th className={`${th} w-28`}>Self-rating</th>
              <th className={`${mth} w-32`}>Manager rating</th>
              <th className={mth}>Overall remarks on goals</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className={`${th} font-bold`}>Overall Goals and Impact</th>
              <td className={`${td} px-2 py-1.5 font-bold`}>{selfGoals ?? "—"}</td>
              <td className={`${td} p-1`}>
                {pick(extra.goals_summary?.rating, (v) => onSave(["goals_summary", "rating"], v))}
              </td>
              <td className={td}>
                {text(extra.goals_summary?.remarks, (v) => onSave(["goals_summary", "remarks"], v))}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section
        title="Part B: Competencies and Values (50%)"
        note="For each value, the self-rating is shown; add your rating and one example you observed this year that supports it."
      >
        <table className="w-full min-w-[800px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] font-bold tracking-[0.04em] text-ink uppercase">
              <th className={`${th} w-40`}>Value</th>
              <th className={`${th} w-28`}>Self-rating</th>
              <th className={`${mth} w-32`}>Manager rating</th>
              <th className={mth}>Manager remarks / feedback (example observed)</th>
            </tr>
          </thead>
          <tbody>
            {VALUES.map((v) => (
              <tr key={v.key}>
                <td className={`${td} px-2 py-1.5 font-bold`}>{v.name}</td>
                <td className={`${td} px-2 py-1.5 font-bold`}>
                  {form.value_answers[v.key]?.rating || "—"}
                </td>
                <td className={`${td} p-1`}>
                  {pick(valueRating(v.key).rating, (x) => onRate(["values", v.key, "rating"], x))}
                </td>
                <td className={td}>
                  {text(
                    valueRating(v.key).comment,
                    (x) => onRate(["values", v.key, "comment"], x),
                    2,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="mt-3 w-full min-w-[700px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] font-bold tracking-[0.04em] text-ink uppercase">
              <th className={`${th} w-64`}>Part B summary</th>
              <th className={`${th} w-28`}>Self-rating</th>
              <th className={`${mth} w-32`}>Manager rating</th>
              <th className={mth}>Overall remarks on values</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className={`${th} font-bold`}>Overall Competencies and Values</th>
              <td className={`${td} px-2 py-1.5 font-bold`}>{selfValues ?? "—"}</td>
              <td className={`${td} p-1`}>
                {pick(extra.values_summary?.rating, (v) => onSave(["values_summary", "rating"], v))}
              </td>
              <td className={td}>
                {text(extra.values_summary?.remarks, (v) =>
                  onSave(["values_summary", "remarks"], v),
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section
        title="Part C: Overall Manager Ratings & Remarks"
        note="Bring the two parts together. The final rating is your judgement across both parts, each weighted at 50%."
      >
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] font-bold tracking-[0.04em] text-ink uppercase">
              <th className={`${th} w-56`}>Component</th>
              <th className={`${th} w-20`}>Weight</th>
              <th className={`${th} w-28`}>Self-rating</th>
              <th className={`${mth} w-32`}>Manager rating</th>
              <th className={mth}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["goals", "A. Goals and Impact", selfGoals],
                ["values", "B. Competencies and Values", selfValues],
              ] as const
            ).map(([k, label, s]) => (
              <tr key={k}>
                <td className={`${td} px-2 py-1.5 font-bold`}>{label}</td>
                <td className={`${td} px-2 py-1.5`}>50%</td>
                <td className={`${td} px-2 py-1.5 font-bold`}>{s ?? "—"}</td>
                <td className={`${td} p-1`}>
                  {pick(extra.overall?.[k]?.rating, (v) => onSave(["overall", k, "rating"], v))}
                </td>
                <td className={td}>
                  {text(
                    extra.overall?.[k]?.remarks,
                    (v) => onSave(["overall", k, "remarks"], v),
                    2,
                  )}
                </td>
              </tr>
            ))}
            <tr className="bg-cream">
              <td className={`${td} px-2 py-1.5 font-bold`} colSpan={3}>
                Final rating
              </td>
              <td className={`${td} p-1`} colSpan={2}>
                {canWrite ? (
                  <select
                    className="ce-input w-auto text-[13px]"
                    value={review?.overall_rating ?? ""}
                    onChange={(e) => onRate(["overall_rating"], e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {RATINGS.map((r) => (
                      <option key={r} value={r}>
                        {RATING_LABEL[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-2 py-1.5 font-bold">
                    {review?.overall_rating
                      ? RATING_LABEL[review.overall_rating as keyof typeof RATING_LABEL]
                      : "—"}
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section
        title="Part D: Readiness of Talent"
        note="The team member's self-assessment of potential, then your own view."
      >
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] font-bold tracking-[0.04em] text-ink uppercase">
              <th className={`${th} w-72`}>Potential question</th>
              <th className={`${th} w-32`}>Self-rating</th>
              <th className={`${mth} w-40`}>Manager rating</th>
              <th className={mth}>Manager remarks</th>
            </tr>
          </thead>
          <tbody>
            {POTENTIAL.map((q) => (
              <tr key={q.key}>
                <td className={`${td} px-2 py-1.5 font-bold`}>{MANAGER_POTENTIAL[q.key]}</td>
                <td className={`${td} px-2 py-1.5 font-bold`}>
                  {form.potential[q.key]?.rating || "—"}
                </td>
                <td className={`${td} p-1`}>
                  {pick(
                    extra.potential?.[q.key]?.rating,
                    (v) => onSave(["potential", q.key, "rating"], v),
                    POTENTIAL_LEVELS,
                  )}
                </td>
                <td className={td}>
                  {text(
                    extra.potential?.[q.key]?.remarks,
                    (v) => onSave(["potential", q.key, "remarks"], v),
                    2,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title="Part E: Manager Feedback"
        note="Answer each question in two or three sentences. Refer to the team member's reflection (Part C of their self-evaluation) where relevant."
      >
        <table className="w-full min-w-[600px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] font-bold tracking-[0.04em] text-ink uppercase">
              <th className={`${th} w-80`}>Question</th>
              <th className={mth}>Manager response</th>
            </tr>
          </thead>
          <tbody>
            {MANAGER_FEEDBACK.map((q) => (
              <tr key={q.key}>
                <td className={`${td} px-2 py-1.5 font-bold`}>{q.question}</td>
                <td className={td}>
                  {text(extra.feedback?.[q.key], (v) => onSave(["feedback", q.key], v))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Recommendation">
        <table className="w-full min-w-[600px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] font-bold tracking-[0.04em] text-ink uppercase">
              <th className={`${th} w-72`}>Recommendation</th>
              <th className={`${th} w-24 text-center`}>Tick one (✓)</th>
              <th className={th}>Comments</th>
            </tr>
          </thead>
          <tbody>
            {RECOMMENDATIONS.map((r) => (
              <tr key={r.key}>
                <td className={`${td} px-2 py-1.5 font-bold`}>{r.label}</td>
                <td className={`${td} text-center`}>
                  {canWrite ? (
                    <input
                      type="radio"
                      name="recommendation"
                      className="mt-2 h-4 w-4"
                      checked={rec.choice === r.key}
                      onChange={() => onSave(["recommendation", "choice"], r.key)}
                    />
                  ) : (
                    <div className="px-2 py-1.5 text-lg font-bold">
                      {rec.choice === r.key ? "✓" : ""}
                    </div>
                  )}
                </td>
                <td className={td}>
                  {text(
                    rec.comments?.[r.key],
                    (v) => onSave(["recommendation", "comments", r.key], v),
                    2,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title="Internal or Customer Feedback for Team Member"
        note="To be filled in by the team member after the review discussion (optional)."
      >
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <tbody>
            <tr>
              <th className={`${th} w-64`}>Comments on this evaluation</th>
              <td className={td}>
                {self && complete ? (
                  <Cell value={memberComment} multiline rows={4} onSave={onMemberComment} />
                ) : (
                  ro(memberComment)
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section
        title="Sign-off"
        note="By signing, the manager confirms that the ratings above are based on evidence."
      >
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <tbody>
            <tr>
              <th className={`${th} w-64`}>Name</th>
              <td className={td}>{ro(extra.signed_name ? reviewerName : "")}</td>
            </tr>
            <tr>
              <th className={th}>Signature</th>
              <td className={td}>
                {ro(extra.signed_name ? `${extra.signed_name} (signed in the Team App)` : "")}
              </td>
            </tr>
            <tr>
              <th className={th}>Date</th>
              <td className={td}>
                {ro(extra.signed_at ? niceDate(extra.signed_at.slice(0, 10)) : "")}
              </td>
            </tr>
          </tbody>
        </table>
        {canWrite ? (
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />
              By signing, I confirm that the ratings above are based on evidence.
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <label>
                <span className="ce-label">Type your full name to sign</span>
                <input
                  className="ce-input"
                  value={name}
                  placeholder={reviewerName}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn3d btn3d-gold"
                disabled={
                  !confirm || name.trim().length < 2 || !review?.overall_rating || signingOff
                }
                onClick={() => onSignOff(name.trim())}
              >
                Sign off and complete
              </button>
            </div>
            <p className="text-[12px] text-soft">
              {review?.overall_rating
                ? "Signing off completes the evaluation: it is locked and the team member sees it. HR can reopen it."
                : "Choose the final rating in Part C before you sign off."}
            </p>
          </div>
        ) : null}
      </Section>
    </section>
  );
}
