import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProbationOverview, type ProbationRow } from "@/hooks/useProbation";
import { niceDate } from "@/lib/calendar";
import { probationLeftText, probationReminderPoint } from "@/lib/probation";

function seenKey(viewerId: string, r: ProbationRow, point: string) {
  return `ce-probation-alert:${viewerId}:${r.profile_id}:${r.end_date}:${point}`;
}

function seen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markSeen(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* private window: it will simply show again on the next open */
  }
}

/**
 * HR and Admin: on opening the app, a popup for every probation that has reached a reminder
 * point (15, 10, 5 and 2 days left, the last day, ended with no decision). Each point shows once
 * per person per browser; the same points also arrive as notifications.
 */
export function ProbationAlert({ viewerId }: { viewerId: string }) {
  const { data } = useProbationOverview();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const decided = useRef(false);

  const due = useMemo(
    () =>
      (data ?? [])
        .filter((r) => r.status === "on_probation" && r.profile_id !== viewerId)
        .map((r) => ({ row: r, point: probationReminderPoint(r.days_left) }))
        .filter((x): x is { row: ProbationRow; point: string } => x.point !== null)
        .filter((x) => !seen(seenKey(viewerId, x.row, x.point)))
        .sort((a, b) => a.row.days_left - b.row.days_left),
    [data, viewerId],
  );

  useEffect(() => {
    if (decided.current || !data) return;
    decided.current = true;
    if (due.length === 0) return;
    for (const x of due) markSeen(seenKey(viewerId, x.row, x.point));
    setOpen(true);
  }, [data, due, viewerId]);

  function openPerson(profileId: string) {
    setOpen(false);
    void navigate({ to: "/warriors", search: { probation: profileId } });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl border-saff/40 bg-ivory sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-ink">
            {due.length === 1 ? "A probation is ending" : "Probations ending"}
          </DialogTitle>
        </DialogHeader>
        <ul className="space-y-2">
          {due.map(({ row }) => (
            <li key={row.profile_id}>
              <button
                type="button"
                onClick={() => openPerson(row.profile_id)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-saff/30 bg-saff/8 px-3 py-2.5 text-left hover:bg-saff/15 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-ink">
                    {row.full_name}
                  </span>
                  <span className="block truncate text-[12px] text-soft">
                    Last day {niceDate(row.end_date)}
                    {row.department ? ` · ${row.department}` : ""}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-saff/12 px-2 py-0.5 text-[11px] font-bold text-saffBtn">
                  {probationLeftText(row.days_left)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-[13px] leading-relaxed text-soft">
          Open a warrior to confirm, extend or mark their probation for review.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          <button type="button" className="btn3d btn3d-ghost" onClick={() => setOpen(false)}>
            Later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
