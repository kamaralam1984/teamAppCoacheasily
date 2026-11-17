import { useState, type ReactNode } from "react";
import { Download } from "lucide-react";

import { Cell } from "@/components/selfeval/AutoSaveCell";
import { niceDate } from "@/lib/calendar";
import {
  MANAGER_FEEDBACK,
  MANAGER_POTENTIAL,
  MANAGER_POTENTIAL_LEVELS,
  POTENTIAL,
  RATING_LABEL,
  RATING_MEANING,
  RATINGS,
  RECOMMENDATIONS,
  VALUES,
  finalFromParts,
  selfSummary,
  type FormLike,
  type ManagerExtra,
  type ReviewLike,
} from "@/lib/selfEvaluation";
import { MANAGER_FORM_TEXT, POTENTIAL_SCALE, SCALE } from "@/lib/managerFormText";

const FORM_ROWS = 5;

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

function Head({ label, scale }: { label: string; scale?: string }) {
  return (
    <>
      {label}
      {scale ? (
        <>
          <br />
          <span className="font-normal normal-case">{scale}</span>
        </>
      ) : null}
    </>
  );
}

function Example({ label }: { label: string }) {
  return (
    <p className="text-[12px] font-bold tracking-[0.06em] text-red uppercase">
      Example <span className="font-normal normal-case">{label}</span>
    </p>
  );
}

/**
 * The "Annual Manager Evaluation Form", as the company's Word form has it: About this review,
 * How this form works (with the worked examples), Part A + summary, Part B + summary, Part C,
 * Part D readiness of talent, Part E manager feedback, Recommendation, the team member's
 * comments and the manager's sign-off.
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
  review: ReviewLike | null;
  extra: ManagerExtra;
  /** the direct manager, while the evaluation waits for them */
  canWrite: boolean;
  /** the viewer is the team member */
  self: boolean;
  complete: boolean;
  memberComment: string;
  /** per-goal / per-value rating and remarks */
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
  const th = "border border-line bg-gold/40 px-2 py-2 text-left align-top";
  const td = "border border-line align-top";
  const head = "text-[11px] font-bold tracking-[0.04em] text-ink uppercase";
  const ro = (v: string | undefined | null) => (
    <div className="min-h-[30px] px-2 py-1.5 text-[13px] whitespace-pre-wrap text-ink">
      {v || ""}
    </div>
  );
  const pick = (
    value: string | undefined | null,
    onChange: (v: string) => void,
    options: readonly string[] = RATINGS,
    enabled = canWrite,
  ) =>
    enabled ? (
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
      <div className="min-h-[30px] px-2 py-1.5 text-[13px] font-bold">{value || ""}</div>
    );
  const text = (value: string | undefined, onChange: (v: string) => void, rows = 3) =>
    canWrite ? <Cell value={value ?? ""} multiline rows={rows} onSave={onChange} /> : ro(value);
  const hint = (v: string | null) =>
    canWrite && v ? (
      <p className="px-2 pb-1 text-[11px] text-soft">From their ratings: {v}</p>
    ) : null;

  const goalRating = (i: number) => review?.goal_ratings[String(i)] ?? {};
  const valueRating = (k: string) => review?.value_ratings[k] ?? {};
  const avgGoals = selfSummary(form.goals.map((g) => g.rating));
  const avgValues = selfSummary(VALUES.map((v) => form.value_answers[v.key]?.rating));
  const rows = Math.max(FORM_ROWS, form.goals.filter((g) => g.goal || g.rating).length);
  const rec = extra.recommendation ?? {};
  const finalNow = finalFromParts(extra.overall?.goals?.rating, extra.overall?.values?.rating);
  const ratingHead = (
    <>
      <th className={`${th} w-32`}>
        <Head label="Self-rating" scale={SCALE} />
      </th>
      <th className={`${th} w-32`}>
        <Head label="Manager rating" scale={SCALE} />
      </th>
    </>
  );

  return (
    <section className="ce-card space-y-6 overflow-hidden p-4">
      <div className="-m-4 mb-0 bg-night px-4 py-3 text-center text-white">
        <p className="font-display text-xl">ANNUAL MANAGER EVALUATION FORM</p>
        <p className="text-[12px] font-bold tracking-[0.08em] text-goldL">
          For the year January {year} to December {year}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <p className="mr-auto max-w-3xl text-sm text-soft">{MANAGER_FORM_TEXT.intro}</p>
        <button type="button" className="btn3d btn3d-gold" onClick={onPdf}>
          <Download className="mr-1 inline h-4 w-4" />
          PDF
        </button>
      </div>

      <Section title="About this review">
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <thead>
            <tr className={head}>
              <th className={`${th} w-64`}>Field</th>
              <th className={th}>Details</th>
            </tr>
          </thead>
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
                <td className={`${td} px-2 py-1.5`}>{k}</td>
                <td className={td}>{ro(v)}</td>
              </tr>
            ))}
            <tr>
              <td className={`${td} px-2 py-1.5`}>Review discussion date</td>
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
              <td className={`${td} px-2 py-1.5`}>Date completed</td>
              <td className={td}>{ro(completedOn ? niceDate(completedOn.slice(0, 10)) : "")}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="How this form works" note={MANAGER_FORM_TEXT.works}>
        <table className="w-full min-w-[600px] border-collapse text-[13px]">
          <thead>
            <tr className={head}>
              <th className={`${th} w-64`}>Part</th>
              <th className={`${th} w-20`}>Weight</th>
              <th className={th}>What it covers</th>
            </tr>
          </thead>
          <tbody>
            {MANAGER_FORM_TEXT.parts.map(([p, w, c]) => (
              <tr key={p}>
                <td className={`${td} px-2 py-1.5`}>{p}</td>
                <td className={`${td} px-2 py-1.5`}>{w}</td>
                <td className={`${td} px-2 py-1.5`}>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4 className="mt-4 font-display text-base text-ink">How to complete each section</h4>
        <table className="mt-2 w-full min-w-[600px] border-collapse text-[13px]">
          <thead>
            <tr className={head}>
              <th className={`${th} w-64`}>Column</th>
              <th className={th}>What to enter</th>
            </tr>
          </thead>
          <tbody>
            {MANAGER_FORM_TEXT.columns.map(([k, v]) => (
              <tr key={k}>
                <td className={`${td} px-2 py-1.5`}>{k}</td>
                <td className={`${td} px-2 py-1.5`}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-sm text-soft">Use this rating scale for every rating.</p>
        <table className="mt-2 w-full min-w-[600px] border-collapse text-[13px]">
          <thead>
            <tr className={head}>
              <th className={`${th} w-72`}>Rating</th>
              <th className={th}>What it means</th>
            </tr>
          </thead>
          <tbody>
            {RATINGS.map((r) => (
              <tr key={r}>
                <td className={`${td} px-2 py-1.5`}>{RATING_LABEL[r]}</td>
                <td className={`${td} px-2 py-1.5`}>{RATING_MEANING[r]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Example: how to fill in a goal" note={MANAGER_FORM_TEXT.exampleNote}>
        <Example label="For guidance only. Do not fill in this table." />
        <table className="mt-1 w-full min-w-[900px] border-collapse text-[13px] opacity-80">
          <thead>
            <tr className={head}>
              <th className={`${th} w-10`}>#</th>
              <th className={`${th} w-72`}>Goal (as listed by the team member)</th>
              {ratingHead}
              <th className={th}>Manager remarks / feedback</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${td} px-2 py-1.5`}>1</td>
              <td className={`${td} px-2 py-1.5`}>{MANAGER_FORM_TEXT.exampleGoal.goal}</td>
              <td className={`${td} px-2 py-1.5`}>{MANAGER_FORM_TEXT.exampleGoal.self}</td>
              <td className={`${td} px-2 py-1.5`}>{MANAGER_FORM_TEXT.exampleGoal.manager}</td>
              <td className={`${td} px-2 py-1.5`}>{MANAGER_FORM_TEXT.exampleGoal.remarks}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="Part A: Goals and Impact (50%)" note={MANAGER_FORM_TEXT.partA}>
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead>
            <tr className={head}>
              <th className={`${th} w-10`}>#</th>
              <th className={`${th} min-w-[240px]`}>Goal (as listed by the team member)</th>
              {ratingHead}
              <th className={`${th} min-w-[280px]`}>Manager remarks / feedback</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => {
              const g = form.goals[i] ?? {};
              const has = Boolean(g.goal || g.rating);
              return (
                <tr key={i}>
                  <td className={`${td} px-2 py-1.5`}>{i + 1}</td>
                  <td className={td}>{ro(g.goal)}</td>
                  <td className={`${td} px-2 py-1.5 font-bold`}>{g.rating || ""}</td>
                  <td className={`${td} p-1`}>
                    {pick(
                      goalRating(i).rating,
                      (v) => onRate(["goals", String(i), "rating"], v),
                      RATINGS,
                      canWrite && has,
                    )}
                  </td>
                  <td className={td}>
                    {canWrite && has
                      ? text(goalRating(i).comment, (v) =>
                          onRate(["goals", String(i), "comment"], v),
                        )
                      : ro(goalRating(i).comment)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <table className="mt-3 w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className={head}>
              <th className={`${th} w-64`}>Part A summary</th>
              {ratingHead}
              <th className={th}>Overall remarks on goals</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${td} px-2 py-1.5`}>Overall Goals and Impact</td>
              <td className={`${td} p-1`}>
                {pick(extra.goals_summary?.self_rating, (v) =>
                  onSave(["goals_summary", "self_rating"], v),
                )}
                {hint(avgGoals)}
              </td>
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

      <Section title="Part B: Competencies and Values (50%)" note={MANAGER_FORM_TEXT.partB}>
        <Example label="How to fill in one value. For guidance only." />
        <table className="mt-1 w-full min-w-[800px] border-collapse text-[13px] opacity-80">
          <thead>
            <tr className={head}>
              <th className={`${th} w-40`}>Value</th>
              {ratingHead}
              <th className={th}>Manager remarks / feedback (example observed)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${td} px-2 py-1.5`}>{MANAGER_FORM_TEXT.exampleValue.value}</td>
              <td className={`${td} px-2 py-1.5`}>{MANAGER_FORM_TEXT.exampleValue.self}</td>
              <td className={`${td} px-2 py-1.5`}>{MANAGER_FORM_TEXT.exampleValue.manager}</td>
              <td className={`${td} px-2 py-1.5`}>{MANAGER_FORM_TEXT.exampleValue.remarks}</td>
            </tr>
          </tbody>
        </table>
        <table className="mt-3 w-full min-w-[800px] border-collapse text-[13px]">
          <thead>
            <tr className={head}>
              <th className={`${th} w-40`}>Value</th>
              {ratingHead}
              <th className={th}>Manager remarks / feedback (example observed)</th>
            </tr>
          </thead>
          <tbody>
            {VALUES.map((v) => (
              <tr key={v.key}>
                <td className={`${td} px-2 py-1.5`}>{v.name}</td>
                <td className={`${td} px-2 py-1.5 font-bold`}>
                  {form.value_answers[v.key]?.rating || ""}
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
        <table className="mt-3 w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className={head}>
              <th className={`${th} w-64`}>Part B summary</th>
              {ratingHead}
              <th className={th}>Overall remarks on values</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${td} px-2 py-1.5`}>Overall Competencies and Values</td>
              <td className={`${td} p-1`}>
                {pick(extra.values_summary?.self_rating, (v) =>
                  onSave(["values_summary", "self_rating"], v),
                )}
                {hint(avgValues)}
              </td>
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

      <Section title="Part C: Overall Manager Ratings & Remarks" note={MANAGER_FORM_TEXT.partC}>
        <table className="w-full min-w-[800px] border-collapse text-[13px]">
          <thead>
            <tr className={head}>
              <th className={`${th} w-56`}>Component</th>
              <th className={`${th} w-20`}>Weight</th>
              {ratingHead}
              <th className={th}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["goals", "A. Goals and Impact", avgGoals],
                ["values", "B. Competencies and Values", avgValues],
              ] as const
            ).map(([k, label, avg]) => (
              <tr key={k}>
                <td className={`${td} px-2 py-1.5`}>{label}</td>
                <td className={`${td} px-2 py-1.5`}>50%</td>
                <td className={`${td} p-1`}>
                  {pick(extra.overall?.[k]?.self_rating, (v) =>
                    onSave(["overall", k, "self_rating"], v),
                  )}
                  {hint(avg)}
                </td>
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
          </tbody>
        </table>
      </Section>

      <Section title="Part D: Readiness of Talent" note={MANAGER_FORM_TEXT.partD}>
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className={head}>
              <th className={`${th} w-72`}>Potential question</th>
              <th className={`${th} w-32`}>
                <Head label="Self-rating" scale={POTENTIAL_SCALE} />
              </th>
              <th className={`${th} w-36`}>
                <Head label="Manager rating" scale={POTENTIAL_SCALE} />
              </th>
              <th className={th}>Manager remarks</th>
            </tr>
          </thead>
          <tbody>
            {POTENTIAL.map((q) => (
              <tr key={q.key}>
                <td className={`${td} px-2 py-1.5`}>{MANAGER_POTENTIAL[q.key]}</td>
                <td className={`${td} px-2 py-1.5 font-bold`}>
                  {form.potential[q.key]?.rating || ""}
                </td>
                <td className={`${td} p-1`}>
                  {pick(
                    extra.potential?.[q.key]?.rating,
                    (v) => onSave(["potential", q.key, "rating"], v),
                    MANAGER_POTENTIAL_LEVELS,
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

      <Section title="Part E: Manager Feedback" note={MANAGER_FORM_TEXT.partE}>
        <table className="w-full min-w-[600px] border-collapse text-[13px]">
          <thead>
            <tr className={head}>
              <th className={`${th} w-80`}>Question</th>
              <th className={th}>Manager response</th>
            </tr>
          </thead>
          <tbody>
            {MANAGER_FEEDBACK.map((q) => (
              <tr key={q.key}>
                <td className={`${td} px-2 py-1.5`}>{q.question}</td>
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
            <tr className={head}>
              <th className={`${th} w-72`}>Recommendation</th>
              <th className={`${th} w-24 text-center`}>
                <Head label="Tick one" scale="(✓)" />
              </th>
              <th className={th}>Comments</th>
            </tr>
          </thead>
          <tbody>
            {RECOMMENDATIONS.map((r) => (
              <tr key={r.key}>
                <td className={`${td} px-2 py-1.5`}>{r.label}</td>
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
        note={MANAGER_FORM_TEXT.member}
      >
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <tbody>
            <tr>
              <td className={`${td} w-64 px-2 py-1.5`}>Comments on this evaluation</td>
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

      <Section title="Sign-off" note={MANAGER_FORM_TEXT.signoff}>
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <thead>
            <tr className={head}>
              <th className={`${th} w-64`}>Field</th>
              <th className={th}>Manager</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${td} px-2 py-1.5`}>Name</td>
              <td className={td}>{ro(extra.signed_name ? reviewerName : "")}</td>
            </tr>
            <tr>
              <td className={`${td} px-2 py-1.5`}>Signature</td>
              <td className={td}>
                {ro(extra.signed_name ? `${extra.signed_name} (signed in the Team App)` : "")}
              </td>
            </tr>
            <tr>
              <td className={`${td} px-2 py-1.5`}>Date</td>
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
              {MANAGER_FORM_TEXT.signoff}
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
                disabled={!confirm || name.trim().length < 2 || !finalNow || signingOff}
                onClick={() => onSignOff(name.trim())}
              >
                Sign off
              </button>
            </div>
            <p className="text-[12px] text-soft">
              {finalNow
                ? `Final rating from Part C (A and B at 50% each): ${RATING_LABEL[finalNow]}. Signing off completes the evaluation; the team member then sees it. HR can reopen it.`
                : "Give your Part C manager ratings for A and B before you sign off."}
            </p>
          </div>
        ) : null}
      </Section>
    </section>
  );
}
