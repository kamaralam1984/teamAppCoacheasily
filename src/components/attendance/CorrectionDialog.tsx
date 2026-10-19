import { useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WORK_MODE_LABEL, type WorkMode } from "@/hooks/useAttendance";
import { useCorrectAttendance } from "@/hooks/useAttendanceEngine";
import { attended, KIND_LABEL, type DayInfo } from "@/lib/attendanceKinds";
import { niceDate } from "@/lib/calendar";

function startingStatus(day: DayInfo): WorkMode {
  return day.kind === "wfh" ? "wfh" : day.kind === "half_day" ? "half_day" : "present";
}

/** HR/Admin: fix one person's day. The old value, the new value and the reason are kept. */
export function CorrectionDialog({
  profileId,
  name,
  day,
  onClose,
}: {
  profileId: string;
  name: string;
  day: DayInfo;
  onClose: () => void;
}) {
  const correct = useCorrectAttendance();
  const hasRecord = attended(day.kind);
  const [status, setStatus] = useState<WorkMode>(startingStatus(day));
  const [checkIn, setCheckIn] = useState(day.check_in ?? "10:00");
  const [checkOut, setCheckOut] = useState(day.check_out ?? "");
  const [reason, setReason] = useState("");

  const reasonOk = reason.trim().length >= 3;

  function run(action: "set" | "remove") {
    correct.mutate(
      {
        profileId,
        date: day.date,
        action,
        reason: reason.trim(),
        ...(action === "set" ? { status, checkIn, ...(checkOut ? { checkOut } : {}) } : {}),
      },
      {
        onSuccess: () => {
          toast.success(action === "remove" ? "The day was removed." : "Attendance corrected.");
          onClose();
        },
        onError: (e) => toast.error((e as Error).message || "That didn't save."),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {name} · {niceDate(day.date)}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-soft">
          Currently: <b className="text-ink">{KIND_LABEL[day.kind]}</b>
          {day.check_in ? ` · in ${day.check_in}` : ""}
          {day.check_out ? ` · out ${day.check_out}` : ""}. The person is told about the correction.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="ce-label">Worked</span>
            <select
              className="ce-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as WorkMode)}
            >
              {(Object.keys(WORK_MODE_LABEL) as WorkMode[]).map((m) => (
                <option key={m} value={m}>
                  {WORK_MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="ce-label">Check-in</span>
            <input
              type="time"
              className="ce-input"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
          </label>
          <label>
            <span className="ce-label">
              Check-out <span className="font-normal normal-case">(optional)</span>
            </span>
            <input
              type="time"
              className="ce-input"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="ce-label">Reason (required)</span>
            <input
              className="ce-input"
              maxLength={200}
              value={reason}
              placeholder="Forgot to mark; was on the standup call"
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn3d"
            disabled={!reasonOk || !checkIn || correct.isPending}
            onClick={() => run("set")}
          >
            {correct.isPending ? "Saving…" : hasRecord ? "Save correction" : "Add this day"}
          </button>
          {hasRecord ? (
            <button
              type="button"
              className="btn3d btn3d-danger"
              disabled={!reasonOk || correct.isPending}
              onClick={() => {
                if (window.confirm(`Remove ${name}'s attendance for ${niceDate(day.date)}?`)) {
                  run("remove");
                }
              }}
            >
              Remove this day
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
