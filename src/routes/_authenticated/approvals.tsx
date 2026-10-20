import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { HelpLink } from "@/components/help/HelpLink";
import {
  TYPE_LABEL,
  useDecideLeave,
  useLeaveBalances,
  usePendingApprovals,
  type PendingRequest,
} from "@/hooks/useLeave";
import { useHostConflicts } from "@/hooks/useCalendar";
import { useTasksByIds } from "@/hooks/useTasks";
import { useWarriors } from "@/hooks/useWarriors";
import { useMyProfile } from "@/hooks/useMyProfile";
import { rangeLabel } from "@/lib/calendar";
import { roleLabel, shortDate } from "@/lib/warriors";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals | CoachEasily Team App" },
      {
        name: "description",
        content: "Review leave requests from your line with the full balance context.",
      },
      { property: "og:title", content: "Approvals | CoachEasily Team App" },
      {
        property: "og:description",
        content: "Review leave requests from your line with the full balance context.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Approvals,
});

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function BalanceContext({ profileId, type }: { profileId: string; type: string }) {
  const { data } = useLeaveBalances(profileId);
  const row = (data ?? []).find((b) => b.type === type);
  if (!data) return <p className="text-[12px] text-soft">Loading balance…</p>;
  if (!row) {
    return (
      <p className="text-[12px] text-soft">
        {TYPE_LABEL[type] ?? type} isn't a yearly balance — it is granted, not deducted.
      </p>
    );
  }
  return (
    <p className="text-[12px] text-soft">
      {TYPE_LABEL[type] ?? type} left after this: <strong className="text-ink">{row.balance}</strong>{" "}
      of {row.entitled} · used {row.used} · pending {row.pending}
    </p>
  );
}

function HostWarning({ request }: { request: PendingRequest }) {
  const { data } = useHostConflicts(request.profile_id, request.from_date, request.to_date);
  if (!data || data.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      {data.map((c) => (
        <p
          key={c.program_id}
          className="rounded-lg border border-red/30 bg-red/10 p-3 text-[13px] leading-relaxed font-semibold text-red"
        >
          ⚠️ Approving this leaves {c.name} without a host on{" "}
          {rangeLabel(c.overlap_from, c.overlap_to)}.
        </p>
      ))}
    </div>
  );
}

function HandoverPreview({ request }: { request: PendingRequest }) {
  const ids = request.handover_task_ids ?? [];
  const { data: tasks } = useTasksByIds(ids);
  const { data: warriors } = useWarriors();
  if (!request.handover_to) return null;
  const to = (warriors ?? []).find((w) => w.id === request.handover_to)?.full_name ?? "a teammate";

  return (
    <div className="mt-3 rounded-[12px] border border-line bg-pearl p-3.5">
      <p className="text-[11px] font-bold tracking-wider text-goldD uppercase">
        Handover to {to}
      </p>
      {ids.length === 0 ? (
        <p className="mt-1 text-[13px] text-soft">No tasks ticked — only cover, nothing moves.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {(tasks ?? []).map((t) => (
            <li key={t.id} className="text-[13px] text-soft">
              <span className="font-semibold text-ink">{t.title}</span>
              {t.due_date ? ` · ${shortDate(t.due_date)}` : ""}
            </li>
          ))}
          {!tasks ? <li className="text-[13px] text-soft">Loading tasks…</li> : null}
        </ul>
      )}
      <p className="mt-2 text-[12px] text-soft">
        Approving moves {ids.length === 0 ? "nothing" : `${ids.length} task${ids.length === 1 ? "" : "s"}`} to {to}.
      </p>
    </div>
  );
}

function WaitingWith({ request }: { request: PendingRequest }) {
  const { data: warriors } = useWarriors();
  const approver = (warriors ?? []).find((w) => w.id === request.approver_id);
  const label = approver ? roleLabel(approver.role) : null;

  return (
    <p className="mt-4 rounded-lg border border-line bg-pearl p-3 text-[13px] font-semibold text-soft">
      This is your own request, so somebody else decides it. Waiting with{" "}
      <span className="text-ink">{approver?.full_name ?? "HR"}</span>
      {label ? ` (${label})` : ""}.
    </p>
  );
}

function RequestCard({
  request,
  index,
  deciderId,
}: {
  request: PendingRequest;
  index: number;
  deciderId: string | null;
}) {
  const decide = useDecideLeave(deciderId);
  const applicant = request.applicant;
  const isMine = Boolean(deciderId) && request.profile_id === deciderId;

  return (
    <li className="ce-rise ce-card p-5" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-night text-[13px] font-bold text-goldL">
          {initials(applicant?.full_name ?? "?")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">{applicant?.full_name}</p>
          <p className="text-[12px] text-soft">
            {applicant?.title ?? "Warrior"}
            {applicant?.department ? ` · ${applicant.department}` : ""}
          </p>
        </div>
        <span className="rounded-full border border-gold/40 bg-cream px-3 py-1 text-[11px] font-bold tracking-[0.08em] text-goldD uppercase">
          {TYPE_LABEL[request.type] ?? request.type}
        </span>
      </div>

      <p className="mt-4 text-sm font-semibold text-ink">
        {shortDate(request.from_date)}
        {request.from_date !== request.to_date ? ` → ${shortDate(request.to_date)}` : ""} ·{" "}
        {request.days} day{request.days === 1 ? "" : "s"}
        {request.half_day ? " (half day)" : ""}
      </p>
      {request.reason ? (
        <p className="mt-1 text-[13px] leading-relaxed text-soft">“{request.reason}”</p>
      ) : null}

      <HostWarning request={request} />
      <HandoverPreview request={request} />

      <div className="mt-3 border-t border-line pt-3">
        <BalanceContext profileId={request.profile_id} type={request.type} />
        <p className="mt-1 text-[12px] text-soft">
          Waiting since {shortDate(request.created_at.slice(0, 10))}
        </p>
        {request.created_at.slice(0, 10) < request.from_date ? (
          <p className="mt-1 text-[12px] font-semibold text-goldD">
            Decide before {shortDate(request.from_date)}. If nobody does, it is rejected automatically
            that day and can't be approved afterwards.
          </p>
        ) : null}
      </div>

      {isMine ? (
        <WaitingWith request={request} />
      ) : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="btn3d w-full sm:w-auto"
            disabled={decide.isPending}
            onClick={() => decide.mutate(
                { id: request.id, status: "approved" },
                { onSuccess: () => toast.success("Approved. They have been told.") },
              )}
          >
            Approve
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line bg-white px-5 text-[15px] font-bold text-ink sm:w-auto"
            disabled={decide.isPending}
            onClick={() => decide.mutate(
                { id: request.id, status: "rejected" },
                { onSuccess: () => toast.success("Declined. They have been told.") },
              )}
          >
            Reject
          </button>
        </div>
      )}

      {decide.isError ? (
        <p className="mt-3 text-[13px] font-semibold text-red">
          That decision wasn't allowed. A leave request has to be decided by somebody other than
          the person who applied.
        </p>
      ) : null}
    </li>
  );
}


function Approvals() {
  const { data } = useMyProfile();
  const profile = data?.profile ?? null;
  const canReview =
    profile?.role === "manager" || profile?.role === "hr" || profile?.role === "admin";

  const { data: pending, isLoading } = usePendingApprovals(Boolean(profile) && canReview);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5 py-2">
        <div className="ce-rise">
          <h1 className="font-display text-3xl text-ink">Approvals</h1>
          <HelpLink screen="approvals" />
          <p className="mt-2 text-sm text-soft">
            Longest waiting at the top. Every decision reaches the applicant straight away.
          </p>
        </div>

        {!canReview ? (
          <div className="ce-card p-6 text-sm text-soft">
            Nobody reports to you yet, so there is nothing to approve.
          </div>
        ) : isLoading ? (
          <div className="ce-card p-6 text-sm text-soft">Loading requests…</div>
        ) : pending && pending.length > 0 ? (
          <ul className="space-y-4">
            {pending.map((r, i) => (
              <RequestCard key={r.id} request={r} index={i} deciderId={profile?.id ?? null} />
            ))}
          </ul>
        ) : (
          <div className="ce-card p-6 text-sm text-soft">
            All clear — no leave is waiting on you.
          </div>
        )}
      </div>
    </AppShell>
  );
}
