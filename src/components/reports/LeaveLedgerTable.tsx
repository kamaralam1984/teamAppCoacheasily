import type { CSSProperties } from "react";

import { balanceOf, downloadCsv, toCsv, type LedgerRow } from "@/lib/reports";

function Cell({ used, of }: { used: number; of: number }) {
  return (
    <span className="text-[14px] text-ink">
      <span className="font-bold">{used}</span>
      <span className="text-soft"> / {of}</span>
    </span>
  );
}

export function LeaveLedgerTable({
  rows,
  style,
}: {
  rows: LedgerRow[] | undefined;
  style?: CSSProperties;
}) {
  const list = rows ?? [];

  const exportCsv = () => {
    const headers = [
      "Warrior",
      "Department",
      "Casual used",
      "Casual entitled",
      "Sick used",
      "Sick entitled",
      "Earned used",
      "Earned available",
      "Comp-off available",
      "Days worked",
    ];
    const body = list.map((r) => {
      const c = balanceOf(r, "casual");
      const s = balanceOf(r, "sick");
      const e = balanceOf(r, "earned");
      const co = balanceOf(r, "comp_off");
      return [
        r.full_name,
        r.department ?? "",
        c?.used ?? 0,
        c?.entitled ?? 0,
        s?.used ?? 0,
        s?.entitled ?? 0,
        e?.used ?? 0,
        e?.balance ?? 0,
        co?.balance ?? 0,
        r.days_worked,
      ];
    });
    downloadCsv("leave-ledger.csv", toCsv(headers, body));
  };

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="ce-label">Leave</p>
          <h2 className="mt-1 font-display text-2xl text-ink">The ledger</h2>
          <p className="mt-1 text-[13px] text-soft">
            Earned leave grows with days worked — one more for every twenty.
          </p>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-full border border-line px-4 text-[13px] font-bold text-soft"
          onClick={exportCsv}
        >
          Export CSV
        </button>
      </div>

      <div className="mt-5 -mx-2 overflow-x-auto px-2">
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              {["Warrior", "Casual", "Sick", "Earned", "Comp-off", "Days worked"].map((h) => (
                <th
                  key={h}
                  className="py-2 pr-3 text-[11px] font-bold tracking-[0.1em] text-soft uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const c = balanceOf(r, "casual");
              const s = balanceOf(r, "sick");
              const e = balanceOf(r, "earned");
              const co = balanceOf(r, "comp_off");
              return (
                <tr key={r.profile_id} className="border-b border-line/60">
                  <td className="py-3 pr-3">
                    <p className="text-[14px] font-bold text-ink">{r.full_name}</p>
                    {r.department ? <p className="text-[12px] text-soft">{r.department}</p> : null}
                  </td>
                  <td className="py-3 pr-3">
                    <Cell used={c?.used ?? 0} of={c?.entitled ?? 0} />
                  </td>
                  <td className="py-3 pr-3">
                    <Cell used={s?.used ?? 0} of={s?.entitled ?? 0} />
                  </td>
                  <td className="py-3 pr-3">
                    <span className="text-[14px] text-ink">
                      <span className="font-bold">{e?.used ?? 0}</span>
                      <span className="text-soft"> used · {e?.balance ?? 0} left</span>
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-[14px] font-bold text-ink">{co?.balance ?? 0}</td>
                  <td className="py-3 pr-3 text-[14px] text-soft">{r.days_worked}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 ? (
          <p className="mt-4 text-sm text-soft">Nobody has taken leave yet.</p>
        ) : null}
      </div>
    </section>
  );
}
