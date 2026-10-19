import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { devAuditLog } from "@/lib/developer.functions";
import { Card, Failed, Loading } from "./shared";

export function DevAudit() {
  const fn = useServerFn(devAuditLog);
  const q = useQuery({ queryKey: ["dev-audit"], queryFn: () => fn() });
  if (q.isLoading) return <Loading what="audit log" />;
  if (q.error || !q.data) return <Failed error={q.error} retry={() => void q.refetch()} />;
  if (q.data.missing) return <Card><p className="text-sm text-soft">The audit log table hasn't been set up yet — the migration hasn't been applied.</p></Card>;
  if (!q.data.rows.length) return <Card><p className="text-sm text-soft">No developer actions logged yet.</p></Card>;
  return (
    <div className="space-y-2">
      {q.data.rows.map((r) => (
        <Card key={r.id}>
          <div className="text-sm font-semibold text-ink">{r.action}</div>
          <div className="text-xs text-soft break-all">{r.target ?? "—"} · {r.actor_email} · {new Date(r.created_at).toLocaleString()}</div>
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-goldD">Detail</summary>
            <pre className="mt-1 overflow-x-auto text-xs whitespace-pre-wrap break-all">{JSON.stringify(r.detail, null, 2)}</pre>
          </details>
        </Card>
      ))}
    </div>
  );
}
