import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { devOverview } from "@/lib/developer.functions";
import { Card, Failed, Loading } from "./shared";

export function DevOverview({ onOpenTable }: { onOpenTable: (t: string) => void }) {
  const fn = useServerFn(devOverview);
  const q = useQuery({ queryKey: ["dev-overview"], queryFn: () => fn() });
  if (q.isLoading) return <Loading what="overview" />;
  if (q.error || !q.data) return <Failed error={q.error} retry={() => void q.refetch()} />;
  const { people, punchesToday, counts } = q.data;
  const tiles = [
    ["People", people.total], ["Active", people.active], ["Exited", people.exited],
    ["With login", people.withLogin], ["Punches today", punchesToday],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map(([l, v]) => (
          <Card key={l}>
            <div className="text-xs font-bold tracking-wide text-soft uppercase">{l}</div>
            <div className="font-display text-3xl text-ink">{v}</div>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(people.byRole).map(([r, n]) => (
          <span key={r} className="rounded-full border border-border px-3 py-1 text-sm text-ink">{r}: {n}</span>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {counts.map((c) => (
          <button key={c.table} onClick={() => onOpenTable(c.table)} className="ce-card flex min-h-12 items-center justify-between px-4 text-left text-sm">
            <span className="font-semibold text-ink">{c.table}</span>
            <span className="text-soft">{c.count ?? "—"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
