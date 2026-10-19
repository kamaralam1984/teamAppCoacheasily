import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import type { Json } from "@/integrations/supabase/types";
import { devListOrgs, devUpdateOrg } from "@/lib/developer.functions";
import { ORG_SETTING_KEYS } from "@/lib/developerTables";
import { errMsg } from "@/hooks/useDeveloper";
import { Card, Failed, Loading } from "./shared";

type Org = Awaited<ReturnType<typeof devListOrgs>>[number];

export function DevOrganisation() {
  const fn = useServerFn(devListOrgs);
  const q = useQuery({ queryKey: ["dev-orgs"], queryFn: () => fn() });
  if (q.isLoading) return <Loading what="organisations" />;
  if (q.error || !q.data) return <Failed error={q.error} retry={() => void q.refetch()} />;
  return <div className="space-y-3">{q.data.map((o) => <OrgEditor key={o.id} org={o} />)}</div>;
}

function OrgEditor({ org }: { org: Org }) {
  const qc = useQueryClient();
  const update = useServerFn(devUpdateOrg);
  const [name, setName] = useState(org.name);
  const [logo, setLogo] = useState(org.logo_url ?? "");
  const [text, setText] = useState(JSON.stringify(org.settings, null, 2));
  useEffect(() => setText(JSON.stringify(org.settings, null, 2)), [org.settings]);
  const m = useMutation({
    mutationFn: () => {
      let s: Json;
      try { s = JSON.parse(text) as Json; } catch { throw new Error("Settings isn't valid JSON"); }
      if (!s || typeof s !== "object" || Array.isArray(s)) throw new Error("Settings must be a JSON object");
      return update({ data: { id: org.id, name, logo_url: logo || null, settings: s as { [k: string]: Json } } });
    },
    onSuccess: () => {
      toast.success("Organisation saved");
      void qc.invalidateQueries({ queryKey: ["dev-orgs"] });
      void qc.invalidateQueries({ queryKey: ["org-settings"] });
      void qc.invalidateQueries({ queryKey: ["dev-audit"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Card>
      <div className="grid gap-2">
        <label className="text-xs font-bold text-soft uppercase">Name</label>
        <input className="ce-input" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="text-xs font-bold text-soft uppercase">Logo URL</label>
        <input className="ce-input" value={logo} onChange={(e) => setLogo(e.target.value)} />
        <label className="text-xs font-bold text-soft uppercase">Settings (JSON)</label>
        <textarea className="ce-input font-mono text-xs" rows={14} value={text} onChange={(e) => setText(e.target.value)} />
        <p className="text-xs text-soft">Known keys: {ORG_SETTING_KEYS.join(", ")}</p>
        <button className="btn3d w-full sm:w-auto" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Saving…" : "Save"}</button>
      </div>
    </Card>
  );
}
