import { toast } from "sonner";
import { useState } from "react";

import {
  useEarnedLeavePolicy,
  useRebuildApply,
  useRebuildPreview,
  type CountMode,
  type RebuildRow,
} from "@/hooks/useEarnedLeave";
import { niceDate } from "@/lib/calendar";

function change(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

/**
 * How days are counted. The default counts the days a person marked attendance. Counting from the
 * joining date counts every working day since they joined, marked or not. Switching shows exactly
 * what changes for each person first, and rebuilds every ledger only when HR confirms.
 */
export function JoiningDateSwitch() {
  const { data: policy } = useEarnedLeavePolicy();
  const preview = useRebuildPreview();
  const apply = useRebuildApply();
  const [word, setWord] = useState("");

  const fromJoining = policy?.count_from === "joining_date";
  const rows: RebuildRow[] = preview.data?.people ?? [];
  const previewMode: CountMode = preview.data?.mode_preview ?? "joining_date";
  const changed = rows.filter((r) => r.change !== 0);
  const noted = rows.filter((r) => r.note);
  const totalChange = rows.reduce((n, r) => n + r.change, 0);

  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="ce-label">How days are counted</p>
      <p className="mt-1 text-[13px] leading-relaxed text-soft">
        {fromJoining ? (
          <>
            <b className="text-ink">From the joining date.</b> Every working day since someone
            joined counts, whether or not they marked attendance. Weekly offs, holidays, unpaid
            leave and (unless counted above) approved leave are skipped, and today counts tomorrow.
          </>
        ) : (
          <>
            <b className="text-ink">From attendance.</b> A day counts when the person marked
            attendance. You can count from the joining date instead: every working day since they
            joined, marked or not. Nothing changes until you check the preview and confirm.
          </>
        )}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {(fromJoining
          ? ([
              ["joining_date", "Preview a fresh count from the joining date"],
              ["punches", "Preview counting attendance days instead"],
            ] as [CountMode, string][])
          : ([
              ["punches", "Preview a recount of attendance days"],
              ["joining_date", "Preview counting from the joining date"],
            ] as [CountMode, string][])
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className="btn3d btn3d-ghost"
            disabled={preview.isPending}
            onClick={() =>
              preview.mutate(mode, {
                onError: (e) =>
                  toast.error((e as Error).message || "The preview couldn't be made."),
              })
            }
          >
            {preview.isPending && preview.variables === mode ? "Working it out…" : label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-soft">
        A recount of attendance days catches up days that were left out before, such as weekly offs
        that were worked, without changing how days are counted.
      </p>

      {preview.data ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-ink">
            Counting{" "}
            <b>{previewMode === "punches" ? "attendance days" : "from the joining date"}</b>:{" "}
            <b>{changed.length}</b> of {rows.length} people would change, by{" "}
            <b>{change(totalChange)}</b> earned leave in all. Nothing has been changed yet.
          </p>

          {noted.length > 0 ? (
            <ul className="space-y-1 rounded-lg border border-gold/50 bg-goldL/15 p-3 text-[12px] leading-relaxed text-ink">
              {noted.map((r) => (
                <li key={r.profile_id}>
                  <b>{r.full_name}:</b> {r.note}
                </li>
              ))}
              <li className="text-soft">
                An opening balance is added on top of the days counted from the joining date. If it
                already covers earlier days, lower it in Warriors before you confirm.
              </li>
            </ul>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[720px] text-left text-[12px]">
              <thead className="border-b border-line bg-cream text-soft">
                <tr>
                  {[
                    "Warrior",
                    "Joined",
                    "Working days",
                    "Opening",
                    "Earned now → new",
                    "Available now → new",
                    "Change",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-2 py-2 text-[10px] font-bold tracking-wider uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.profile_id} className="border-b border-line/60">
                    <td className="px-2 py-2 font-bold text-ink">{r.full_name}</td>
                    <td className="px-2 py-2">{r.joined_on ? niceDate(r.joined_on) : "—"}</td>
                    <td className="px-2 py-2 tabular-nums">{r.joined_on ? r.working_days : "—"}</td>
                    <td className="px-2 py-2 tabular-nums">{r.opening}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {r.credits_now} → {r.credits_new}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {r.available_now} → {r.available_new}
                    </td>
                    <td
                      className={`px-2 py-2 font-bold tabular-nums ${
                        r.change > 0 ? "text-emer" : r.change < 0 ? "text-red" : "text-soft"
                      }`}
                    >
                      {change(r.change)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-soft">
            “Available” is earned leave plus the opening balance, less what has been used. The old
            ledger lines are archived, not deleted, and each person is told their leave was
            recalculated.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <label>
              <span className="ce-label">Type REBUILD to confirm</span>
              <input
                className="ce-input w-48"
                value={word}
                autoComplete="off"
                onChange={(e) => setWord(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn3d"
              disabled={word !== "REBUILD" || apply.isPending}
              onClick={() =>
                apply.mutate(
                  { confirm: word, mode: previewMode },
                  {
                    onSuccess: (n) => {
                      toast.success(
                        n === 0
                          ? "Everything already matched."
                          : `${n} ${n === 1 ? "person" : "people"} updated.`,
                      );
                      setWord("");
                      preview.reset();
                    },
                    onError: (e) =>
                      toast.error((e as Error).message || "The rebuild didn't go through."),
                  },
                )
              }
            >
              {apply.isPending
                ? "Rebuilding…"
                : previewMode === "punches"
                  ? "Recount attendance days and rebuild"
                  : "Count from the joining date and rebuild"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
