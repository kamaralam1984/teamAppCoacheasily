import { useMemo, useState } from "react";

import type { ExportColumn, ExportRow } from "@/lib/exporters";
import { displayCell } from "@/lib/reportFormat";

/** Any report as a table. Click a heading to sort by it. */
export function ReportTable({ columns, rows }: { columns: ExportColumn[]; rows: ExportRow[] }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * sort.dir;
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * sort.dir;
    });
  }, [rows, sort]);

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead className="border-b border-line bg-cream text-soft">
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className="px-3 py-2 text-[11px] font-bold tracking-wider uppercase"
                >
                  <button
                    type="button"
                    className="min-h-9 text-left uppercase"
                    onClick={() =>
                      setSort(
                        active && sort.dir === -1 ? null : { key: c.key, dir: active ? -1 : 1 },
                      )
                    }
                  >
                    {c.label}
                    {active ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i} className="border-b border-line/60 odd:bg-white even:bg-cream/40">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-2 ${typeof row[c.key] === "number" ? "tabular-nums" : ""} ${
                    c.key === "name" || c.key === "group" ? "font-bold text-ink" : "text-ink"
                  }`}
                >
                  {displayCell(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 ? (
            <tr>
              <td className="px-3 py-4 text-soft" colSpan={columns.length}>
                Nothing in this range.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
