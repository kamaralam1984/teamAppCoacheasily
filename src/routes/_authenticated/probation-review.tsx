import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Cell, DraftsContext } from "@/components/probation/AutoSaveCell";
import { useDeveloperAccess } from "@/hooks/useDeveloper";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useProbationOverview, type ProbationDecision } from "@/hooks/useProbation";
import {
  useDevProbationList,
  useProbationReview,
  useProbationReviewSteps,
  useProbationReviewWrites,
  type FeedbackKind,
  type ProbationKra,
  type ProbationReview,
} from "@/hooks/useProbationReview";
import { useWarriors } from "@/hooks/useWarriors";
import { niceDate, todayIso, daysBetween } from "@/lib/calendar";
import { buildCsv, buildPdf, downloadBytes, MIME, safeFileName } from "@/lib/exporters";
import { PROBATION_LABEL, probationLeftText } from "@/lib/probation";
import {
  averagePercent,
  DECISION_LABEL,
  FEEDBACK_LABEL,
  feedbackKindsFor,
  kraEditable,
  probationReviewTable,
  reviewStage,
  STAGE_LABEL,
  type ReviewStage,
} from "@/lib/probationReview";
import { downlineIds } from "@/lib/warriors";

export const Route = createFileRoute("/_authenticated/probation-review")({
  head: () => ({
    meta: [
      { title: "Probation Review | CoachEasily Team App" },
      {
        name: "description",
        content:
          "The 90-day KRA review for people on probation, with manager, HR and Sir feedback.",
      },
    ],
  }),
  // ?person=<profile id> opens that person's review (from notifications and the Warriors page)
  validateSearch: (search: Record<string, unknown>): { person?: string } =>
    typeof search["person"] === "string" ? { person: search["person"] } : {},
  component: ProbationReviewPage,
});

interface Entry {
  profile_id: string;
  full_name: string;
  start_date: string;
  end_date: string;
  status: keyof typeof PROBATION_LABEL;
  days_left: number;
  review: ProbationReview | null;
}

const STEPS: { stage: ReviewStage; label: string }[] = [
  { stage: "self", label: "1 · Self evaluation" },
  { stage: "manager", label: "2 · Manager evaluation" },
  { stage: "feedback", label: "3 · HR & Sir feedback" },
  { stage: "final", label: "4 · Final decision" },
];
const STAGE_ORDER: ReviewStage[] = ["self", "manager", "feedback", "final"];

function ProbationReviewPage() {
  const { person: personParam } = Route.useSearch();
  const navigate = useNavigate();
  const { data: me } = useMyProfile();
  const viewer = me?.profile ?? null;
  const { data: warriors } = useWarriors();
  const { data: dev } = useDeveloperAccess(Boolean(viewer));
  const isHrAdmin = viewer?.role === "hr" || viewer?.role === "admin";
  const isDev = Boolean(dev?.isDeveloper);
  const devList = isDev && !isHrAdmin;
  const today = todayIso();

  const { data: overview, isLoading: overviewLoading } = useProbationOverview(Boolean(viewer));
  const { data: steps } = useProbationReviewSteps(Boolean(viewer) && !devList);
  const { data: devData } = useDevProbationList(Boolean(viewer) && devList);

  // everyone whose review the viewer may open: still on probation, or with a review on record
  const entries: Entry[] = useMemo(() => {
    const names = new Map((warriors ?? []).map((w) => [w.id, w]));
    const reviews = new Map(
      (devList ? (devData?.reviews ?? []) : (steps ?? [])).map((r) => [r.profile_id, r]),
    );
    const rows = devList
      ? (devData?.probations ?? []).flatMap((p) => {
          const w = names.get(p.profile_id);
          if (!w || w.status !== "active") return [];
          return [{ ...p, full_name: w.full_name, days_left: daysBetween(today, p.end_date) }];
        })
      : (overview ?? []);
    return rows
      .map((r) => ({
        profile_id: r.profile_id,
        full_name: r.full_name,
        start_date: r.start_date,
        end_date: r.end_date,
        status: r.status,
        days_left: r.days_left,
        review: reviews.get(r.profile_id) ?? null,
      }))
      .filter((e) => e.status !== "confirmed" || e.review)
      .sort((a, b) => a.end_date.localeCompare(b.end_date));
  }, [overview, steps, devData, devList, warriors, today]);

  const selectedId =
    (personParam && entries.some((e) => e.profile_id === personParam) ? personParam : null) ??
    (entries.some((e) => e.profile_id === viewer?.id) ? viewer!.id : null) ??
    entries[0]?.profile_id ??
    null;
  const selected = entries.find((e) => e.profile_id === selectedId) ?? null;
  const team = useMemo(
    () => (viewer ? downlineIds(warriors ?? [], viewer.id) : new Set<string>()),
    [warriors, viewer],
  );
  const self = Boolean(viewer && selectedId === viewer.id);
  const managesPerson = Boolean(selectedId && team.has(selectedId));
  const reviewer = !self && (isHrAdmin || managesPerson);
  const viaDev = isDev && !self && !reviewer;
  const showList = entries.length > 1 || (entries.length === 1 && !self);

  return (
    <AppShell>
      <div className="space-y-5 py-2">
        <div className="ce-rise">
          <h1 className="font-display text-3xl text-ink">Probation Review</h1>
          <p className="mt-1 text-sm text-soft">
            The KRA sheet for the first 90 days: self evaluation, manager evaluation, then HR and
            Sir feedback and the final decision.
          </p>
        </div>

        {overviewLoading && !devList ? (
          <div className="ce-card p-6 text-sm text-soft">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="ce-card p-6 text-sm text-soft">
            {isHrAdmin || team.size > 0 || isDev
              ? "Nobody is on probation right now."
              : "You are not on probation, so there is no review to fill."}
          </div>
        ) : (
          <>
            {showList ? (
              <section className="ce-card overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="bg-cream text-[11px] font-bold tracking-[0.04em] text-soft uppercase">
                      <th className="px-4 py-2">Person</th>
                      <th className="px-4 py-2">Probation</th>
                      <th className="px-4 py-2">Ends</th>
                      <th className="px-4 py-2">Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr
                        key={e.profile_id}
                        className={`cursor-pointer border-t border-line hover:bg-gold/10 ${
                          e.profile_id === selectedId ? "bg-gold/15" : ""
                        }`}
                        onClick={() =>
                          void navigate({
                            to: "/probation-review",
                            search: { person: e.profile_id },
                          })
                        }
                      >
                        <td className="px-4 py-2 font-bold text-ink">
                          {e.full_name}
                          {e.profile_id === viewer?.id ? " (you)" : ""}
                        </td>
                        <td className="px-4 py-2">{PROBATION_LABEL[e.status]}</td>
                        <td className="px-4 py-2">
                          {niceDate(e.end_date)}
                          {e.status !== "confirmed" ? (
                            <span className="ml-1 text-soft">
                              · {probationLeftText(e.days_left)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2">{STAGE_LABEL[reviewStage(e.review)]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}

            {selected && viewer ? (
              <ReviewSheet
                key={selected.profile_id}
                entry={selected}
                orgId={viewer.org_id}
                role={viewer.role}
                viewer={{ self, reviewer, hrOrAdmin: isHrAdmin, dev: viaDev }}
                managesPerson={managesPerson}
                names={new Map((warriors ?? []).map((w) => [w.id, w.full_name]))}
                showHistory={isHrAdmin || isDev}
              />
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

function ReviewSheet({
  entry,
  orgId,
  role,
  viewer,
  managesPerson,
  names,
  showHistory,
}: {
  entry: Entry;
  orgId: string;
  role: string;
  viewer: { self: boolean; reviewer: boolean; hrOrAdmin: boolean; dev: boolean };
  managesPerson: boolean;
  names: Map<string, string>;
  showHistory: boolean;
}) {
  const { data, isLoading, error } = useProbationReview(entry.profile_id, viewer.dev);
  const writes = useProbationReviewWrites(entry.profile_id, viewer.dev);
  const review = data?.review ?? null;
  const stage = reviewStage(review);
  const can = kraEditable(viewer, review);
  const kras: ProbationKra[] = (data?.kras ?? []).filter((k) => !k.removed_at);
  const myKinds = stage === "final" ? [] : feedbackKindsFor(role, managesPerson, viewer.self);
  const firstName = entry.full_name.split(" ")[0] ?? entry.full_name;

  const fail = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : "That didn't save. Please try again.");

  // unsaved typing, shared with the Save button and the page leaving
  const [dirtyCount, setDirtyCount] = useState(0);
  const drafts = useMemo(() => {
    const flushers = new Set<() => void>();
    const dirty = new Set<object>();
    return {
      register(flush: () => void) {
        flushers.add(flush);
        return () => void flushers.delete(flush);
      },
      setDirty(key: object, on: boolean) {
        if (on === dirty.has(key)) return;
        if (on) dirty.add(key);
        else dirty.delete(key);
        setDirtyCount(dirty.size);
      },
      flushAll() {
        for (const f of [...flushers]) f();
      },
    };
  }, []);
  useEffect(() => {
    const hide = () => drafts.flushAll();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") drafts.flushAll();
    };
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [drafts]);
  const saving =
    writes.saveKra.isPending || writes.saveFeedback.isPending || writes.saveNote.isPending;
  const unsaved = dirtyCount > 0 || saving;

  const saveKra = (id: string, values: Partial<ProbationKra>) =>
    writes.saveKra.mutate({ id, values }, { onError: fail });

  const [recommendation, setRecommendation] = useState<ProbationDecision | "">("");
  const [decision, setDecision] = useState<ProbationDecision | "">("");
  const [months, setMonths] = useState(1);
  const [decisionNote, setDecisionNote] = useState("");

  function exportAs(kind: "csv" | "pdf") {
    const table = probationReviewTable(kras);
    const title = `${entry.full_name} - KRA (First 90 days)`;
    const subtitle = `Probation ${niceDate(entry.start_date)} to ${niceDate(entry.end_date)}`;
    const name = safeFileName(title, kind);
    if (kind === "csv") downloadBytes(name, buildCsv(table.columns, table.rows), MIME.csv);
    else {
      downloadBytes(
        name,
        buildPdf(title, subtitle, table.columns, table.rows, new Date(), 8),
        MIME.pdf,
      );
    }
    toast.success(`${kind.toUpperCase()} downloaded.`);
  }

  if (error) {
    return (
      <div className="ce-card p-6 text-sm text-red">
        Couldn't load this review: {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  const empAvg = averagePercent(kras, "emp_achievement");
  const mgrAvg = averagePercent(kras, "mgr_achievement");
  const feedbackOf = (kind: FeedbackKind) =>
    data?.feedback.find((f) => f.kind === kind)?.feedback ?? "";
  const noteOf = (kind: FeedbackKind) => data?.notes.find((n) => n.kind === kind)?.note ?? "";

  const text = (v: string | null) => (
    <div className="px-2 py-1.5 text-[13px] whitespace-pre-wrap text-ink">{v || "—"}</div>
  );

  return (
    <DraftsContext.Provider value={drafts}>
      <section className="ce-card overflow-hidden">
        <div className="bg-night px-4 py-3 text-center text-white">
          <p className="font-display text-xl">{entry.full_name} — KRA review, first 90 days</p>
          <p className="text-[12px] font-bold tracking-[0.08em] text-goldL uppercase">
            {niceDate(entry.start_date)} to {niceDate(entry.end_date)} ·{" "}
            {PROBATION_LABEL[entry.status]}
          </p>
        </div>

        {/* the steps */}
        <ol className="flex flex-wrap gap-2 border-b border-line bg-cream px-4 py-3">
          {STEPS.map((s) => {
            const done =
              STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf(s.stage) || stage === "final";
            const now = s.stage === stage && stage !== "final";
            return (
              <li
                key={s.stage}
                className={`rounded-full px-3 py-1 text-[12px] font-bold ${
                  done ? "bg-emer/15 text-ink" : now ? "bg-gold/40 text-ink" : "bg-white text-soft"
                }`}
              >
                {done ? "✓ " : ""}
                {s.label}
              </li>
            );
          })}
        </ol>

        {kras.length > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-b border-line px-4 py-2">
            <span className="mr-auto text-[12px] text-soft">Download this sheet</span>
            <button type="button" className="btn3d" onClick={() => exportAs("csv")}>
              CSV
            </button>
            <button type="button" className="btn3d btn3d-gold" onClick={() => exportAs("pdf")}>
              PDF
            </button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] border-collapse text-left">
            <thead>
              <tr className="text-[11px] font-bold tracking-[0.04em] text-ink uppercase">
                <th className="w-10 border border-line bg-gold/40 px-2 py-2 text-center">No</th>
                <th className="min-w-[180px] border border-line bg-gold/40 px-2 py-2">
                  KRA / Goal
                </th>
                <th className="min-w-[120px] border border-line bg-gold/40 px-2 py-2">
                  Measures (% / Timeline)
                </th>
                <th className="w-24 border border-line bg-gold/40 px-2 py-2">
                  Employee achievement
                </th>
                <th className="w-24 border border-line bg-orange-300/60 px-2 py-2">
                  Manager achievement
                </th>
                <th className="min-w-[200px] border border-line bg-gold/40 px-2 py-2">
                  Employee self evaluation
                </th>
                <th className="min-w-[220px] border border-line bg-orange-300/60 px-2 py-2">
                  Manager evaluation
                </th>
                <th className="min-w-[180px] border border-line bg-gold/40 px-2 py-2">
                  Employee remark
                </th>
                <th className="min-w-[180px] border border-line bg-orange-300/60 px-2 py-2">
                  Manager evaluation remark
                </th>
                {can.kra ? <th className="w-10 border border-line bg-gold/40" /> : null}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-sm text-soft">
                    Loading…
                  </td>
                </tr>
              ) : kras.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-sm text-soft">
                    No KRAs yet.{" "}
                    {can.kra
                      ? "Add the KRAs for this person below."
                      : `${firstName}'s manager or HR will add them.`}
                  </td>
                </tr>
              ) : (
                kras.map((k, i) => (
                  <tr key={k.id} className="align-top">
                    <td className="border border-line px-2 py-1.5 text-center text-[13px]">
                      {i + 1}
                    </td>
                    <td className="border border-line">
                      {can.kra ? (
                        <Cell
                          value={k.title}
                          multiline
                          placeholder="e.g. Refund query management"
                          onSave={(v) => saveKra(k.id, { title: v })}
                        />
                      ) : (
                        text(k.title)
                      )}
                    </td>
                    <td className="border border-line">
                      {can.kra ? (
                        <Cell
                          value={k.measure}
                          multiline
                          placeholder="100% / timeline"
                          onSave={(v) => saveKra(k.id, { measure: v })}
                        />
                      ) : (
                        text(k.measure)
                      )}
                    </td>
                    <td className="border border-line">
                      {can.emp ? (
                        <Cell
                          value={k.emp_achievement ?? ""}
                          placeholder="e.g. 90%"
                          onSave={(v) => saveKra(k.id, { emp_achievement: v })}
                        />
                      ) : (
                        text(k.emp_achievement)
                      )}
                    </td>
                    <td className="border border-line">
                      {can.mgr ? (
                        <Cell
                          value={k.mgr_achievement ?? ""}
                          placeholder="e.g. 85%"
                          onSave={(v) => saveKra(k.id, { mgr_achievement: v })}
                        />
                      ) : (
                        text(k.mgr_achievement)
                      )}
                    </td>
                    <td className="border border-line">
                      {can.emp ? (
                        <Cell
                          value={k.emp_evaluation ?? ""}
                          multiline
                          rows={3}
                          placeholder="How did this go for you?"
                          onSave={(v) => saveKra(k.id, { emp_evaluation: v })}
                        />
                      ) : (
                        text(k.emp_evaluation)
                      )}
                    </td>
                    <td className="border border-line">
                      {can.mgr ? (
                        <Cell
                          value={k.mgr_evaluation ?? ""}
                          multiline
                          rows={3}
                          placeholder="What is going well, what needs to improve"
                          onSave={(v) => saveKra(k.id, { mgr_evaluation: v })}
                        />
                      ) : (
                        text(k.mgr_evaluation)
                      )}
                    </td>
                    <td className="border border-line">
                      {can.empRemark ? (
                        <Cell
                          value={k.emp_remark ?? ""}
                          multiline
                          rows={3}
                          placeholder="Your reply to the manager evaluation"
                          onSave={(v) => saveKra(k.id, { emp_remark: v })}
                        />
                      ) : (
                        text(k.emp_remark)
                      )}
                    </td>
                    <td className="border border-line">
                      {can.mgrRemark ? (
                        <Cell
                          value={k.mgr_remark ?? ""}
                          multiline
                          rows={3}
                          placeholder="Reply to the employee remark"
                          onSave={(v) => saveKra(k.id, { mgr_remark: v })}
                        />
                      ) : (
                        text(k.mgr_remark)
                      )}
                    </td>
                    {can.kra ? (
                      <td className="border border-line px-1 py-1.5 text-center">
                        <button
                          type="button"
                          className="text-[12px] text-soft hover:text-red"
                          title="Hide this KRA from the sheet (it stays in the history)"
                          onClick={() => saveKra(k.id, { removed_at: new Date().toISOString() })}
                        >
                          Remove
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
              {kras.length > 0 ? (
                <tr className="bg-cream text-[13px] font-bold">
                  <td className="border border-line" />
                  <td className="border border-line px-2 py-1.5" colSpan={2}>
                    Average
                  </td>
                  <td className="border border-line px-2 py-1.5">
                    {empAvg === null ? "—" : `${empAvg}%`}
                  </td>
                  <td className="border border-line px-2 py-1.5">
                    {mgrAvg === null ? "—" : `${mgrAvg}%`}
                  </td>
                  <td className="border border-line" colSpan={can.kra ? 5 : 4} />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
          {can.kra ? (
            <button
              type="button"
              className="btn3d btn3d-gold"
              disabled={writes.addKra.isPending}
              onClick={() =>
                writes.addKra.mutate(
                  {
                    orgId,
                    position: (data?.kras[data.kras.length - 1]?.position ?? 0) + 10,
                  },
                  { onError: fail },
                )
              }
            >
              + Add KRA
            </button>
          ) : null}
          <button
            type="button"
            className="btn3d"
            disabled={!unsaved}
            onClick={() => drafts.flushAll()}
          >
            Save
          </button>
          <span
            className={`text-[12px] ${unsaved ? "font-bold text-goldD" : "text-soft"}`}
            aria-live="polite"
          >
            {saving
              ? "Saving…"
              : dirtyCount > 0
                ? "Unsaved changes, saving in a moment…"
                : "All changes saved. Cells save by themselves as you type."}
          </span>
        </div>
      </section>

      {/* the step buttons */}
      <section className="ce-card space-y-3 p-4">
        <h2 className="font-display text-xl text-ink">Steps</h2>

        {viewer.self && stage === "self" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-soft">
              Fill your achievement and self evaluation for every KRA, then submit. Your manager is
              told and can then add their evaluation.
            </p>
            <button
              type="button"
              className="btn3d btn3d-gold"
              disabled={writes.submit.isPending || kras.length === 0}
              onClick={() => {
                drafts.flushAll();
                writes.submit.mutate(
                  { stage: "employee" },
                  { onError: fail, onSuccess: () => toast.success("Self evaluation submitted.") },
                );
              }}
            >
              Submit self evaluation
            </button>
          </div>
        ) : null}

        {viewer.reviewer && stage === "manager" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-soft">
              {firstName} has submitted. Add the manager achievement and evaluation, your overall
              feedback below, then submit with a recommendation. HR and Sir are told.
            </p>
            <select
              className="ce-input w-auto"
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value as ProbationDecision | "")}
            >
              <option value="">Recommendation…</option>
              {(Object.keys(DECISION_LABEL) as ProbationDecision[]).map((d) => (
                <option key={d} value={d}>
                  {DECISION_LABEL[d]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn3d btn3d-gold"
              disabled={writes.submit.isPending || !recommendation}
              onClick={() => {
                drafts.flushAll();
                writes.submit.mutate(
                  { stage: "manager", recommendation },
                  {
                    onError: fail,
                    onSuccess: () => toast.success("Manager evaluation submitted."),
                  },
                );
              }}
            >
              Submit manager evaluation
            </button>
          </div>
        ) : null}

        {stage === "self" && !viewer.self ? (
          <p className="text-sm text-soft">
            Waiting for {firstName} to submit their self evaluation.
          </p>
        ) : null}
        {stage === "manager" && viewer.self ? (
          <p className="text-sm text-soft">
            Submitted. Waiting for your manager's evaluation. You can still add remarks.
          </p>
        ) : null}
        {stage === "feedback" ? (
          <p className="text-sm text-soft">
            Manager evaluation submitted
            {review?.mgr_recommendation
              ? ` with the recommendation: ${DECISION_LABEL[review.mgr_recommendation as ProbationDecision]}`
              : ""}
            .{" "}
            {viewer.self ? "Waiting for HR and Sir." : "HR and Sir add their feedback and decide."}
          </p>
        ) : null}
        {stage === "final" && review?.final_decision ? (
          <p className="text-sm font-bold text-ink">
            Final decision: {DECISION_LABEL[review.final_decision as ProbationDecision]}
            {review.finalized_by ? ` · by ${names.get(review.finalized_by) ?? "HR"}` : ""}
            {review.finalized_at ? ` · ${niceDate(review.finalized_at.slice(0, 10))}` : ""}
          </p>
        ) : null}

        {viewer.hrOrAdmin && !viewer.self && stage !== "final" ? (
          <div className="space-y-3 border-t border-line pt-3">
            <div className="flex flex-wrap gap-2">
              {review?.emp_submitted_at ? (
                <button
                  type="button"
                  className="btn3d btn3d-ghost"
                  disabled={writes.reopen.isPending}
                  onClick={() =>
                    writes.reopen.mutate("employee", {
                      onError: fail,
                      onSuccess: () =>
                        toast.success(`${firstName} can edit their self evaluation again.`),
                    })
                  }
                >
                  Reopen self evaluation
                </button>
              ) : null}
              {review?.mgr_submitted_at ? (
                <button
                  type="button"
                  className="btn3d btn3d-ghost"
                  disabled={writes.reopen.isPending}
                  onClick={() =>
                    writes.reopen.mutate("manager", {
                      onError: fail,
                      onSuccess: () =>
                        toast.success("The manager can edit their evaluation again."),
                    })
                  }
                >
                  Reopen manager evaluation
                </button>
              ) : null}
            </div>

            {stage === "feedback" ? (
              <div className="flex flex-wrap items-end gap-3">
                <label>
                  <span className="ce-label">Final decision</span>
                  <select
                    className="ce-input"
                    value={decision}
                    onChange={(e) => setDecision(e.target.value as ProbationDecision | "")}
                  >
                    <option value="">Choose…</option>
                    {(Object.keys(DECISION_LABEL) as ProbationDecision[]).map((d) => (
                      <option key={d} value={d}>
                        {DECISION_LABEL[d]}
                      </option>
                    ))}
                  </select>
                </label>
                {decision === "extend" ? (
                  <label>
                    <span className="ce-label">By (months)</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      className="ce-input w-24"
                      value={months}
                      onChange={(e) =>
                        setMonths(Math.max(1, Math.min(12, Number(e.target.value) || 1)))
                      }
                    />
                  </label>
                ) : null}
                <label className="min-w-[220px] flex-1">
                  <span className="ce-label">Note (optional)</span>
                  <input
                    className="ce-input"
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn3d btn3d-gold"
                  disabled={!decision || writes.finalize.isPending}
                  onClick={() => {
                    if (!decision) return;
                    drafts.flushAll();
                    writes.finalize.mutate(
                      {
                        decision,
                        note: decisionNote,
                        ...(decision === "extend" ? { months } : {}),
                      },
                      {
                        onError: fail,
                        onSuccess: () =>
                          toast.success(
                            `Final decision saved. ${firstName} can now see the feedback.`,
                          ),
                      },
                    );
                  }}
                >
                  Save final decision
                </button>
              </div>
            ) : null}
            <p className="text-[12px] text-soft">
              The final decision locks the sheet and shows {firstName} the feedback from the
              manager, HR and Sir. Internal notes are never shown to them.
            </p>
          </div>
        ) : null}
      </section>

      {/* overall feedback */}
      <section className="ce-card space-y-3 p-4">
        <h2 className="font-display text-xl text-ink">Feedback</h2>
        {viewer.self && stage !== "final" ? (
          <p className="text-sm text-soft">
            The feedback from your manager, HR and Sir appears here once the final decision is made.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {(["manager", "hr", "sir"] as const).map((kind) => {
              const mine = myKinds.includes(kind);
              const fb = feedbackOf(kind);
              if (viewer.self && !fb) return null;
              return (
                <div key={kind} className="rounded-lg border border-line p-3">
                  <p className="text-[12px] font-bold tracking-[0.06em] text-soft uppercase">
                    {FEEDBACK_LABEL[kind]} feedback
                    {!viewer.self ? (
                      <span className="ml-1 font-normal normal-case">
                        (shown to {firstName} after the final decision)
                      </span>
                    ) : null}
                  </p>
                  {mine ? (
                    <Cell
                      value={fb}
                      multiline
                      rows={4}
                      placeholder={`${FEEDBACK_LABEL[kind]} feedback for ${firstName}`}
                      onSave={(v) =>
                        writes.saveFeedback.mutate({ orgId, kind, text: v }, { onError: fail })
                      }
                    />
                  ) : (
                    text(fb)
                  )}
                  {!viewer.self ? (
                    <>
                      <p className="mt-2 text-[12px] font-bold tracking-[0.06em] text-red uppercase">
                        Internal note
                        <span className="ml-1 font-normal text-soft normal-case">
                          (never shown to {firstName})
                        </span>
                      </p>
                      {mine ? (
                        <Cell
                          value={noteOf(kind)}
                          multiline
                          rows={2}
                          placeholder="Only managers, HR and Sir see this"
                          onSave={(v) =>
                            writes.saveNote.mutate({ orgId, kind, text: v }, { onError: fail })
                          }
                        />
                      ) : (
                        text(noteOf(kind))
                      )}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showHistory && (data?.log.length ?? 0) > 0 ? (
        <details className="ce-card p-4">
          <summary className="cursor-pointer font-display text-xl text-ink">
            History ({data?.log.length})
          </summary>
          <ul className="mt-3 space-y-1 text-[12px] text-soft">
            {data?.log.map((l) => (
              <li key={l.id}>
                <b className="text-ink">{l.actor ? (names.get(l.actor) ?? "Someone") : "System"}</b>{" "}
                · {new Date(l.created_at).toLocaleString("en-IN")} ·{" "}
                {l.entity.replace("probation_", "")} {l.action}:{" "}
                {Object.keys((l.changes as Record<string, unknown>) ?? {}).join(", ")}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </DraftsContext.Provider>
  );
}
