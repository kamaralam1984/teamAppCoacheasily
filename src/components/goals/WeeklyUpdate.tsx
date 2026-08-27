import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toPng } from "html-to-image";

import { Mark } from "@/components/Mark";
import { ProgressNumbers } from "@/components/goals/ProgressNumbers";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/hooks/useMyProfile";
import { addDays, fmt, progressWords, type Cycle, type GoalWithProgress } from "@/lib/goals";

/* ── week, always Mumbai time ──────────────────────────────── */

function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Monday of the current week in India time. */
function weekStartIst(): string {
  const today = istToday();
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(today, -back);
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const ROLE_LABEL: Record<string, string> = {
  manager: "Manager",
  hr: "HR",
  admin: "Admin",
};

function currentOf(item: GoalWithProgress): number {
  const p = item.progress;
  if (!p) return item.goal.baseline;
  return p.current_value;
}

function pctOf(item: GoalWithProgress): number {
  return Math.max(0, Math.min(100, item.progress?.pct ?? 0));
}

/* ── data ──────────────────────────────────────────────────── */

function useWeeklyNote(profileId: string | null, weekStart: string) {
  return useQuery({
    queryKey: ["weekly-review", profileId, weekStart],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from("weekly_reviews")
        .select("note")
        .eq("profile_id", profileId!)
        .eq("week_start", weekStart)
        .maybeSingle();
      if (error) throw error;
      return data?.note ?? "";
    },
  });
}

function useSaveWeeklyNote(weekStart: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note: string) => {
      const { error } = await supabase.rpc("save_weekly_review", {
        p_note: note,
        p_week_start: weekStart,
      });
      if (error) throw error;
    },
    // The note is on screen already — show it saved, roll back if it fails.
    onMutate: async (note: string) => {
      await qc.cancelQueries({ queryKey: ["weekly-review"] });
      const snapshot = qc.getQueriesData<string>({ queryKey: ["weekly-review"] });
      for (const [key] of snapshot) qc.setQueryData(key, note);
      return { snapshot };
    },
    onError: (_error, _vars, context) => {
      for (const [key, value] of context?.snapshot ?? []) qc.setQueryData(key, value);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["weekly-review"] });
    },
  });
}

/* ── the card ──────────────────────────────────────────────── */

export function WeeklyUpdate({
  profile,
  cycle,
  goals,
  style,
}: {
  profile: Profile;
  cycle: Cycle;
  goals: GoalWithProgress[];
  style?: React.CSSProperties;
}) {
  const weekStart = useMemo(() => weekStartIst(), []);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const { data: savedNote } = useWeeklyNote(profile.id, weekStart);
  const save = useSaveWeeklyNote(weekStart);

  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const posterRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!touched && typeof savedNote === "string") setNote(savedNote);
  }, [savedNote, touched]);

  /* the Monday prompt lands people exactly here */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.search.includes("review=1")) return;
    const t = window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => window.clearTimeout(t);
  }, []);

  const commit = () => {
    if (!touched) return;
    save.mutate(note, {
      onSuccess: () => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2500);
      },
    });
  };

  const download = async () => {
    const node = posterRef.current;
    if (!node) return;
    setBusy(true);
    try {
      const url = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#171126",
      });
      const first = (profile.full_name ?? "warrior").split(" ")[0]?.toLowerCase() ?? "warrior";
      const a = document.createElement("a");
      a.href = url;
      a.download = `coacheasily-week-${weekEnd}-${first}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  };

  const roleLabel = ROLE_LABEL[profile.role] ?? "";
  const subtitle = [profile.title, roleLabel].filter(Boolean).join(" · ");

  return (
    <section ref={sectionRef} id="this-week" className="ce-rise ce-card p-6" style={style}>
      <header>
        <p className="text-[12px] font-bold uppercase tracking-wide text-soft">This week</p>
        <h2 className="font-display text-2xl text-ink">
          {profile.full_name} · {cycle.name}
        </h2>
        <p className="mt-1 text-[13px] text-soft">Week ending {prettyDate(weekEnd)}</p>
      </header>

      {goals.length === 0 ? (
        <p className="mt-4 text-[13px] text-soft">
          No goals written for this cycle yet — write one below and it will appear here.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {goals.map((item) => (
            <li key={item.goal.id} className="rounded-[12px] border border-line bg-cream/50 p-3">
              <p className="text-sm font-bold text-ink">{item.goal.name}</p>
              <ProgressNumbers progress={item.progress} className="mt-1" />
              {item.goal.metric ? (
                <p className="text-[12px] text-soft">{item.goal.metric}</p>
              ) : null}
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <Figure label="Started at" value={fmt(item.goal.baseline)} unit={item.goal.unit} />
                <Figure label="Now" value={fmt(currentOf(item))} unit={item.goal.unit} />
                <Figure label="Going to" value={fmt(item.goal.target)} unit={item.goal.unit} />
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pctOf(item)}%`, background: "var(--ce-gold)" }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <label className="mt-5 block">
        <span className="text-[13px] font-bold text-ink">
          What I will do this week to move these numbers
        </span>
        <textarea
          className="mt-2 w-full rounded-[12px] border border-line bg-ivory p-3 text-base text-ink"
          rows={3}
          value={note}
          onChange={(e) => {
            setTouched(true);
            setNote(e.target.value);
          }}
          onBlur={commit}
          placeholder="One line is enough."
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn3d" disabled={save.isPending} onClick={commit}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="min-h-11 rounded-full border border-line bg-ivory px-4 text-[13px] font-bold text-ink"
          disabled={busy}
          onClick={() => void download()}
        >
          {busy ? "Preparing…" : "Download image"}
        </button>
        {saved ? (
          <span className="text-[13px] font-bold" style={{ color: "var(--ce-emer)" }}>
            Saved
          </span>
        ) : null}
        {save.isError ? (
          <span className="text-[13px] font-bold" style={{ color: "var(--ce-red)" }}>
            Could not save — try again.
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[12px] text-soft">Download and share it in the team group.</p>

      {/* the shareable poster — rendered off-screen, never part of the page */}
      <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
        <div
          ref={posterRef}
          style={{
            width: 720,
            padding: 48,
            background: "linear-gradient(160deg, var(--ce-night) 0%, var(--ce-night2) 100%)",
            fontFamily: "Manrope, system-ui, sans-serif",
            color: "#fffdf7",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Mark size={40} color="var(--ce-goldL)" />
            <span
              style={{
                fontFamily: '"Rozha One", serif',
                fontSize: 28,
                letterSpacing: 0.5,
                color: "var(--ce-goldL)",
              }}
            >
              CoachEasily
            </span>
          </div>

          <div style={{ marginTop: 28 }}>
            <p style={{ fontFamily: '"Rozha One", serif', fontSize: 38, lineHeight: 1.1 }}>
              {profile.full_name}
            </p>
            {subtitle ? (
              <p style={{ fontSize: 15, opacity: 0.75, marginTop: 4 }}>{subtitle}</p>
            ) : null}
            <p style={{ fontSize: 15, marginTop: 10, color: "var(--ce-goldL)" }}>
              {cycle.name} · week ending {prettyDate(weekEnd)}
            </p>
          </div>

          <div style={{ marginTop: 28, display: "grid", gap: 16 }}>
            {goals.map((item) => (
              <div
                key={item.goal.id}
                style={{
                  borderRadius: 16,
                  padding: 18,
                  background: "rgba(255,253,247,0.06)",
                  border: "1px solid rgba(240,199,94,0.25)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <p style={{ fontSize: 19, fontWeight: 800 }}>{item.goal.name}</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: "var(--ce-goldL)" }}>
                    {progressWords(item.progress).lead}
                  </p>
                </div>
                {item.goal.metric ? (
                  <p style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>{item.goal.metric}</p>
                ) : null}
                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 10,
                    textAlign: "center",
                  }}
                >
                  {[
                    ["Started at", fmt(item.goal.baseline)],
                    ["Now", fmt(currentOf(item))],
                    ["Going to", fmt(item.goal.target)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p style={{ fontSize: 11, letterSpacing: 1, opacity: 0.65 }}>
                        {String(label).toUpperCase()}
                      </p>
                      <p style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>
                        {value}
                        {item.goal.unit ? (
                          <span style={{ fontSize: 12, opacity: 0.7 }}> {item.goal.unit}</span>
                        ) : null}
                      </p>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: 14,
                    height: 10,
                    borderRadius: 999,
                    background: "rgba(255,253,247,0.12)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pctOf(item)}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: "linear-gradient(90deg, var(--ce-gold), var(--ce-goldL))",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {note.trim() ? (
            <div
              style={{
                marginTop: 26,
                borderLeft: "3px solid var(--ce-goldL)",
                paddingLeft: 16,
              }}
            >
              <p style={{ fontSize: 12, letterSpacing: 1, opacity: 0.65 }}>THIS WEEK</p>
              <p style={{ fontSize: 18, lineHeight: 1.45, marginTop: 6 }}>{note.trim()}</p>
            </div>
          ) : null}

          <p
            style={{
              marginTop: 34,
              fontSize: 13,
              letterSpacing: 2,
              textAlign: "center",
              color: "var(--ce-goldL)",
              opacity: 0.85,
            }}
          >
            HONESTY · DEDICATION · GENUINE CARE
          </p>
        </div>
      </div>
    </section>
  );
}

function Figure({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string | null;
}) {
  return (
    <div className="rounded-[10px] bg-ivory px-2 py-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-soft">{label}</p>
      <p className="text-base font-bold text-ink">
        {value}
        {unit ? <span className="text-[11px] font-normal text-soft"> {unit}</span> : null}
      </p>
    </div>
  );
}
