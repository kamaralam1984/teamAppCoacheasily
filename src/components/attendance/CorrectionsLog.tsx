import { useCorrections } from "@/hooks/useAttendanceEngine";
import { KIND_LABEL, type DayKind } from "@/lib/attendanceKinds";
import { niceDate } from "@/lib/calendar";

function describe(v: { status: string; check_in: string; check_out: string | null } | null) {
  if (!v) return "no attendance";
  const status = KIND_LABEL[(v.status === "present" ? "present" : v.status) as DayKind] ?? v.status;
  return `${status}, in ${v.check_in}${v.check_out ? `, out ${v.check_out}` : ""}`;
}

/** Every HR correction to a person's attendance, newest first. */
export function CorrectionsLog({
  profileId,
  enabled,
}: {
  profileId?: string | null;
  enabled: boolean;
}) {
  const { data, isLoading } = useCorrections(profileId, enabled);
  if (!enabled) return null;

  return (
    <section className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Corrections</h2>
      {isLoading ? (
        <p className="mt-3 text-sm text-soft">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="mt-3 text-sm text-soft">Nothing has been corrected.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {data.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-line bg-cream px-3 py-2 text-[13px] text-ink"
            >
              <span className="font-bold">
                {niceDate(c.date)} · {c.corrected_by_name ?? "HR"} ·{" "}
                {new Date(c.created_at).toLocaleString("en-IN")}
              </span>
              <span className="block text-soft">
                {describe(c.old_value)} → {describe(c.new_value)}
              </span>
              <span className="block text-soft">Reason: {c.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
