import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Cell, DraftsContext } from "@/components/selfeval/AutoSaveCell";
import { FormUpload } from "@/components/selfeval/FormUpload";
import { ManagerEvaluation } from "@/components/selfeval/ManagerEvaluation";
import {
  openSelfEvalFile,
  useDevFileUrl,
  useSelfEval,
  useSelfEvalCycles,
  useSelfEvalCycleWrites,
  useSelfEvalList,
  useSelfEvalWrites,
  type SelfEvalFile,
  type SelfEvalReview,
} from "@/hooks/useSelfEvaluation";
import { useDeveloperAccess } from "@/hooks/useDeveloper";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useWarriors } from "@/hooks/useWarriors";
import type { Json } from "@/integrations/supabase/types";
import { niceDate } from "@/lib/calendar";
import { downloadBytes, MIME, safeFileName } from "@/lib/exporters";
import { buildManagerEvalPdf, buildSelfEvalPdf } from "@/lib/selfEvalPdf";
import { prettySize } from "@/lib/shrinkFile";
import {
  asManagerExtra,
  canWriteManagerEval,
  defaultYear,
  errorText,
  MAX_GOALS,
  mergeReadForm,
  POTENTIAL,
  POTENTIAL_LEVELS,
  progress,
  RATING_LABEL,
  RATING_MEANING,
  RATINGS,
  REFLECTION,
  stageOf,
  STAGE_LABEL,
  UPLOAD_ACCEPT,
  VALUES,
  type FormLike,
  type GoalAnswer,
  type ReadForm,
  type ReviewKind,
  type ReviewLike,
  type Stage,
} from "@/lib/selfEvaluation";

export const Route = createFileRoute("/_authenticated/self-evaluation")({
  head: () => ({
    meta: [
      { title: "Annual Self-Evaluation | CoachEasily Team App" },
      {
        name: "description",
        content:
          "The yearly self-evaluation form, with ratings and feedback from the manager, HR and admin.",
      },
    ],
  }),
  // ?year=2026&person=<profile id> opens that person's form (from notifications)
  validateSearch: (search: Record<string, unknown>): { year?: number; person?: string } => {
    const out: { year?: number; person?: string } = {};
    const y = Number(search["year"]);
    if (Number.isInteger(y) && y >= 2020 && y <= 2100) out.year = y;
    if (typeof search["person"] === "string") out.person = search["person"];
    return out;
  },
  component: SelfEvaluationPage,
});

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "self", label: "1 · Self-evaluation" },
  { stage: "manager", label: "2 · Manager rating" },
  { stage: "feedback", label: "3 · HR & admin rating" },
  { stage: "final", label: "4 · Final" },
];
const STAGE_ORDER: Stage[] = ["self", "manager", "feedback", "final"];

const fail = (err: unknown) => toast.error(errorText(err, "That didn't save. Please try again."));

function SelfEvaluationPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data: me } = useMyProfile();
  const viewer = me?.profile ?? null;
  const { data: warriors } = useWarriors();
  const isHrAdmin = viewer?.role === "hr" || viewer?.role === "admin";
  // developers (email allowlist, re-checked on the server) open, edit, upload and delete for everyone
  const { data: devAccess } = useDeveloperAccess(Boolean(viewer));
  const isDev = Boolean(devAccess?.isDeveloper);
  const devList = isDev && !isHrAdmin;

  const { data: cycles } = useSelfEvalCycles(Boolean(viewer));
  const year = search.year ?? defaultYear(cycles ?? [], new Date());
  const cycle = (cycles ?? []).find((c) => c.year === year) ?? null;
  const cycleOpen = Boolean(cycle?.opened_at && !cycle?.closed_at);
  const { data: list } = useSelfEvalList(year, Boolean(viewer), devList);

  // the team: only the people who report to the viewer directly (they see and rate those)
  const team = useMemo(
    () =>
      new Set(
        viewer
          ? (warriors ?? [])
              .filter((w) => w.manager_id === viewer.id && w.id !== viewer.id)
              .map((w) => w.id)
          : [],
      ),
    [warriors, viewer],
  );
  // the people whose form the viewer may open: themselves, their direct team, or everyone for
  // HR / admin (and developers)
  const people = useMemo(() => {
    if (!viewer) return [];
    const active = (warriors ?? []).filter((w) => w.status === "active");
    const mine =
      isHrAdmin || isDev ? active : active.filter((w) => w.id === viewer.id || team.has(w.id));
    const byId = new Map((list ?? []).map((r) => [r.profile_id, r]));
    return mine
      .map((w) => ({ id: w.id, name: w.full_name, row: byId.get(w.id) ?? null }))
      .sort((a, b) =>
        a.id === viewer.id ? -1 : b.id === viewer.id ? 1 : a.name.localeCompare(b.name),
      );
  }, [warriors, viewer, isHrAdmin, isDev, team, list]);

  const selectedId =
    (search.person && people.some((p) => p.id === search.person) ? search.person : null) ??
    viewer?.id ??
    null;
  const selected = people.find((p) => p.id === selectedId) ?? null;
  const showList = people.length > 1;
  const years = useMemo(() => {
    const ys = new Set<number>((cycles ?? []).map((c) => c.year));
    ys.add(new Date().getFullYear());
    ys.add(year);
    return [...ys].sort((a, b) => b - a);
  }, [cycles, year]);

  const go = (next: { year?: number; person?: string }) =>
    void navigate({ to: "/self-evaluation", search: { year, ...next } });

  return (
    <AppShell>
      <div className="space-y-5 py-2">
        <div className="ce-rise flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="font-display text-3xl text-ink">Annual Self-Evaluation</h1>
            <p className="mt-1 text-sm text-soft">
              For the year January {year} to December {year}. Your goals and values, rated by you,
              then by your manager, HR and admin.
            </p>
          </div>
          <label>
            <span className="ce-label">Year</span>
            <select
              className="ce-input w-auto"
              value={year}
              onChange={(e) =>
                go({
                  year: Number(e.target.value),
                  ...(search.person ? { person: search.person } : {}),
                })
              }
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isHrAdmin || isDev ? <CyclePanel year={year} cycle={cycle} viaDev={devList} /> : null}

        {!cycle?.opened_at && !isHrAdmin && !isDev ? (
          <div className="ce-card p-4 text-sm text-soft">
            The self-evaluation for {year} is not open yet. HR opens it and you will get a
            notification.
          </div>
        ) : null}

        {showList ? (
          <section className="ce-card overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="bg-cream text-[11px] font-bold tracking-[0.04em] text-soft uppercase">
                  <th className="px-4 py-2">Person</th>
                  <th className="px-4 py-2">Step</th>
                  <th className="px-4 py-2">Final rating</th>
                  <th className="px-4 py-2">Last change</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr
                    key={p.id}
                    className={`cursor-pointer border-t border-line hover:bg-gold/10 ${
                      p.id === selectedId ? "bg-gold/15" : ""
                    }`}
                    onClick={() => go({ person: p.id })}
                  >
                    <td className="px-4 py-2 font-bold text-ink">
                      {p.name}
                      {p.id === viewer?.id ? " (you)" : ""}
                    </td>
                    <td className="px-4 py-2">
                      {p.row ? STAGE_LABEL[stageOf(p.row)] : "Not started"}
                    </td>
                    <td className="px-4 py-2">{p.row?.final_rating ?? "—"}</td>
                    <td className="px-4 py-2 text-soft">
                      {p.row ? niceDate(p.row.updated_at.slice(0, 10)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {selected && viewer ? (
          <EvaluationSheet
            key={`${selected.id}-${year}`}
            personId={selected.id}
            personName={selected.name}
            year={year}
            cycleOpen={cycleOpen}
            self={selected.id === viewer.id}
            role={viewer.role}
            managesPerson={team.has(selected.id)}
            hrOrAdmin={isHrAdmin}
            isDev={isDev}
            personManagerId={(warriors ?? []).find((w) => w.id === selected.id)?.manager_id ?? null}
            names={new Map((warriors ?? []).map((w) => [w.id, w.full_name]))}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

function CyclePanel({
  year,
  cycle,
  viaDev,
}: {
  year: number;
  viaDev: boolean;
  cycle: { opened_at: string | null; closed_at: string | null; due_date: string | null } | null;
}) {
  const writes = useSelfEvalCycleWrites(viaDev);
  const [due, setDue] = useState(cycle?.due_date ?? "");
  useEffect(() => setDue(cycle?.due_date ?? ""), [cycle?.due_date]);
  const open = Boolean(cycle?.opened_at && !cycle?.closed_at);
  return (
    <section className="ce-card flex flex-wrap items-end gap-3 p-4">
      <div className="mr-auto">
        <p className="text-[12px] font-bold tracking-[0.06em] text-soft uppercase">
          HR · {year} cycle
        </p>
        <p className="text-sm text-ink">
          {open
            ? `Open${cycle?.due_date ? `, last date ${niceDate(cycle.due_date)}` : ""}. Everyone can fill their form.`
            : cycle?.closed_at
              ? "Closed. Nobody can fill or submit until you open it again."
              : "Not open yet. Opening it tells everyone active to fill their form."}
        </p>
      </div>
      <label>
        <span className="ce-label">Last date</span>
        <input
          type="date"
          className="ce-input"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn3d btn3d-gold"
        disabled={writes.open.isPending}
        onClick={() =>
          writes.open.mutate(
            { year, due: due || null },
            {
              onError: fail,
              onSuccess: () =>
                toast.success(open ? "Last date saved." : `Self-evaluation ${year} is open.`),
            },
          )
        }
      >
        {open ? "Save last date" : cycle?.closed_at ? "Open again" : `Open ${year}`}
      </button>
      {open ? (
        <button
          type="button"
          className="btn3d btn3d-ghost"
          disabled={writes.close.isPending}
          onClick={() =>
            writes.close.mutate(year, {
              onError: fail,
              onSuccess: () => toast.success(`Self-evaluation ${year} is closed.`),
            })
          }
        >
          Close
        </button>
      ) : null}
    </section>
  );
}

function asForm(
  row: {
    role_team: string;
    manager_name: string;
    review_period: string;
    goals: Json;
    value_answers: Json;
    reflection: Json;
    potential: Json;
  } | null,
): FormLike {
  const obj = (j: Json) => (j && typeof j === "object" && !Array.isArray(j) ? j : {});
  return {
    role_team: row?.role_team ?? "",
    manager_name: row?.manager_name ?? "",
    review_period: row?.review_period ?? "",
    goals: (Array.isArray(row?.goals) ? row!.goals : []) as GoalAnswer[],
    value_answers: obj(row?.value_answers ?? {}) as FormLike["value_answers"],
    reflection: obj(row?.reflection ?? {}) as FormLike["reflection"],
    potential: obj(row?.potential ?? {}) as FormLike["potential"],
  };
}

function asReview(r: SelfEvalReview): ReviewLike {
  const obj = (j: Json) =>
    (j && typeof j === "object" && !Array.isArray(j) ? j : {}) as ReviewLike["goal_ratings"];
  return {
    kind: r.kind,
    goal_ratings: obj(r.goal_ratings),
    value_ratings: obj(r.value_ratings),
    overall_rating: r.overall_rating,
    feedback: r.feedback,
  };
}

function EvaluationSheet({
  personId,
  personName,
  year,
  cycleOpen,
  self,
  role,
  managesPerson,
  hrOrAdmin,
  isDev,
  personManagerId,
  names,
}: {
  personId: string;
  personName: string;
  year: number;
  cycleOpen: boolean;
  self: boolean;
  role: string;
  managesPerson: boolean;
  hrOrAdmin: boolean;
  isDev: boolean;
  personManagerId: string | null;
  names: Map<string, string>;
}) {
  // a developer on someone else's form: reads (when not their manager / HR) and every write of
  // the answers and files go through the gated developer route
  const viaDevRead = isDev && !self && !(hrOrAdmin || managesPerson);
  const devWrite = isDev && !self;
  const { data, isLoading, error } = useSelfEval(personId, year, viaDevRead);
  const writes = useSelfEvalWrites(personId, year, devWrite);
  const devUrl = useDevFileUrl();
  const open = (f: SelfEvalFile) => openFile(f, devWrite ? devUrl : undefined);
  const row = data?.form ?? null;
  const stage = stageOf(row);
  const form = asForm(row);
  const firstName = personName.split(" ")[0] ?? personName;
  const reviewer = !self && (hrOrAdmin || managesPerson);
  const canFill =
    (stage === "self" && ((self && cycleOpen) || (!self && hrOrAdmin))) ||
    (devWrite && stage !== "final");
  const canUpload = stage !== "final" && (self || hrOrAdmin || devWrite);
  // the manager evaluation: written by the direct manager (HR / admin only for someone with no
  // manager); seen by them, HR, admin and developers, and by the person once it is signed off
  const reviewRow = (data?.reviews ?? []).find((r) => r.kind === "manager") ?? null;
  const managerReview = reviewRow ? asReview(reviewRow) : null;
  const managerExtra = asManagerExtra(reviewRow?.extra);
  const canManager = canWriteManagerEval({
    self,
    directManager: managesPerson,
    hrOrAdmin,
    personHasManager: Boolean(personManagerId),
    steps: row,
  });
  const showManager = stage !== "self" && (reviewer || viaDevRead || (self && stage === "final"));
  const reviewerName =
    (personManagerId ? names.get(personManagerId) : null) ?? form.manager_name ?? "";
  const [extraGoal, setExtraGoal] = useState(false);
  const goalRows = Math.min(10, Math.max(extraGoal ? MAX_GOALS : 4, form.goals.length));

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
    writes.save.isPending ||
    writes.reviewSave.isPending ||
    writes.managerSave.isPending ||
    writes.memberComment.isPending;
  const unsaved = dirtyCount > 0 || saving;

  // the person's own form is made (About you from the profile) the first time they open it
  const started = useRef(false);
  useEffect(() => {
    if (!self || !cycleOpen || isLoading || row || started.current) return;
    started.current = true;
    writes.start.mutate(undefined, { onError: fail });
  }, [self, cycleOpen, isLoading, row, writes.start]);

  const save = (
    section: "about" | "goals" | "values" | "reflection" | "potential",
    path: string[],
    value: string,
  ) => writes.save.mutate({ section, path, value }, { onError: fail });
  const rate = (kind: ReviewKind, path: string[], value: string) =>
    writes.reviewSave.mutate({ kind, path, value }, { onError: fail });

  const [applying, setApplying] = useState(false);
  async function applyRead(read: ReadForm, mode: "empty" | "replace") {
    drafts.flushAll();
    const next = mergeReadForm(form, read, mode);
    setApplying(true);
    try {
      const calls: Promise<unknown>[] = [];
      for (const k of ["role_team", "manager_name", "review_period"] as const) {
        if (next[k] !== (form[k] ?? "")) {
          calls.push(writes.save.mutateAsync({ section: "about", path: [k], value: next[k] }));
        }
      }
      // one part at a time, in order, so the parts don't overwrite each other
      for (const c of calls) await c;
      await writes.save.mutateAsync({ section: "goals", path: [], value: next.goals as Json });
      await writes.save.mutateAsync({
        section: "values",
        path: [],
        value: next.value_answers as Json,
      });
      await writes.save.mutateAsync({
        section: "reflection",
        path: [],
        value: next.reflection as Json,
      });
      await writes.save.mutateAsync({
        section: "potential",
        path: [],
        value: next.potential as Json,
      });
      toast.success("The form is filled from your upload. Check every box before you submit.");
    } catch (e) {
      fail(e);
    } finally {
      setApplying(false);
    }
  }

  async function downloadPdf() {
    drafts.flushAll();
    try {
      const bytes = await buildSelfEvalPdf({
        year,
        name: personName,
        form,
        signedName: row?.signed_name ?? null,
        signedAt: row?.signed_at ?? null,
        submittedAt: row?.emp_submitted_at ?? null,
        reviews: [],
        finalRating: row?.final_rating ?? null,
      });
      downloadBytes(
        safeFileName(`${personName} Annual Self-Evaluation ${year}`, "pdf"),
        bytes,
        MIME.pdf,
      );
      toast.success("PDF downloaded.");
    } catch (e) {
      fail(e);
    }
  }

  async function downloadManagerPdf() {
    drafts.flushAll();
    try {
      const bytes = await buildManagerEvalPdf({
        year,
        personName,
        roleTeam: form.role_team ?? "",
        reviewPeriod: form.review_period ?? "",
        reviewerName,
        receivedOn: row?.emp_submitted_at ?? null,
        completedOn: row?.finalized_at ?? null,
        form,
        review: managerReview,
        extra: managerExtra,
        memberComment: row?.member_comment ?? "",
      });
      downloadBytes(
        safeFileName(`${personName} Annual Manager Evaluation ${year}`, "pdf"),
        bytes,
        MIME.pdf,
      );
      toast.success("PDF downloaded.");
    } catch (e) {
      fail(e);
    }
  }

  if (error) {
    return (
      <div className="ce-card p-6 text-sm text-red">
        Couldn't load this self-evaluation: {errorText(error, "please try again.")}
      </div>
    );
  }
  if (isLoading) return <div className="ce-card p-6 text-sm text-soft">Loading…</div>;
  if (!row && !canFill) {
    return (
      <div className="ce-card p-6 text-sm text-soft">
        {self
          ? `Your self-evaluation for ${year} is not open.`
          : `${firstName} has not started the self-evaluation for ${year}.`}
      </div>
    );
  }

  const [done, of] = progress(form);
  const files = data?.files ?? [];
  const ro = (v: string | undefined | null) => (
    <div className="px-2 py-1.5 text-[13px] whitespace-pre-wrap text-ink">{v || "—"}</div>
  );
  const ratingSelect = (
    value: string | undefined,
    onChange: (v: string) => void,
    options: readonly string[] = RATINGS,
  ) => (
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
  );
  const th = "border border-line bg-gold/40 px-2 py-2";

  return (
    <DraftsContext.Provider value={drafts}>
      <section className="ce-card overflow-hidden">
        <div className="bg-night px-4 py-3 text-center text-white">
          <p className="font-display text-xl">Annual Self-Evaluation Form — {personName}</p>
          <p className="text-[12px] font-bold tracking-[0.08em] text-goldL uppercase">
            January {year} to December {year} · {STAGE_LABEL[stage]}
          </p>
        </div>
        <ol className="flex flex-wrap gap-2 border-b border-line bg-cream px-4 py-3">
          {STEPS.map((s) => {
            const isDone =
              STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf(s.stage) || stage === "final";
            const now = s.stage === stage && stage !== "final";
            return (
              <li
                key={s.stage}
                className={`rounded-full px-3 py-1 text-[12px] font-bold ${
                  isDone
                    ? "bg-emer/15 text-ink"
                    : now
                      ? "bg-gold/40 text-ink"
                      : "bg-white text-soft"
                }`}
              >
                {isDone ? "✓ " : ""}
                {s.label}
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          <span className="mr-auto text-[12px] text-soft">
            {done} of {of} boxes filled
          </span>
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
                ? "Unsaved, saving in a moment…"
                : "All changes saved."}
          </span>
          <button type="button" className="btn3d btn3d-gold" onClick={() => void downloadPdf()}>
            <Download className="mr-1 inline h-4 w-4" />
            PDF
          </button>
        </div>
      </section>

      {canUpload ? (
        <FormUpload
          canFill={canFill}
          uploading={writes.upload.isPending}
          applying={applying}
          onUpload={(file) => writes.upload.mutateAsync({ file, kind: "form" })}
          onApply={applyRead}
        />
      ) : null}
      <FileList
        title="Uploaded forms and files"
        files={files.filter((f) => f.kind !== "evidence")}
        canRemove={canUpload}
        onRemove={(id) => writes.removeFile.mutate(id, { onError: fail })}
        onOpen={open}
        names={names}
      />

      {/* About you */}
      <section className="ce-card overflow-x-auto p-4">
        <h2 className="mb-2 font-display text-xl text-ink">About you</h2>
        <table className="w-full min-w-[480px] border-collapse text-left">
          <tbody className="text-[13px]">
            <tr>
              <th className={`${th} w-48`}>Name</th>
              <td className="border border-line">{ro(personName)}</td>
            </tr>
            {(
              [
                ["role_team", "Role / team"],
                ["manager_name", "Manager"],
                ["review_period", "Review period"],
              ] as const
            ).map(([k, label]) => (
              <tr key={k}>
                <th className={th}>{label}</th>
                <td className="border border-line">
                  {canFill ? (
                    <Cell value={form[k] ?? ""} onSave={(v) => save("about", [k], v)} />
                  ) : (
                    ro(form[k])
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <th className={th}>Date completed</th>
              <td className="border border-line">
                {ro(row?.emp_submitted_at ? niceDate(row.emp_submitted_at.slice(0, 10)) : "")}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* How this form works */}
      <details className="ce-card p-4">
        <summary className="cursor-pointer font-display text-xl text-ink">
          How this form works
        </summary>
        <p className="mt-2 text-sm text-soft">
          Your appraisal has two equal parts: <b>A. Goals and Impact (50%)</b>, the 4–5 goals agreed
          with your manager and the outcomes you delivered, and{" "}
          <b>B. Competencies and Values (50%)</b>, how you delivered. Rate yourself on evidence, not
          on effort or hours worked, and be specific: give a number, a date, or a client or learner
          outcome. Make every target measurable, e.g. “Convert 15 leads a month”.
        </p>
        <table className="mt-3 w-full border-collapse text-left text-[13px]">
          <tbody>
            {RATINGS.map((r) => (
              <tr key={r}>
                <th className={`${th} w-72`}>{RATING_LABEL[r]}</th>
                <td className="border border-line px-2 py-1.5">{RATING_MEANING[r]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {/* Part A */}
      <section className="ce-card overflow-hidden">
        <div className="p-4 pb-2">
          <h2 className="font-display text-xl text-ink">Part A: Goals and Impact (50%)</h2>
          <p className="text-sm text-soft">
            List the 4–5 goals you agreed with your manager and rate each on the outcome delivered,
            not on the effort.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left">
            <thead>
              <tr className="text-[11px] font-bold tracking-[0.04em] text-ink uppercase">
                <th className={`${th} w-10 text-center`}>#</th>
                <th className={`${th} min-w-[200px]`}>Goal and the company priority it supports</th>
                <th className={`${th} min-w-[150px]`}>Target / measure</th>
                <th className={`${th} min-w-[180px]`}>Result achieved</th>
                <th className={`${th} min-w-[240px]`}>Evidence (numbers, links, feedback)</th>
                <th className={`${th} w-28`}>Self-rating</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: goalRows }, (_, i) => {
                const g = form.goals[i] ?? {};
                const ev = files.filter((f) => f.kind === "evidence" && f.goal_index === i);
                return (
                  <tr key={i} className="align-top">
                    <td className="border border-line px-2 py-1.5 text-center text-[13px]">
                      {i + 1}
                    </td>
                    {(["goal", "target", "result"] as const).map((k) => (
                      <td key={k} className="border border-line">
                        {canFill ? (
                          <Cell
                            value={g[k] ?? ""}
                            multiline
                            rows={3}
                            onSave={(v) => save("goals", [String(i), k], v)}
                          />
                        ) : (
                          ro(g[k])
                        )}
                      </td>
                    ))}
                    <td className="border border-line">
                      {canFill ? (
                        <Cell
                          value={g.evidence ?? ""}
                          multiline
                          rows={3}
                          onSave={(v) => save("goals", [String(i), "evidence"], v)}
                        />
                      ) : (
                        ro(g.evidence)
                      )}
                      <EvidenceFiles
                        files={ev}
                        canAdd={canFill || (canUpload && !self)}
                        canRemove={canUpload}
                        uploading={writes.upload.isPending}
                        onAdd={(file) =>
                          writes.upload.mutate(
                            { file, kind: "evidence", goalIndex: i },
                            {
                              onError: fail,
                              onSuccess: () => toast.success(`${file.name} attached.`),
                            },
                          )
                        }
                        onRemove={(id) => writes.removeFile.mutate(id, { onError: fail })}
                        onOpen={open}
                      />
                    </td>
                    <td className="border border-line p-1">
                      {canFill
                        ? ratingSelect(g.rating, (v) => save("goals", [String(i), "rating"], v))
                        : ro(g.rating)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {canFill && goalRows < MAX_GOALS ? (
          <div className="border-t border-line p-3">
            <button type="button" className="btn3d btn3d-gold" onClick={() => setExtraGoal(true)}>
              + Add goal {goalRows + 1}
            </button>
          </div>
        ) : null}
      </section>

      {/* Part B */}
      <section className="ce-card overflow-hidden">
        <div className="p-4 pb-2">
          <h2 className="font-display text-xl text-ink">Part B: Competencies and Values (50%)</h2>
          <p className="text-sm text-soft">
            For each value, read what it looks like in practice, rate yourself, and give one real
            example from this year: what happened, what you did and what changed.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="text-[11px] font-bold tracking-[0.04em] text-ink uppercase">
                <th className={`${th} w-36`}>Value</th>
                <th className={`${th} w-64`}>What it looks like in practice</th>
                <th className={`${th} min-w-[320px]`}>Your example from this year</th>
                <th className={`${th} w-28`}>Self-rating</th>
              </tr>
            </thead>
            <tbody>
              {VALUES.map((v) => {
                const a = form.value_answers[v.key] ?? {};
                return (
                  <tr key={v.key} className="align-top">
                    <td className="border border-line px-2 py-1.5 text-[13px] font-bold text-ink">
                      {v.name}
                    </td>
                    <td className="border border-line px-2 py-1.5 text-[13px] text-soft">
                      {v.practice}
                    </td>
                    <td className="border border-line">
                      {canFill ? (
                        <Cell
                          value={a.example ?? ""}
                          multiline
                          rows={3}
                          onSave={(x) => save("values", [v.key, "example"], x)}
                        />
                      ) : (
                        ro(a.example)
                      )}
                    </td>
                    <td className="border border-line p-1">
                      {canFill
                        ? ratingSelect(a.rating, (x) => save("values", [v.key, "rating"], x))
                        : ro(a.rating)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Part C */}
      <section className="ce-card overflow-x-auto p-4">
        <h2 className="font-display text-xl text-ink">Part C: Reflection</h2>
        <p className="mb-2 text-sm text-soft">Answer each question in two or three sentences.</p>
        <table className="w-full min-w-[600px] border-collapse text-left">
          <tbody>
            {REFLECTION.map((q) => (
              <tr key={q.key} className="align-top">
                <th className={`${th} w-80 text-[13px] font-bold normal-case`}>{q.question}</th>
                <td className="border border-line">
                  {canFill ? (
                    <Cell
                      value={form.reflection[q.key] ?? ""}
                      multiline
                      rows={4}
                      onSave={(v) => save("reflection", [q.key], v)}
                    />
                  ) : (
                    ro(form.reflection[q.key])
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Part D */}
      <section className="ce-card overflow-x-auto p-4">
        <h2 className="mb-2 font-display text-xl text-ink">
          Part D: Potential, Growth and Next Year
        </h2>
        <table className="w-full min-w-[700px] border-collapse text-left">
          <thead>
            <tr className="text-[11px] font-bold tracking-[0.04em] text-ink uppercase">
              <th className={`${th} w-72`}>Potential question</th>
              <th className={`${th} w-40`}>Your rating (Low / Moderate / High)</th>
              <th className={th}>Why</th>
            </tr>
          </thead>
          <tbody>
            {POTENTIAL.map((q) => {
              const a = form.potential[q.key] ?? {};
              return (
                <tr key={q.key} className="align-top">
                  <td className="border border-line px-2 py-1.5 text-[13px] font-bold text-ink">
                    {q.question}
                  </td>
                  <td className="border border-line p-1">
                    {canFill
                      ? ratingSelect(
                          a.rating,
                          (v) => save("potential", [q.key, "rating"], v),
                          POTENTIAL_LEVELS,
                        )
                      : ro(a.rating)}
                  </td>
                  <td className="border border-line">
                    {canFill ? (
                      <Cell
                        value={a.why ?? ""}
                        multiline
                        rows={3}
                        onSave={(v) => save("potential", [q.key, "why"], v)}
                      />
                    ) : (
                      ro(a.why)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Sign-off and steps */}
      <Steps
        stage={stage}
        self={self}
        reviewer={reviewer}
        hrOrAdmin={hrOrAdmin}
        managesPerson={managesPerson}
        cycleOpen={cycleOpen}
        firstName={firstName}
        personName={personName}
        signedName={row?.signed_name ?? null}
        signedAt={row?.signed_at ?? null}
        finalRating={row?.final_rating ?? null}
        finalizedBy={row?.finalized_by ? (names.get(row.finalized_by) ?? "HR") : null}
        writes={writes}
        flush={() => drafts.flushAll()}
      />

      {/* the manager evaluation, as the Annual Manager Evaluation Form */}
      {showManager ? (
        <ManagerEvaluation
          year={year}
          personName={personName}
          roleTeam={form.role_team ?? ""}
          reviewPeriod={form.review_period ?? ""}
          reviewerName={reviewerName}
          receivedOn={row?.emp_submitted_at ?? null}
          completedOn={row?.finalized_at ?? null}
          form={form}
          review={managerReview}
          extra={managerExtra}
          canWrite={canManager}
          self={self}
          complete={stage === "final"}
          memberComment={row?.member_comment ?? ""}
          onRate={(path, value) => rate("manager", path, value)}
          onSave={(path, value) => writes.managerSave.mutate({ path, value }, { onError: fail })}
          onMemberComment={(text) => writes.memberComment.mutate(text, { onError: fail })}
          onSignOff={(name) => {
            drafts.flushAll();
            writes.submit.mutate(
              { stage: "manager", signedName: name },
              {
                onError: fail,
                onSuccess: () =>
                  toast.success(`Signed off. ${firstName} can now see the manager evaluation.`),
              },
            );
          }}
          signingOff={writes.submit.isPending}
          onPdf={() => void downloadManagerPdf()}
        />
      ) : self && stage !== "self" ? (
        <section className="ce-card p-4 text-sm text-soft">
          Your manager's evaluation appears here once they have signed it off.
        </section>
      ) : null}

      {(hrOrAdmin || isDev) && (data?.log.length ?? 0) > 0 ? (
        <details className="ce-card p-4">
          <summary className="cursor-pointer font-display text-xl text-ink">
            History ({data?.log.length})
          </summary>
          <ul className="mt-3 space-y-1 text-[12px] text-soft">
            {data?.log.map((l) => {
              const c = (l.changes ?? {}) as Record<string, unknown>;
              const where = [
                c["section"],
                Array.isArray(c["path"]) ? (c["path"] as string[]).join(" › ") : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <li key={l.id}>
                  <b className="text-ink">
                    {l.actor ? (names.get(l.actor) ?? "Someone") : "System"}
                  </b>{" "}
                  · {new Date(l.created_at).toLocaleString("en-IN")} · {l.entity.replace("_", " ")}{" "}
                  {l.action}
                  {where ? `: ${where}` : ""}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </DraftsContext.Provider>
  );
}

function Steps({
  stage,
  self,
  reviewer,
  hrOrAdmin,
  managesPerson,
  cycleOpen,
  firstName,
  personName,
  signedName,
  signedAt,
  finalRating,
  finalizedBy,
  writes,
  flush,
}: {
  stage: Stage;
  self: boolean;
  reviewer: boolean;
  hrOrAdmin: boolean;
  managesPerson: boolean;
  cycleOpen: boolean;
  firstName: string;
  personName: string;
  signedName: string | null;
  signedAt: string | null;
  finalRating: string | null;
  finalizedBy: string | null;
  writes: ReturnType<typeof useSelfEvalWrites>;
  flush: () => void;
}) {
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [final, setFinal] = useState("");
  return (
    <section className="ce-card space-y-3 p-4">
      <h2 className="font-display text-xl text-ink">Sign-off</h2>
      {signedName ? (
        <p className="text-sm text-ink">
          Signed by <b>{signedName}</b>
          {signedAt ? ` on ${niceDate(signedAt.slice(0, 10))}` : ""}: “I confirm that the evidence
          above is accurate.”
        </p>
      ) : null}

      {self && stage === "self" ? (
        cycleOpen ? (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />
              By signing, I confirm that the evidence above is accurate.
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <label>
                <span className="ce-label">Type your full name to sign</span>
                <input
                  className="ce-input"
                  value={name}
                  placeholder={personName}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn3d btn3d-gold"
                disabled={!confirm || name.trim().length < 2 || writes.submit.isPending}
                onClick={() => {
                  flush();
                  writes.submit.mutate(
                    { stage: "employee", signedName: name.trim() },
                    {
                      onError: fail,
                      onSuccess: () =>
                        toast.success("Self-evaluation submitted. Your manager is told."),
                    },
                  );
                }}
              >
                Submit self-evaluation
              </button>
            </div>
            <p className="text-[12px] text-soft">
              After you submit, the form is locked. HR can reopen it.
            </p>
          </div>
        ) : (
          <p className="text-sm text-soft">
            The self-evaluation is closed, so it can't be submitted now.
          </p>
        )
      ) : null}

      {stage === "self" && !self ? (
        <p className="text-sm text-soft">Waiting for {firstName} to fill and submit the form.</p>
      ) : null}
      {stage === "manager" && self ? (
        <p className="text-sm text-soft">Submitted. Waiting for your manager's evaluation.</p>
      ) : null}
      {stage === "manager" && reviewer ? (
        <p className="text-sm text-soft">
          {firstName} has submitted. The manager evaluation is below.
        </p>
      ) : null}
      {stage === "final" ? (
        <p className="text-sm font-bold text-ink">
          Final rating: {finalRating ? RATING_LABEL[finalRating as keyof typeof RATING_LABEL] : "—"}
          {finalizedBy ? ` · signed off by ${finalizedBy}` : ""}
        </p>
      ) : null}

      {hrOrAdmin && !self && stage !== "self" ? (
        <div className="space-y-3 border-t border-line pt-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn3d btn3d-ghost"
              disabled={writes.reopen.isPending}
              onClick={() =>
                writes.reopen.mutate("employee", {
                  onError: fail,
                  onSuccess: () => toast.success(`${firstName} can edit the form again.`),
                })
              }
            >
              Reopen self-evaluation
            </button>
            {stage === "final" || stage === "feedback" ? (
              <button
                type="button"
                className="btn3d btn3d-ghost"
                disabled={writes.reopen.isPending}
                onClick={() =>
                  writes.reopen.mutate("manager", {
                    onError: fail,
                    onSuccess: () =>
                      toast.success("The manager can edit and sign off their evaluation again."),
                  })
                }
              >
                Reopen manager evaluation
              </button>
            ) : null}
          </div>
          <p className="text-[12px] text-soft">
            Reopening the self-evaluation also reopens the manager evaluation.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function openFile(f: SelfEvalFile, devUrl?: (path: string) => Promise<string>) {
  // open the tab first, so the browser does not block it as a pop-up
  const tab = window.open("", "_blank");
  void openSelfEvalFile(f, tab, devUrl).catch((e) => {
    tab?.close();
    fail(e);
  });
}

function EvidenceFiles({
  files,
  canAdd,
  canRemove,
  uploading,
  onAdd,
  onRemove,
  onOpen,
}: {
  onOpen: (f: SelfEvalFile) => void;
  files: SelfEvalFile[];
  canAdd: boolean;
  canRemove: boolean;
  uploading: boolean;
  onAdd: (file: File) => void;
  onRemove: (id: string) => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  if (!canAdd && files.length === 0) return null;
  return (
    <div className="space-y-1 px-2 pb-2">
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-1 text-[12px]">
          <Paperclip className="h-3 w-3 shrink-0 text-soft" />
          <button
            type="button"
            className="truncate text-left text-goldD underline"
            onClick={() => onOpen(f)}
          >
            {f.file_name}
          </button>
          {canRemove ? (
            <button
              type="button"
              title="Delete from the form (a copy is kept in the history)"
              className="text-soft hover:text-red"
              onClick={() => onRemove(f.id)}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ))}
      {canAdd ? (
        <>
          <input
            ref={input}
            type="file"
            accept={UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onAdd(file);
            }}
          />
          <button
            type="button"
            className="text-[12px] font-bold text-goldD hover:underline"
            disabled={uploading}
            onClick={() => input.current?.click()}
          >
            <Paperclip className="mr-1 inline h-3 w-3" />
            {uploading ? "Uploading…" : "Attach evidence"}
          </button>
        </>
      ) : null}
    </div>
  );
}

function FileList({
  title,
  files,
  canRemove,
  onRemove,
  onOpen,
  names,
}: {
  onOpen: (f: SelfEvalFile) => void;
  title: string;
  files: SelfEvalFile[];
  canRemove: boolean;
  onRemove: (id: string) => void;
  names: Map<string, string>;
}) {
  if (files.length === 0) return null;
  return (
    <section className="ce-card p-4">
      <h2 className="mb-2 font-display text-lg text-ink">{title}</h2>
      <ul className="space-y-1 text-[13px]">
        {files.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2">
            <Paperclip className="h-4 w-4 text-soft" />
            <button type="button" className="text-goldD underline" onClick={() => onOpen(f)}>
              {f.file_name}
            </button>
            <span className="text-[12px] text-soft">
              {f.original_size && f.original_size > f.size_bytes
                ? `${prettySize(f.original_size)} → saved as ${prettySize(f.size_bytes)}`
                : prettySize(f.size_bytes)}{" "}
              · {f.uploaded_by ? (names.get(f.uploaded_by) ?? "") : ""} ·{" "}
              {new Date(f.created_at).toLocaleDateString("en-IN")}
            </span>
            {canRemove ? (
              <button
                type="button"
                className="text-[12px] text-soft hover:text-red"
                onClick={() => onRemove(f.id)}
              >
                Delete
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
