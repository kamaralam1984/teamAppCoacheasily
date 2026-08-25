import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { Celebrate } from "@/components/Celebrate";
import { WorkMeter } from "@/components/WorkMeter";
import { useAttendanceSummary } from "@/hooks/useAttendance";
import {
  LEAVE_TYPES,
  TYPE_LABEL,
  useApplyLeave,
  useLeaveBalances,
  useLeaveCheck,
  useMyLeave,
  type LeaveType,
} from "@/hooks/useLeave";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useWarriors } from "@/hooks/useWarriors";
import { useTasksInWindow } from "@/hooks/useTasks";
import { shortDate } from "@/lib/warriors";

export const Route = createFileRoute("/_authenticated/leave")({
  head: () => ({
    meta: [
      { title: "Leave | CoachEasily Team App" },
      {
        name: "description",
        content:
          "See what leave you have, apply in a few seconds and follow every request to its decision.",
      },
      { property: "og:title", content: "Leave | CoachEasily Team App" },
      {
        property: "og:description",
        content:
          "See what leave you have, apply in a few seconds and follow every request to its decision.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeavePage,
});

const IST = "Asia/Kolkata";

function todayIso() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-cream text-goldD border-gold/40",
  approved: "bg-emer/10 text-emer border-emer/30",
  rejected: "bg-red/10 text-red border-red/30",
};

function LeavePage() {
  const { data } = useMyProfile();
  const profile = data?.profile ?? null;

  const { data: summary } = useAttendanceSummary(profile ? undefined : null);
  const { data: balances } = useLeaveBalances(profile ? undefined : null);
  const { data: history } = useMyLeave(profile?.id ?? null);
  const { data: warriors } = useWarriors();
  const apply = useApplyLeave(profile?.id ?? null, profile?.org_id ?? null);

  const today = todayIso();
  const [type, setType] = useState<LeaveType>("casual");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [handover, setHandover] = useState("");
  const [handoverTasks, setHandoverTasks] = useState<string[]>([]);
  const [celebration, setCelebration] = useState<string | null>(null);

  const effectiveTo = halfDay ? from : to;
  const { data: windowTasks } = useTasksInWindow(profile?.id ?? null, from, effectiveTo);
  const check = useLeaveCheck({
    type,
    from,
    to: effectiveTo,
    halfDay,
    enabled: Boolean(profile && from && effectiveTo),
  });

  const errors = check.data?.errors ?? [];
  const warnings = type === "sick" ? [] : (check.data?.warnings ?? []);
  const days = check.data?.days ?? 0;
  const blocked = errors.length > 0 || check.isFetching || apply.isPending;

  const colleagues = useMemo(
    () =>
      (warriors ?? [])
        .filter((w) => w.status === "active" && w.id !== profile?.id)
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [warriors, profile?.id],
  );
  const nameOf = (id: string | null) =>
    id ? ((warriors ?? []).find((w) => w.id === id)?.full_name ?? null) : null;

  const plaques = (balances ?? []).filter(
    (b) => b.type !== "comp_off" || b.entitled > 0 || b.balance > 0,
  );

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (blocked) return;
    apply.mutate(
      {
        type,
        from_date: from,
        to_date: effectiveTo,
        half_day: halfDay,
        reason,
        handover_to: handover || null,
        handover_task_ids: handoverTasks,
      },
      {
        onSuccess: () => {
          setReason("");
          setHandover("");
          setHandoverTasks([]);
          setCelebration(
            `${TYPE_LABEL[type]} applied for ${shortDate(from)}. Your approver has been told.`,
          );
        },
      },
    );
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        {/* a) the work meter comes first — leave is earned by showing up */}
        <WorkMeter summary={summary} />

        {testingActive ? (
          <section className="ce-rise rounded-[14px] border border-gold/50 bg-cream p-4">
            <p className="text-sm leading-relaxed text-ink">
              Your balances were brought across from HR's leave tracker this week. Please
              check them against your own record — the entitlement, what you have used and
              what is left. If anything is different, tell HR before you rely on it.
            </p>
          </section>
        ) : null}



        {/* b) what you have this year */}
        <section className="ce-rise ce-card p-6" style={{ animationDelay: "80ms" }}>
          <h2 className="font-display text-2xl text-ink">What you have this year</h2>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {plaques.map((b) => (
              <div key={b.type} className="rounded-[14px] border border-line bg-cream/60 p-4">
                <p className="text-[11px] font-bold tracking-[0.12em] text-soft uppercase">
                  {TYPE_LABEL[b.type]?.replace(" leave", "") ?? b.type}
                </p>
                <p className="mt-1 flex items-baseline gap-1">
                  <span className="font-display text-4xl text-ink">{b.balance}</span>
                  <span className="text-[13px] font-semibold text-soft">/ {b.entitled}</span>
                </p>
                <p className="mt-1 text-[12px] text-soft">
                  Used {b.used} · Pending {b.pending}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12px] text-soft">
            Maternity leave (26 weeks, first two children) and leave without pay are applied for
            below — they are not yearly balances.
          </p>
        </section>

        {/* c) apply */}
        <section className="ce-rise ce-card p-6" style={{ animationDelay: "160ms" }}>
          <h2 className="font-display text-2xl text-ink">Apply for leave</h2>
          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
            <div>
              <label htmlFor="lv-type" className="ce-label">
                Type of leave
              </label>
              <select
                id="lv-type"
                className="ce-input"
                value={type}
                onChange={(e) => setType(e.target.value as LeaveType)}
              >
                {LEAVE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                    {t.note ? ` — ${t.note}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="lv-from" className="ce-label">
                  First day
                </label>
                <input
                  id="lv-from"
                  type="date"
                  className="ce-input"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    if (e.target.value > to) setTo(e.target.value);
                  }}
                />
              </div>
              <div>
                <label htmlFor="lv-to" className="ce-label">
                  Last day
                </label>
                <input
                  id="lv-to"
                  type="date"
                  className="ce-input"
                  value={effectiveTo}
                  disabled={halfDay}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>

            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-line accent-[var(--ce-saffBtn)]"
                checked={halfDay}
                onChange={(e) => setHalfDay(e.target.checked)}
              />
              Half day (counts as 0.5)
            </label>

            <div>
              <label htmlFor="lv-handover" className="ce-label">
                Hand over to
              </label>
              <select
                id="lv-handover"
                className="ce-input"
                value={handover}
                onChange={(e) => setHandover(e.target.value)}
              >
                <option value="">Nobody for now</option>
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[12px] text-soft">
                Once this leave is approved, the tasks you tick below move to them.
              </p>
              {windowTasks && windowTasks.length > 0 ? (
                <div className="mt-3 rounded-[12px] border border-line bg-pearl p-3.5">
                  <p className="text-[11px] font-bold tracking-wider text-goldD uppercase">
                    {windowTasks.length} task{windowTasks.length === 1 ? "" : "s"} fall in these
                    dates — tick what should move
                  </p>
                  <ul className="mt-2 space-y-2">
                    {windowTasks.map((t) => (
                      <li key={t.id}>
                        <label className="flex min-h-11 items-start gap-3 text-[13px] text-ink">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-5 w-5 shrink-0"
                            checked={handoverTasks.includes(t.id)}
                            onChange={(e) =>
                              setHandoverTasks((ids) =>
                                e.target.checked
                                  ? [...ids, t.id]
                                  : ids.filter((id) => id !== t.id),
                              )
                            }
                          />
                          <span>
                            <span className="font-semibold">{t.title}</span>
                            <span className="block text-[12px] text-soft">
                              {shortDate(t.due_date!)} · {t.slot}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="mt-2 text-[12px] font-bold text-goldD underline"
                    onClick={() =>
                      setHandoverTasks(
                        handoverTasks.length === windowTasks.length
                          ? []
                          : windowTasks.map((t) => t.id),
                      )
                    }
                  >
                    {handoverTasks.length === windowTasks.length ? "Clear all" : "Select all"}
                  </button>
                  {handover && handoverTasks.length === 0 ? (
                    <p className="mt-2 text-[12px] text-soft">
                      Nothing ticked — no tasks will move.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div>
              <label htmlFor="lv-reason" className="ce-label">
                Reason (optional)
              </label>
              <textarea
                id="lv-reason"
                className="ce-input min-h-24"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="A line is plenty."
              />
            </div>

            <p className="text-[13px] font-semibold text-ink">
              {days} day{days === 1 ? "" : "s"} requested
            </p>

            {errors.map((message) => (
              <p
                key={message}
                className="rounded-[10px] border border-red/30 bg-red/10 p-3 text-[13px] leading-relaxed font-semibold text-red"
              >
                {message}
              </p>
            ))}
            {warnings.map((message) => (
              <p
                key={message}
                className="rounded-[10px] border border-gold/40 bg-cream p-3 text-[13px] leading-relaxed font-semibold text-goldD"
              >
                {message}
              </p>
            ))}
            {type === "sick" ? (
              <p className="text-[12px] text-soft">
                Get well first. Sick leave has no notice rules here.
              </p>
            ) : null}

            {apply.isError ? (
              <p className="rounded-[10px] border border-red/30 bg-red/10 p-3 text-[13px] font-semibold text-red">
                {(apply.error as Error).message}
              </p>
            ) : null}

            <button type="submit" className="btn3d w-full sm:w-auto" disabled={blocked}>
              {apply.isPending ? "Sending…" : "Apply for leave"}
            </button>
          </form>
        </section>

        {/* d) history, newest first */}
        <section className="ce-rise ce-card p-6" style={{ animationDelay: "240ms" }}>
          <h2 className="font-display text-2xl text-ink">Your leave</h2>
          {history && history.length > 0 ? (
            <ul className="mt-4 divide-y divide-line">
              {history.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink">
                      {TYPE_LABEL[r.type] ?? r.type} · {r.days} day{r.days === 1 ? "" : "s"}
                    </p>
                    <p className="text-[13px] text-soft">
                      {shortDate(r.from_date)}
                      {r.from_date !== r.to_date ? ` → ${shortDate(r.to_date)}` : ""}
                      {r.half_day ? " · half day" : ""}
                      {nameOf(r.handover_to) ? ` · handover to ${nameOf(r.handover_to)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-bold tracking-[0.08em] uppercase ${STATUS_STYLE[r.status]}`}
                  >
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-soft">
              Nothing yet. When you apply, every request and its decision shows up here.
            </p>
          )}
        </section>
      </div>

      {celebration ? (
        <Celebrate message={celebration} onDone={() => setCelebration(null)} />
      ) : null}
    </AppShell>
  );
}
