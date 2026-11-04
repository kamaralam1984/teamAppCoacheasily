import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { errMsg } from "@/hooks/useDeveloper";
import { useMyProfile } from "@/hooks/useMyProfile";
import type { Json } from "@/integrations/supabase/types";
import { devListOrgs, devUpdateOrg } from "@/lib/developer.functions";
import { Card, Failed, Loading } from "./shared";

type Mode = "auto" | "diwali" | "off";

const OPTIONS: { value: Mode; label: string; help: string }[] = [
  { value: "auto", label: "Auto", help: "Diwali decorations show by themselves on the Diwali theme's days." },
  { value: "diwali", label: "Diwali on", help: "Show the Diwali decorations to everyone now." },
  { value: "off", label: "Off — reset to normal", help: "No decorations; the app looks as it always does." },
];

/** Switch the festive decorations for the whole company, or reset them to the normal look. */
export function DevFestive() {
  const qc = useQueryClient();
  const list = useServerFn(devListOrgs);
  const update = useServerFn(devUpdateOrg);
  const { data: me } = useMyProfile();
  const orgId = me?.profile?.org_id ?? null;
  const q = useQuery({ queryKey: ["dev-orgs"], queryFn: () => list() });
  const org = (q.data ?? []).find((o) => o.id === orgId) ?? null;
  const settings = (org?.settings && typeof org.settings === "object" && !Array.isArray(org.settings)
    ? org.settings
    : {}) as { [k: string]: Json };
  const current: Mode = settings["festive_decor"] === "diwali" ? "diwali" : settings["festive_decor"] === "off" ? "off" : "auto";

  const m = useMutation({
    mutationFn: (mode: Mode) => {
      if (!org) throw new Error("Your organisation isn't loaded yet.");
      const next = { ...settings };
      if (mode === "auto") delete next["festive_decor"];
      else next["festive_decor"] = mode;
      return update({ data: { id: org.id, name: org.name, logo_url: org.logo_url, settings: next } });
    },
    onSuccess: (_d, mode) => {
      toast.success(mode === "off" ? "Decorations off — back to normal" : mode === "diwali" ? "Diwali decorations on" : "Decorations follow the calendar");
      void qc.invalidateQueries({ queryKey: ["dev-orgs"] });
      void qc.invalidateQueries({ queryKey: ["org-settings"] });
      void qc.invalidateQueries({ queryKey: ["dev-audit"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (q.isLoading) return <Loading what="organisation" />;
  if (q.error || !org) return <Failed error={q.error ?? new Error("Organisation not found")} retry={() => void q.refetch()} />;

  return (
    <Card>
      <h2 className="font-display text-2xl text-ink">Festive theme</h2>
      <p className="mt-1 text-sm text-soft">
        Diwali decorations for everyone: lights, marigolds, lanterns, diyas and rangoli. Don't like
        them? Pick "Off" and the app goes back to its normal look straight away.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={m.isPending}
            aria-pressed={current === o.value}
            onClick={() => m.mutate(o.value)}
            className={`rounded-xl border p-3 text-left transition-colors ${
              current === o.value ? "border-gold bg-cream" : "border-line bg-white hover:bg-cream"
            }`}
          >
            <span className="block text-sm font-bold text-ink">
              {current === o.value ? "● " : ""}
              {o.label}
            </span>
            <span className="mt-0.5 block text-[12px] text-soft">{o.help}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
