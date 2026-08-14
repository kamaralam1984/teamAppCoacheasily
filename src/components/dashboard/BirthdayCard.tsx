import type { CSSProperties } from "react";
import { toast } from "sonner";

import { useGiveRecognition, useRecognitions } from "@/hooks/useCulture";
import { firstName } from "@/lib/birthdays";
import type { Profile } from "@/lib/warriors";

/** One tap, not a form. Wishes land on the recognition wall and notify them. */
export function BirthdayCard({
  me,
  celebrants,
  style,
}: {
  me: Profile;
  celebrants: Profile[];
  style?: CSSProperties;
}) {
  const { data: rows } = useRecognitions(200);
  const give = useGiveRecognition(me.org_id, me.id);
  /** Wished within the day — a timestamp window, so late-evening IST still counts. */
  const alreadyWished = (id: string) =>
    (rows ?? []).some(
      (r) =>
        r.from_id === me.id &&
        r.to_id === id &&
        r.text.startsWith("🎂") &&
        Date.now() - new Date(r.created_at).getTime() < 20 * 60 * 60 * 1000,
    );

  if (celebrants.length === 0) return null;

  return (
    <section
      className="ce-rise ce-card border border-gold/50 bg-gold/10 p-6"
      style={style}
    >
      {celebrants.map((p) => {
        const done = alreadyWished(p.id);
        return (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-1">
            <div className="min-w-0">
              <h2 className="font-display text-2xl text-ink">
                🎂 It's {p.full_name}'s birthday today
              </h2>
              <p className="text-[13px] text-soft">{p.title ?? "CoachEasily"}</p>
            </div>
            {done ? (
              <span className="text-[13px] font-bold text-goldD">Wishes sent ✓</span>
            ) : (
              <button
                type="button"
                className="btn3d w-full sm:w-auto"
                disabled={give.isPending}
                onClick={() =>
                  give.mutate(
                    {
                      to_id: p.id,
                      kind: "praise",
                      text: `🎂 Happy birthday, ${firstName(p.full_name)}! Wishing you a wonderful year ahead.`,
                    },
                    {
                      onSuccess: () => toast.success(`Your wishes are on the wall for ${firstName(p.full_name)}.`),
                      onError: () => toast.error("That didn't send. Please try again."),
                    },
                  )
                }
              >
                Send birthday wishes
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
