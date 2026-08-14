import { rupees } from "@/lib/money";
import type { RevenueSummary } from "@/hooks/useReports";

interface Props {
  data: RevenueSummary | null | undefined;
  style?: React.CSSProperties;
}

/** Every rupee here comes from revenue_summary(). Nothing is added up in the browser. */
export function RevenueCard({ data, style }: Props) {
  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <p className="ce-label">Revenue</p>
      <h2 className="mt-1 font-display text-2xl text-ink">
        {data?.cycle ? data.cycle.name : "No cycle running"}
      </h2>

      {!data || !data.cycle ? (
        <p className="mt-2 text-sm text-soft">
          A cycle has to be open before revenue can be counted.
        </p>
      ) : (
        <>
          <p className="mt-3 font-display text-4xl text-ink">{rupees(data.total)}</p>
          <p className="mt-1 text-[13px] text-soft">
            Closed so far this cycle, as reported on the daily log.
          </p>

          {data.people.length === 0 ? (
            <p className="mt-4 text-sm text-soft">
              Nobody has a revenue-tracking goal in this cycle yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {data.people.map((p) => (
                <li
                  key={p.profile_id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0 truncate text-[14px] font-bold text-ink">
                    {p.full_name}
                  </span>
                  <span className="shrink-0 text-[14px] font-bold text-goldD">
                    {rupees(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
