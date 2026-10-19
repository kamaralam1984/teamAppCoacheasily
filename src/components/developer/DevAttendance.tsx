import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { devAddPunch, devAttendance, devListUsers, devWriteRow } from "@/lib/developer.functions";
import { istToday } from "@/lib/developerTables";
import { errMsg } from "@/hooks/useDeveloper";
import { Card, Failed, Loading } from "./shared";

export function DevAttendance() {
  const qc = useQueryClient();
  const users = useServerFn(devListUsers);
  const list = useServerFn(devAttendance);
  const add = useServerFn(devAddPunch);
  const write = useServerFn(devWriteRow);
  const [pid, setPid] = useState("");
  const [date, setDate] = useState(istToday());
  const u = useQuery({ queryKey: ["dev-users"], queryFn: () => users() });
  const a = useQuery({ queryKey: ["dev-attendance", pid], enabled: Boolean(pid), queryFn: () => list({ data: { profileId: pid } }) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["dev-attendance", pid] });
    void qc.invalidateQueries({ queryKey: ["dev-overview"] });
    void qc.invalidateQueries({ queryKey: ["dev-audit"] });
  };
  const addM = useMutation({
    mutationFn: () => add({ data: { profileId: pid, date } }),
    onSuccess: () => { toast.success("Punch added"); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const delM = useMutation({
    mutationFn: (id: string) => write({ data: { table: "attendance", op: "delete", key: { id } } }),
    onSuccess: () => { toast.success("Punch removed"); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (u.isLoading) return <Loading what="people" />;
  if (u.error || !u.data) return <Failed error={u.error} retry={() => void u.refetch()} />;
  return (
    <div className="space-y-3">
      <select className="ce-input w-full" value={pid} onChange={(e) => setPid(e.target.value)}>
        <option value="">Pick a warrior</option>
        {u.data.rows.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select>
      {pid && (
        <>
          <Card>
            <div className="flex flex-wrap gap-2">
              <input type="date" className="ce-input flex-1" max={istToday()} value={date} onChange={(e) => setDate(e.target.value)} />
              <button className="btn3d" disabled={addM.isPending || !date} onClick={() => addM.mutate()}>Add missed day</button>
            </div>
          </Card>
          {a.isLoading ? <Loading what="punches" /> : a.error ? <Failed error={a.error} retry={() => void a.refetch()} /> : (
            <Card>
              {(a.data ?? []).length === 0 ? <p className="text-sm text-soft">No punches yet.</p> : (a.data ?? []).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 border-b border-border py-2 text-sm last:border-0">
                  <span>
                    <span className="font-semibold text-ink">{r.date}</span>{" "}
                    <span className="text-soft">{new Date(r.marked_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} · {r.on_time ? "on time" : "late"}{r.focus ? ` · ${r.focus}` : ""}</span>
                  </span>
                  <button className="btn3d btn3d-ghost" disabled={delM.isPending} onClick={() => { if (confirm(`Remove the punch on ${r.date}?`)) delM.mutate(r.id); }}>Remove</button>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
