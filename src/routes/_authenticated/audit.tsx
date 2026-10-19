import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { useAuditLog, type AuditFilters, type AuditRow } from "@/hooks/useAudit";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useWarriors } from "@/hooks/useWarriors";
import { downloadCsv, toCsv } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit trail | CoachEasily Team App" },
      {
        name: "description",
        content: "Who changed what, and when: people, leave, attendance, tasks and policies.",
      },
      { property: "og:title", content: "Audit trail | CoachEasily Team App" },
      {
        property: "og:description",
        content: "Who changed what, and when: people, leave, attendance, tasks and policies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const ENTITIES: { value: string; label: string }[] = [
  { value: "", label: "Everything" },
  { value: "profile", label: "People" },
  { value: "leave", label: "Leave and earned leave" },
  { value: "attendance", label: "Attendance corrections" },
  { value: "task", label: "Tasks" },
  { value: "probation", label: "Probation" },
  { value: "holiday", label: "Holidays" },
  { value: "policy", label: "Policies" },
  { value: "goals", label: "Goal cycles" },
];

const ENTITY_TONE: Record<string, string> = {
  profile: "bg-violet/12 text-violet",
  leave: "bg-emer/15 text-emer",
  attendance: "bg-saff/15 text-saffBtn",
  task: "bg-goldL/30 text-goldD",
  probation: "bg-mist/50 text-ink",
  holiday: "bg-goldL/20 text-goldD",
  policy: "bg-red/12 text-red",
  goals: "bg-cream text-soft",
};

function Page() {
  const { data } = useMyProfile();
  const role = data?.profile?.role;
  const allowed = role === "hr" || role === "admin";
  const { data: people } = useWarriors();

  const [filters, setFilters] = useState<AuditFilters>({
    entity: "",
    subjectId: "",
    from: "",
    to: "",
    text: "",
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const log = useAuditLog(filters, allowed);
  const rows = useMemo(() => (log.data?.pages ?? []).flat(), [log.data]);

  const set = (patch: Partial<AuditFilters>) => setFilters((f) => ({ ...f, ...patch }));

  function exportCsv() {
    downloadCsv(
      "audit-trail.csv",
      toCsv(
        ["When (IST)", "Who", "About", "Area", "What happened"],
        rows.map((r) => [
          new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          r.actor_name,
          r.subject_name ?? "",
          r.entity,
          r.summary,
        ]),
      ),
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        <header className="ce-rise">
          <h1 className="font-display text-4xl text-ink">Audit trail</h1>
          <p className="mt-1 text-sm text-soft">
            Who changed what, and when. Nobody can edit or delete these lines.
          </p>
        </header>

        {data && !allowed ? (
          <p className="ce-card p-6 text-sm text-soft">This view is for HR and admin.</p>
        ) : (
          <>
            <section className="ce-card grid gap-3 p-5 sm:grid-cols-2">
              <label>
                <span className="ce-label">Area</span>
                <select
                  className="ce-input"
                  value={filters.entity}
                  onChange={(e) => set({ entity: e.target.value })}
                >
                  {ENTITIES.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="ce-label">About</span>
                <select
                  className="ce-input"
                  value={filters.subjectId}
                  onChange={(e) => set({ subjectId: e.target.value })}
                >
                  <option value="">Everyone</option>
                  {(people ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="ce-label">From</span>
                <input
                  type="date"
                  className="ce-input"
                  value={filters.from}
                  onChange={(e) => set({ from: e.target.value })}
                />
              </label>
              <label>
                <span className="ce-label">To</span>
                <input
                  type="date"
                  className="ce-input"
                  value={filters.to}
                  onChange={(e) => set({ to: e.target.value })}
                />
              </label>
              <label className="sm:col-span-2">
                <span className="ce-label">Search the wording</span>
                <input
                  className="ce-input"
                  placeholder="approved, manager, earned leave…"
                  value={filters.text}
                  onChange={(e) => set({ text: e.target.value })}
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  className="btn3d btn3d-gold"
                  disabled={rows.length === 0}
                  onClick={exportCsv}
                >
                  Download what is shown (CSV)
                </button>
              </div>
            </section>

            {log.isLoading ? <p className="text-sm text-soft">Loading…</p> : null}
            {log.error ? (
              <p className="text-sm text-red">The audit trail couldn't be loaded.</p>
            ) : null}

            <ul className="space-y-2">
              {rows.map((r: AuditRow) => (
                <li key={r.id} className="ce-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${ENTITY_TONE[r.entity] ?? "bg-cream text-soft"}`}
                    >
                      {r.entity}
                    </span>
                    <span className="text-[12px] text-soft">
                      {new Date(r.created_at).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink">{r.summary}</p>
                  {r.old_value || r.new_value ? (
                    <>
                      <button
                        type="button"
                        className="mt-1 min-h-9 text-[12px] font-bold text-violet"
                        onClick={() => setOpenId(openId === r.id ? null : r.id)}
                      >
                        {openId === r.id ? "Hide the values" : "Show the values"}
                      </button>
                      {openId === r.id ? (
                        <div className="mt-1 grid gap-2 sm:grid-cols-2">
                          <pre className="overflow-auto rounded bg-cream p-2 text-[11px] text-ink">
                            {JSON.stringify(r.old_value, null, 2) ?? "—"}
                          </pre>
                          <pre className="overflow-auto rounded bg-cream p-2 text-[11px] text-ink">
                            {JSON.stringify(r.new_value, null, 2) ?? "—"}
                          </pre>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </li>
              ))}
              {log.data && rows.length === 0 ? (
                <li className="text-sm text-soft">Nothing matches.</li>
              ) : null}
            </ul>

            {log.hasNextPage ? (
              <button
                type="button"
                className="btn3d btn3d-ghost"
                disabled={log.isFetchingNextPage}
                onClick={() => void log.fetchNextPage()}
              >
                {log.isFetchingNextPage ? "Loading…" : "Older entries"}
              </button>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
