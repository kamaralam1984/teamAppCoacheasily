import { useState } from "react";
import { toast } from "sonner";

import { HalfPartPicker } from "@/components/leave/HalfPartPicker";
import {
  useCancelLeave,
  useEditLeave,
  useFlexiHolidays,
  useLeaveCheck,
  useRemindLeave,
  type HalfPart,
  type LeaveRequest,
  type LeaveType,
} from "@/hooks/useLeave";
import { shortDate } from "@/lib/warriors";

const DAY = 24 * 3600_000;
const msg = (e: unknown) =>
  (e as { message?: string } | null)?.message ?? "That didn't work. Please try again.";
const SMALL =
  "inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-[13px] font-bold text-ink disabled:opacity-50";

type TypeOption = { value: LeaveType; label: string };

/** Edit, cancel and remind, under the person's own pending request. */
export function PendingLeaveActions({
  request,
  today,
  types,
  myName,
}: {
  request: LeaveRequest;
  today: string;
  types: TypeOption[];
  myName: string | null;
}) {
  const [mode, setMode] = useState<"none" | "edit" | "cancel">("none");
  const cancel = useCancelLeave();
  const remind = useRemindLeave(myName);
  const nudged = request.nudged_at ? Date.parse(request.nudged_at) : 0;
  const waiting = nudged > Date.now() - DAY;

  if (mode === "edit")
    return (
      <EditForm
        request={request}
        today={today}
        types={types}
        myName={myName}
        onClose={() => setMode("none")}
      />
    );

  if (mode === "cancel")
    return (
      <div className="mt-2 flex w-full flex-wrap items-center gap-2">
        <p className="text-[13px] font-semibold text-ink">Cancel this request?</p>
        <button
          type="button"
          className={SMALL}
          disabled={cancel.isPending}
          onClick={() =>
            cancel.mutate(request.id, {
              onSuccess: () => toast.success("Cancelled. Your approver has been told."),
              onError: (e) => toast.error(msg(e)),
            })
          }
        >
          {cancel.isPending ? "Cancelling…" : "Yes, cancel it"}
        </button>
        <button type="button" className={SMALL} onClick={() => setMode("none")}>
          Keep it
        </button>
      </div>
    );

  return (
    <div className="mt-2 flex w-full flex-wrap items-center gap-2">
      <button type="button" className={SMALL} onClick={() => setMode("edit")}>
        Edit
      </button>
      <button type="button" className={SMALL} onClick={() => setMode("cancel")}>
        Cancel request
      </button>
      <button
        type="button"
        className={SMALL}
        disabled={waiting || remind.isPending}
        onClick={() =>
          remind.mutate(request, {
            onSuccess: () => toast.success("Reminder sent to your approver."),
            onError: (e) => toast.error(msg(e)),
          })
        }
      >
        {waiting ? "Reminder sent" : remind.isPending ? "Sending…" : "Send reminder"}
      </button>
      {waiting ? (
        <span className="text-[12px] text-soft">
          You can send another after{" "}
          {new Date(nudged + DAY).toLocaleString("en-GB", {
            timeZone: "Asia/Kolkata",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })}
        </span>
      ) : null}
    </div>
  );
}

function EditForm({
  request,
  today,
  types,
  myName,
  onClose,
}: {
  request: LeaveRequest;
  today: string;
  types: TypeOption[];
  myName: string | null;
  onClose: () => void;
}) {
  const [type, setType] = useState(request.type as LeaveType);
  const [from, setFrom] = useState(request.from_date);
  const [to, setTo] = useState(request.to_date);
  const [half, setHalf] = useState(request.half_day);
  const [part, setPart] = useState<HalfPart>(request.half_part === "second" ? "second" : "first");
  const [reason, setReason] = useState(request.reason ?? "");
  const edit = useEditLeave(myName);

  const flexi = type === "flexi";
  const halfDay = half && !flexi;
  const last = halfDay || flexi ? from : to;
  const year = Number((from || today).slice(0, 4));
  const [flexiYear, setFlexiYear] = useState(year);
  const { data: list } = useFlexiHolidays(flexiYear, flexi);
  const thisYear = Number(today.slice(0, 4));

  const check = useLeaveCheck({
    type,
    from,
    to: last,
    halfDay,
    exclude: request.id,
    enabled: Boolean(from && last),
  });
  const sameTime =
    type === request.type &&
    from === request.from_date &&
    last === request.to_date &&
    halfDay === request.half_day;
  // changing only the reason never re-runs the rules, as in the database
  const errors = sameTime ? [] : (check.data?.errors ?? []);
  const warnings = type === "sick" ? [] : (check.data?.warnings ?? []);
  const blocked =
    !from || !last || errors.length > 0 || check.isFetching || check.isError || edit.isPending;
  const id = `le-${request.id}`;

  return (
    <form
      className="mt-2 w-full space-y-4 rounded-[12px] border border-line bg-pearl p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (blocked) return;
        edit.mutate(
          {
            id: request.id,
            type,
            from_date: from,
            to_date: last,
            half_day: halfDay,
            half_part: halfDay ? part : null,
            reason,
          },
          {
            onSuccess: (r) => {
              toast.success(r.changed ? "Saved. Your approver has been told." : "Nothing changed.");
              onClose();
            },
          },
        );
      }}
    >
      <div>
        <label htmlFor={`${id}-type`} className="ce-label">
          Type of leave
        </label>
        <select
          id={`${id}-type`}
          className="ce-input"
          value={type}
          onChange={(e) => {
            const next = e.target.value as LeaveType;
            if (next === "flexi") {
              setFrom("");
              setTo("");
            } else if (flexi && !from) {
              setFrom(request.from_date);
              setTo(request.to_date);
            }
            setType(next);
          }}
        >
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {flexi ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_1fr]">
          <select
            aria-label="Year"
            className="ce-input"
            value={flexiYear}
            onChange={(e) => {
              setFlexiYear(Number(e.target.value));
              setFrom("");
            }}
          >
            {[thisYear, thisYear + 1].map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
          <select
            aria-label="Flexi holiday"
            className="ce-input"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setTo(e.target.value);
            }}
          >
            <option value="">Pick a day</option>
            {(list?.options ?? []).map((o) => (
              <option
                key={o.id}
                value={o.date}
                disabled={
                  o.date <= today ||
                  Boolean(list?.requests.some((r) => r.date === o.date && r.id !== request.id))
                }
              >
                {o.name} · {shortDate(o.date)}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-from`} className="ce-label">
                First day
              </label>
              <input
                id={`${id}-from`}
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
              <label htmlFor={`${id}-to`} className="ce-label">
                Last day
              </label>
              <input
                id={`${id}-to`}
                type="date"
                className="ce-input"
                value={last}
                disabled={halfDay}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-line accent-[var(--ce-saffBtn)]"
              checked={half}
              onChange={(e) => setHalf(e.target.checked)}
            />
            Half day (counts as 0.5)
          </label>
          {halfDay ? <HalfPartPicker name={`${id}-part`} value={part} onChange={setPart} /> : null}
        </>
      )}

      <div>
        <label htmlFor={`${id}-reason`} className="ce-label">
          Reason (optional)
        </label>
        <textarea
          id={`${id}-reason`}
          className="ce-input min-h-20"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <p className="text-[13px] font-semibold text-ink">
        {check.data?.days ?? 0} day{check.data?.days === 1 ? "" : "s"} requested
      </p>
      {errors.map((m) => (
        <p key={m} className="text-[13px] font-semibold text-red">
          {m}
        </p>
      ))}
      {warnings.map((m) => (
        <p key={m} className="text-[13px] font-semibold text-goldD">
          {m}
        </p>
      ))}
      {check.isError || edit.isError ? (
        <p className="text-[13px] font-semibold text-red">{msg(edit.error ?? check.error)}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn3d" disabled={blocked}>
          {edit.isPending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className={SMALL} onClick={onClose}>
          Close
        </button>
      </div>
    </form>
  );
}
