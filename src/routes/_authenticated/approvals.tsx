import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import {
  TYPE_LABEL,
  useDecideLeave,
  useLeaveBalances,
  usePendingApprovals,
  type PendingRequest,
} from "@/hooks/useLeave";
import { useMyProfile } from "@/hooks/useMyProfile";
import { shortDate } from "@/lib/warriors";

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

      <div className="mt-3 border-t border-line pt-3">
        <BalanceContext profileId={request.profile_id} type={request.type} />
        <p className="mt-1 text-[12px] text-soft">
          Waiting since {shortDate(request.created_at.slice(0, 10))}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="btn3d w-full sm:w-auto"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ id: request.id, status: "approved" })}
        >
          Approve
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line bg-white px-5 text-[15px] font-bold text-ink sm:w-auto"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ id: request.id, status: "rejected" })}
        >
          Reject
        </button>
      </div>

      {decide.isError ? (
        <p className="mt-3 text-[13px] font-semibold text-red">
          That didn't go through. Please try again.
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
