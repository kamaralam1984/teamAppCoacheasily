import { toast } from "sonner";
import { useState } from "react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { useAddHoliday, useAllHolidays, useRemoveHoliday } from "@/hooks/useCalendar";
import { longDate, todayIso, weekdayName } from "@/lib/calendar";

export function HolidaysCard({
  orgId,
  canManage,
}: {
  orgId: string | null;
  canManage: boolean;
}) {
  const { data: holidays } = useAllHolidays();
  const add = useAddHoliday(orgId);
  const remove = useRemoveHoliday();
  const [date, setDate] = useState(todayIso());
  const [name, setName] = useState("");

  return (
    <div className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Company holidays</h2>
      <p className="mt-1 text-[13px] text-soft">
        These drive the sandwich rule and comp-offs, so a change here flows everywhere.
      </p>

      <ul className="mt-4 space-y-2">
        {(holidays ?? []).map((h) => (
          <li
            key={h.id}
            className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-2"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-red" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{h.name}</p>
              <p className="text-[12px] text-soft">
                {longDate(h.date)} · {weekdayName(h.date)}
              </p>
            </div>
            {canManage ? (
              <ConfirmButton
                label="✕"
                ariaLabel={`Remove ${h.name}`}
                message={`Remove the ${h.name} holiday on ${longDate(h.date)}? Everyone's calendar and any comp-off rule for that day changes with it.`}
                confirmLabel="Yes, remove it"
                pending={remove.isPending}
                onConfirm={() => remove.mutate(h.id)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-soft"
              />
            ) : null}
          </li>
        ))}
        {(holidays ?? []).length === 0 ? (
          <li className="text-sm text-soft">No holidays listed yet.</li>
        ) : null}
      </ul>

      {canManage ? (
        <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
          <div>
            <label className="ce-label" htmlFor="h-date">
              Date
            </label>
            <input
              id="h-date"
              type="date"
              className="ce-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="ce-label" htmlFor="h-name">
              Name
            </label>
            <input
              id="h-name"
              className="ce-input"
              placeholder="Holi"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn3d-ghost btn3d"
            disabled={!name.trim() || add.isPending}
            onClick={() =>
              add.mutate(
                { date, name: name.trim() },
                {
                  onSuccess: () => {
                    setName("");
                    toast.success("Holiday added.");
                  },
                },
              )
            }
          >
            Add holiday
          </button>
        </div>
      ) : null}
    </div>
  );
}
