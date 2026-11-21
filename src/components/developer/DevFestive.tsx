import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { errMsg } from "@/hooks/useDeveloper";
import { XMAS_EXTRAS, type XmasExtra } from "@/components/festive/ChristmasSide";
import { useMyProfile } from "@/hooks/useMyProfile";
import type { Json } from "@/integrations/supabase/types";
import { devListOrgs, devUpdateOrg } from "@/lib/developer.functions";
import { Card, Failed, Loading } from "./shared";

type Mode = "auto" | "diwali" | "christmas" | "off";

const OPTIONS: { value: Mode; label: string; help: string }[] = [
  {
    value: "auto",
    label: "Auto",
    help: "Decorations show by themselves: Diwali on its theme's days, Christmas 18–31 Dec.",
  },
  { value: "diwali", label: "Diwali on", help: "Show the Diwali decorations to everyone now." },
  {
    value: "christmas",
    label: "Christmas on",
    help: "Snow on every button, Santa, lights and gold-silver lines for everyone now.",
  },
  {
    value: "off",
    label: "Off — reset to normal",
    help: "No decorations; the app looks as it always does.",
  },
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
  const settings = (
    org?.settings && typeof org.settings === "object" && !Array.isArray(org.settings)
      ? org.settings
      : {}
  ) as { [k: string]: Json };
  const raw = settings["festive_decor"];
  const current: Mode = raw === "diwali" || raw === "christmas" || raw === "off" ? raw : "auto";

  const rawExtras = settings["xmas_extras"];
  const extras: XmasExtra[] = Array.isArray(rawExtras)
    ? XMAS_EXTRAS.map((e) => e.value).filter((v) => rawExtras.includes(v))
    : [];

  const ex = useMutation({
    mutationFn: (next: XmasExtra[]) => {
      if (!org) throw new Error("Your organisation isn't loaded yet.");
      const s = { ...settings };
      if (next.length) s["xmas_extras"] = next;
      else delete s["xmas_extras"];
      return update({ data: { id: org.id, name: org.name, logo_url: org.logo_url, settings: s } });
    },
    onSuccess: () => {
      toast.success("Christmas extras saved");
      void qc.invalidateQueries({ queryKey: ["dev-orgs"] });
      void qc.invalidateQueries({ queryKey: ["org-settings"] });
      void qc.invalidateQueries({ queryKey: ["dev-audit"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const m = useMutation({
    mutationFn: (mode: Mode) => {
      if (!org) throw new Error("Your organisation isn't loaded yet.");
      const next = { ...settings };
      if (mode === "auto") delete next["festive_decor"];
      else next["festive_decor"] = mode;
      return update({
        data: { id: org.id, name: org.name, logo_url: org.logo_url, settings: next },
      });
    },
    onSuccess: (_d, mode) => {
      toast.success(
        mode === "off"
          ? "Decorations off — back to normal"
          : mode === "diwali"
            ? "Diwali decorations on"
            : mode === "christmas"
              ? "Christmas decorations on"
              : "Decorations follow the calendar",
      );
      void qc.invalidateQueries({ queryKey: ["dev-orgs"] });
      void qc.invalidateQueries({ queryKey: ["org-settings"] });
      void qc.invalidateQueries({ queryKey: ["dev-audit"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (q.isLoading) return <Loading what="organisation" />;
  if (q.error || !org)
    return (
      <Failed
        error={q.error ?? new Error("Organisation not found")}
        retry={() => void q.refetch()}
      />
    );

  return (
    <Card>
      <h2 className="font-display text-2xl text-ink">Festive theme</h2>
      <p className="mt-1 text-sm text-soft">
        Festive decorations for everyone — Diwali (lights, marigolds, diyas, rangoli) or Christmas
        (falling snow that settles on buttons, Santa, gold and silver lines). Don't like them? Pick
        "Off" and the app goes back to its normal look straight away.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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

      <h3 className="mt-6 font-display text-lg text-ink">Christmas extras — right side</h3>
      <p className="mt-1 text-sm text-soft">
        Fill the empty space to the right of the page on wide screens. Switch on any mix; each one
        sizes itself to the free space and hides when there isn't enough. They show only while
        Christmas decorations are on.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {XMAS_EXTRAS.map((e) => {
          const on = extras.includes(e.value);
          return (
            <button
              key={e.value}
              type="button"
              role="switch"
              aria-checked={on}
              disabled={ex.isPending}
              onClick={() =>
                ex.mutate(on ? extras.filter((v) => v !== e.value) : [...extras, e.value])
              }
              className={`rounded-xl border p-3 text-left transition-colors ${
                on ? "border-gold bg-cream" : "border-line bg-white hover:bg-cream"
              }`}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-bold text-ink">
                {e.label}
                <span
                  aria-hidden
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-gold" : "bg-line"}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`}
                  />
                </span>
              </span>
              <span className="mt-0.5 block text-[12px] text-soft">{e.help}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
