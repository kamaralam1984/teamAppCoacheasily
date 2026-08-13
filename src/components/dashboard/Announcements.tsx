import type { CSSProperties } from "react";

import type { Announcement } from "@/hooks/useReports";

const IST = "Asia/Kolkata";

function when(ts: string) {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: IST,
  });
}

export function Announcements({
  items,
  style,
}: {
  items: Announcement[] | undefined;
  style?: CSSProperties;
}) {
  const list = items ?? [];
  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <h2 className="font-display text-2xl text-ink">Announcements</h2>

      {list.length === 0 ? (
        <p className="mt-4 rounded-[14px] bg-cream px-4 py-4 text-[13px] leading-relaxed text-soft">
          Nothing new to read. When something matters — a holiday, a new warrior, a decision — it
          lands here.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {list.map((n) => {
            const body = (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 text-[14px] font-semibold text-ink">{n.title}</p>
                  <span className="shrink-0 text-[12px] text-soft">{when(n.created_at)}</span>
                </div>
                {n.body ? (
                  <p className="mt-1 text-[13px] leading-relaxed text-soft">{n.body}</p>
                ) : null}
              </>
            );
            return (
              <li
                key={n.id}
                className={
                  "rounded-[12px] border border-line p-3.5 " + (n.read ? "bg-ivory" : "bg-cream")
                }
              >
                {n.link ? (
                  <a href={n.link} className="block">
                    {body}
                  </a>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
