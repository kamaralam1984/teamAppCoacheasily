import { useState } from "react";
import { toast } from "sonner";

import {
  useCancelCheckin,
  useCheckins,
  useMarkTalked,
  useRequestCheckin,
} from "@/hooks/useCulture";
import { whenLabel } from "@/lib/culture";
import type { Profile } from "@/lib/warriors";

/**
 * A doorbell, not a dataset.
 *
 * One tap tells this person's manager and People & Culture that they would
 * like a conversation. No mood score, no category, no reason stored, no
 * history shown to anyone. It must never become a metric.
 */
export function CheckInRequest({
  me,
  people,
  isLead,
  style,
}: {
  me: Profile;
  people: Profile[];
  isLead: boolean;
  style?: React.CSSProperties;
}) {
  const { data: rows } = useCheckins(true);
  const ask = useRequestCheckin();
  const cancel = useCancelCheckin();
  const talked = useMarkTalked();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const byId = new Map(people.map((p) => [p.id, p]));
  const all = rows ?? [];
  const mine = all.find((r) => r.profile_id === me.id && !r.actioned_at) ?? null;
  const forMe = all.filter((r) => r.profile_id !== me.id && !r.actioned_at);

  return (
    <>
      <section className="ce-rise ce-card p-6" style={style}>
        <p className="ce-label">Private</p>
        <h2 className="mt-1 font-display text-2xl text-ink">I'd like a check-in</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-soft">
          Everyone has heavy weeks. Ask for a conversation — no explanation needed. Your manager
          and People &amp; Culture are told that you'd like to talk this week, and nothing else.
          No score, no reason, no record of why.
        </p>

        {mine ? (
          <div className="mt-4 rounded-[14px] border border-goldD/40 bg-gold/12 p-4">
            <p className="text-[14px] font-bold text-ink">
              Asked {whenLabel(mine.requested_at)}. Someone will come to you.
            </p>
            <button
              type="button"
              className="mt-3 min-h-11 text-[13px] font-bold text-soft underline"
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate(mine.id, {
                  onSuccess: () => toast.success("Withdrawn. Nobody will follow up."),
                  onError: () => toast.error("That didn't go through. Please try again."),
                })
              }
            >
              Actually, I'm alright — withdraw this
            </button>
          </div>
        ) : !open ? (
          <button type="button" className="btn3d mt-5 w-full sm:w-auto" onClick={() => setOpen(true)}>
            I'd like a check-in
          </button>
        ) : (
          <div className="mt-5 space-y-3">
            <label className="block">
              <span className="ce-label">One line, if you feel like it (optional)</span>
              <input
                className="ce-input"
                maxLength={140}
                placeholder="Nothing is required here."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="btn3d w-full sm:w-auto"
                disabled={ask.isPending}
                onClick={() =>
                  ask.mutate(note, {
                    onSuccess: () => {
                      setNote("");
                      setOpen(false);
                      toast.success("Asked. Someone will reach out this week.");
                    },
                    onError: () => toast.error("That didn't go through. Please try again."),
                  })
                }
              >
                {ask.isPending ? "Asking…" : "Send the request"}
              </button>
              <button
                type="button"
                className="min-h-11 text-[13px] font-bold text-soft underline"
                onClick={() => setOpen(false)}
              >
                Not now
              </button>
            </div>
          </div>
        )}
      </section>

      {isLead ? (
        <section className="ce-rise ce-card p-6">
          <p className="ce-label">Waiting on you</p>
          <h2 className="mt-1 font-display text-2xl text-ink">People who asked to talk</h2>
          {forMe.length === 0 ? (
            <p className="mt-2 text-[13px] leading-relaxed text-soft">
              Nobody is waiting. When someone asks, they appear here — a name and a date, nothing
              more. Go and have the conversation; don't count these.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {forMe.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-cream px-4 py-3"
                >
                  <div>
                    <p className="text-[14px] font-bold text-ink">
                      {byId.get(r.profile_id)?.full_name ?? "A warrior"} would like a check-in this
                      week.
                    </p>
                    <p className="text-[12px] text-soft">Asked {whenLabel(r.requested_at)}</p>
                  </div>
                  <button
                    type="button"
                    className="min-h-11 rounded-full border border-line bg-white px-4 text-[13px] font-bold text-ink"
                    disabled={talked.isPending}
                    onClick={() =>
                      talked.mutate(r.id, {
                        onSuccess: () => toast.success("Cleared. Thank you for showing up."),
                        onError: () => toast.error("That didn't save. Please try again."),
                      })
                    }
                  >
                    We talked
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
