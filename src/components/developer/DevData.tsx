import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import type { Json } from "@/integrations/supabase/types";
import { devBrowse, devWriteRow } from "@/lib/developer.functions";
import { DEV_TABLES } from "@/lib/developerTables";
import { errMsg } from "@/hooks/useDeveloper";
import { Card, Failed, Loading } from "./shared";

type Row = { [k: string]: Json };

export function DevData({ table, onTable }: { table: string; onTable: (t: string) => void }) {
  const qc = useQueryClient();
  const browse = useServerFn(devBrowse);
  const write = useServerFn(devWriteRow);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{ row: Row | null; text: string } | null>(null);
  const q = useQuery({ queryKey: ["dev-browse", table, page], queryFn: () => browse({ data: { table, page } }) });
  const keys = q.data?.keys ?? ["id"];
  const keyOf = (r: Row) => Object.fromEntries(keys.map((k) => [k, String(r[k] ?? "")]));

  const m = useMutation({
    mutationFn: (v: { op: "insert" | "update" | "delete"; key?: Record<string, string>; values?: Row }) =>
      write({ data: { table, op: v.op, ...(v.key ? { key: v.key } : {}), ...(v.values ? { values: v.values } : {}) } }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["dev-browse", table] });
      void qc.invalidateQueries({ queryKey: ["dev-overview"] });
      void qc.invalidateQueries({ queryKey: ["dev-audit"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  function submit() {
    if (!editing) return;
    let parsed: Json;
    try { parsed = JSON.parse(editing.text) as Json; } catch { toast.error("That isn't valid JSON"); return; }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) { toast.error("Must be a JSON object"); return; }
    const obj = parsed as Row;
    if (editing.row) {
      const changed: Row = {};
      for (const [k, v] of Object.entries(obj)) if (JSON.stringify(editing.row[k]) !== JSON.stringify(v)) changed[k] = v;
      if (!Object.keys(changed).length) { toast.error("Nothing changed"); return; }
      m.mutate({ op: "update", key: keyOf(editing.row), values: changed });
    } else {
      m.mutate({ op: "insert", values: Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null)) });
    }
  }

  const cols = q.data?.rows[0] ? Object.keys(q.data.rows[0]) : [];
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select className="ce-input flex-1" value={table} onChange={(e) => { onTable(e.target.value); setPage(0); setEditing(null); }}>
          {DEV_TABLES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <button className="btn3d" onClick={() => setEditing({ row: null, text: "{\n  \n}" })}>Add row</button>
      </div>
      {editing && (
        <Card>
          <h3 className="font-semibold text-ink">{editing.row ? "Edit row" : "New row"}</h3>
          <textarea className="ce-input mt-2 w-full font-mono text-xs" rows={12} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
          <div className="mt-2 flex gap-2">
            <button className="btn3d" disabled={m.isPending} onClick={submit}>{m.isPending ? "Saving…" : "Save"}</button>
            <button className="btn3d btn3d-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </Card>
      )}
      {q.isLoading ? <Loading what={table} /> : q.error || !q.data ? <Failed error={q.error} retry={() => void q.refetch()} /> : (
        <Card className="overflow-x-auto">
          {q.data.rows.length === 0 ? <p className="text-sm text-soft">No rows.</p> : (
            <table className="w-full text-xs">
              <thead><tr>{["", ...cols].map((c) => <th key={c} className="px-2 py-1 text-left whitespace-nowrap text-soft">{c}</th>)}</tr></thead>
              <tbody>
                {q.data.rows.map((r, i) => (
                  <tr key={i} className="border-t border-border align-top">
                    <td className="px-2 py-1 whitespace-nowrap">
                      <button className="text-goldD underline" onClick={() => setEditing({ row: r, text: JSON.stringify(r, null, 2) })}>Edit</button>{" "}
                      <button className="text-destructive underline" onClick={() => { if (confirm("Delete this row? This cannot be undone.")) m.mutate({ op: "delete", key: keyOf(r) }); }}>Delete</button>
                    </td>
                    {cols.map((c) => (
                      <td key={c} className="max-w-[16rem] truncate px-2 py-1 text-ink" title={JSON.stringify(r[c])}>
                        {r[c] === null ? "∅" : typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-3 flex items-center gap-2 text-sm">
            <button className="btn3d btn3d-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
            <span className="text-soft">Page {page + 1} of {pages} · {q.data.total} rows</span>
            <button className="btn3d btn3d-ghost" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </Card>
      )}
    </div>
  );
}
