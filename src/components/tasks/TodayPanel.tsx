import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toPng } from "html-to-image";

import { Mark } from "@/components/Mark";
import { useCloseDay, useCommitDay, useMyDay } from "@/hooks/useDay";
import { useUpdateTask } from "@/hooks/useTasks";
import { CARRY_COACHING, carriedLine, prettyLongDate, type DayTask, type MyDay } from "@/lib/day";
import type { Profile } from "@/hooks/useMyProfile";

const ROLE_LABEL: Record<string, string> = {
  manager: "Manager",
  hr: "HR",
  admin: "Admin",
};

export function TodayPanel({
  profile,
  onAddTask,
  adding,
}: {
  profile: Profile;
  onAddTask: (title: string) => void;
  adding?: boolean;
}) {
  const qc = useQueryClient();
  const { data: day, isLoading } = useMyDay(true);
  const commit = useCommitDay();
  const close = useCloseDay();
  const update = useUpdateTask();

  const [picked, setPicked] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [closing, setClosing] = useState(false);
  const [carryNote, setCarryNote] = useState("");
  const [result, setResult] = useState<{ done: number; total: number; pct: number; carried: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const morningRef = useRef<HTMLDivElement | null>(null);
  const eveningRef = useRef<HTMLDivElement | null>(null);

  const cap = day?.cap ?? 3;
  const suggested = useMemo(
    () => (day?.available ?? []).filter((t) => t.repeats !== "none").map((t) => t.id),
    [day],
  );
  const selection = useMemo(() => {
    if (picked.length > 0) return picked;
    return suggested.slice(0, cap);
  }, [picked, suggested, cap]);

  const togglePick = (id: string) => {
    const base = selection;
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    if (next.length > cap) return;
    setPicked(next);
  };

  const tickTask = (task: DayTask) => {
    update.mutate(
      { id: task.id, patch: { done: !task.done } },
      { onSettled: () => void qc.invalidateQueries({ queryKey: ["my-day"] }) },
    );
  };

  const download = async (which: "morning" | "evening") => {
    const node = which === "morning" ? morningRef.current : eveningRef.current;
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
      a.download = `coacheasily-${which}-${day?.day ?? ""}-${first}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  };

  const committed = Boolean(day?.committed_at);
  const closed = Boolean(day?.closed_at);

  return (
    <section className="ce-rise ce-card p-6">
      <p className="ce-label">Today</p>

      {isLoading || !day ? (
        <p className="mt-2 text-sm text-soft">Loading your day…</p>
      ) : closed || result ? (
        <ClosedState day={day} result={result} note={carryNote || day.note || ""} />
      ) : committed ? (
        <div className="mt-2">
          <h2 className="font-display text-2xl leading-tight text-ink">
            {day.done} of {day.total} done
          </h2>
          <p className="mt-1 text-[13px] text-soft">{prettyLongDate(day.day)}</p>

          <ul className="mt-4 space-y-2.5">
            {day.tasks.map((t) => (
              <li key={t.id} className="rounded-[12px] border border-line bg-ivory p-3.5">
                <div className="flex gap-3">
                  <button
                    type="button"
                    aria-label={t.done ? `Reopen ${t.title}` : `Complete ${t.title}`}
                    onClick={() => tickTask(t)}
                    className={
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors " +
                      (t.done
                        ? "border-emer bg-emer text-white"
                        : "border-line bg-white hover:border-gold")
                    }
                  >
                    {t.done ? <span aria-hidden>✓</span> : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        "text-[15px] leading-snug font-semibold " +
                        (t.done ? "text-soft line-through" : "text-ink")
                      }
                    >
                      {t.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {t.goal_name ? (
                        <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-goldD">
                          {t.goal_name}
                        </span>
                      ) : null}
                      {carriedLine(t.carried_count) ? (
                        <span className="text-[11px] font-semibold text-soft">
                          {carriedLine(t.carried_count)}
                        </span>
                      ) : null}
                    </div>
                    {t.carried_count >= 3 ? (
                      <p className="mt-1.5 text-[12px] leading-relaxed text-soft">
                        {CARRY_COACHING}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {closing ? (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-[13px] font-bold text-ink">
                  What is carrying forward, and why?
                </span>
                <textarea
                  className="ce-input mt-2 min-h-20"
                  value={carryNote}
                  onChange={(e) => setCarryNote(e.target.value)}
                  placeholder="One honest line is enough."
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn3d"
                  disabled={close.isPending}
                  onClick={() =>
                    close.mutate(carryNote, {
                      onSuccess: (r) => {
                        setResult(r);
                        setClosing(false);
                      },
                    })
                  }
                >
                  {close.isPending ? "Closing…" : "Close the day"}
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-full border border-line bg-ivory px-4 text-[13px] font-bold text-ink"
                  onClick={() => setClosing(false)}
                >
                  Not yet
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className="btn3d" onClick={() => setClosing(true)}>
                Close the day
              </button>
              <button
                type="button"
                className="min-h-11 rounded-full border border-line bg-ivory px-4 text-[13px] font-bold text-ink"
                disabled={busy}
                onClick={() => void download("morning")}
              >
                {busy ? "Preparing…" : "Download image"}
              </button>
            </div>
          )}
          <p className="mt-1 text-[12px] text-soft">Download and share it in the team group.</p>
        </div>
      ) : (
        <div className="mt-2">
          <h2 className="font-display text-2xl leading-tight text-ink">
            {cap === 1
              ? "What is the one thing that matters today?"
              : `What are the ${countWord(cap)} things that matter today?`}
          </h2>
          <p className="mt-1 text-[13px] text-soft">
            {selection.length} of {cap} chosen · {prettyLongDate(day.day)}
          </p>

          <ul className="mt-4 space-y-2.5">
            {day.available.map((t) => {
              const on = selection.includes(t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => togglePick(t.id)}
                    className={
                      "flex w-full gap-3 rounded-[12px] border p-3.5 text-left " +
                      (on ? "border-gold bg-cream/60" : "border-line bg-ivory")
                    }
                  >
                    <span
                      aria-hidden
                      className={
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 " +
                        (on ? "border-emer bg-emer text-white" : "border-line bg-white")
                      }
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] leading-snug font-semibold text-ink">
                        {t.title}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {t.repeats !== "none" ? (
                          <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-soft">
                            every day
                          </span>
                        ) : null}
                        {t.goal_name ? (
                          <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-goldD">
                            {t.goal_name}
                          </span>
                        ) : null}
                        {carriedLine(t.carried_count) ? (
                          <span className="text-[11px] font-semibold text-soft">
                            {carriedLine(t.carried_count)}
                          </span>
                        ) : null}
                      </span>
                      {t.carried_count >= 3 ? (
                        <span className="mt-1.5 block text-[12px] leading-relaxed text-soft">
                          {CARRY_COACHING}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex gap-2">
            <input
              className="ce-input flex-1"
              placeholder="Something else you must do today…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTitle.trim()) {
                  onAddTask(newTitle.trim());
                  setNewTitle("");
                }
              }}
            />
            <button
              type="button"
              className="min-h-11 shrink-0 rounded-full border border-line bg-ivory px-4 text-[13px] font-bold text-ink"
              disabled={adding || !newTitle.trim()}
              onClick={() => {
                if (!newTitle.trim()) return;
                onAddTask(newTitle.trim());
                setNewTitle("");
              }}
            >
              Add
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn3d"
              disabled={commit.isPending || selection.length === 0}
              onClick={() => commit.mutate(selection)}
            >
              {commit.isPending ? "Committing…" : `Commit to ${selection.length}`}
            </button>
            {selection.length >= cap ? (
              <span className="text-[12px] font-semibold text-soft">
                That is the cap. Fewer, finished, beats more, started.
              </span>
            ) : null}
          </div>
          {commit.isError ? (
            <p className="mt-2 text-[13px] font-bold" style={{ color: "var(--ce-red)" }}>
              Could not commit — try again.
            </p>
          ) : null}
        </div>
      )}

      {day && committed ? (
        <div className="mt-3">
          <button
            type="button"
            className="min-h-11 rounded-full border border-line bg-ivory px-4 text-[13px] font-bold text-ink"
            disabled={busy}
            onClick={() => void download("evening")}
          >
            {busy ? "Preparing…" : "Download evening card"}
          </button>
        </div>
      ) : null}

      {/* posters — off-screen, never part of the page */}
      {day ? (
        <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
          <Poster
            innerRef={morningRef}
            profile={profile}
            day={day}
            kind="morning"
            note={carryNote || day.note || ""}
            result={result}
          />
          <Poster
            innerRef={eveningRef}
            profile={profile}
            day={day}
            kind="evening"
            note={carryNote || day.note || ""}
            result={result}
          />
        </div>
      ) : null}
    </section>
  );
}

function ClosedState({
  day,
  result,
  note,
}: {
  day: MyDay;
  result: { done: number; total: number; pct: number; carried: number } | null;
  note: string;
}) {
  const done = result?.done ?? day.done;
  const total = result?.total ?? day.total;
  const pct = result?.pct ?? 0;
  return (
    <div className="mt-2">
      <h2 className="font-display text-2xl leading-tight text-ink">Day closed</h2>
      <p className="mt-1 text-[13px] text-soft">{prettyLongDate(day.day)}</p>
      <p className="mt-3 text-[15px] font-semibold text-ink">
        {done} of {total} finished{result ? ` · ${pct}%` : ""}
        {result && result.carried > 0
          ? ` · ${result.carried} carrying forward`
          : ""}
      </p>
      {note.trim() ? (
        <p className="mt-2 text-[13px] leading-relaxed text-soft">“{note.trim()}”</p>
      ) : null}
      <p className="mt-3 text-[12px] text-soft">Download and share it in the team group.</p>
    </div>
  );
}

function Poster({
  innerRef,
  profile,
  day,
  kind,
  note,
  result,
}: {
  innerRef: React.RefObject<HTMLDivElement | null>;
  profile: Profile;
  day: MyDay;
  kind: "morning" | "evening";
  note: string;
  result: { done: number; total: number; pct: number; carried: number } | null;
}) {
  const roleLabel = ROLE_LABEL[profile.role] ?? "";
  const subtitle = [profile.title, roleLabel].filter(Boolean).join(" · ");
  const pct = result?.pct ?? null;

  return (
    <div
      ref={innerRef}
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
        {subtitle ? <p style={{ fontSize: 15, opacity: 0.75, marginTop: 4 }}>{subtitle}</p> : null}
        <p style={{ fontSize: 15, marginTop: 10, color: "var(--ce-goldL)" }}>
          {prettyLongDate(day.day)}
        </p>
      </div>

      <p style={{ fontSize: 13, letterSpacing: 1.5, marginTop: 26, opacity: 0.7 }}>
        {kind === "morning" ? "TODAY I AM COMMITTING TO" : "HOW THE DAY WENT"}
      </p>

      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        {day.tasks.map((t) => (
          <div
            key={t.id}
            style={{
              borderRadius: 16,
              padding: 16,
              background: "rgba(255,253,247,0.06)",
              border: "1px solid rgba(240,199,94,0.25)",
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            {kind === "evening" ? (
              <span style={{ fontSize: 20, color: t.done ? "var(--ce-goldL)" : "rgba(255,253,247,0.35)" }}>
                {t.done ? "✓" : "○"}
              </span>
            ) : null}
            <div>
              <p style={{ fontSize: 19, fontWeight: 800 }}>{t.title}</p>
              {t.goal_name ? (
                <p style={{ fontSize: 13, marginTop: 4, color: "var(--ce-goldL)" }}>{t.goal_name}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {kind === "evening" && pct !== null ? (
        <p style={{ fontFamily: '"Rozha One", serif', fontSize: 34, marginTop: 24 }}>
          {result?.done} of {result?.total} finished · {pct}%
        </p>
      ) : null}

      {kind === "evening" && note.trim() ? (
        <div style={{ marginTop: 22, borderLeft: "3px solid var(--ce-goldL)", paddingLeft: 16 }}>
          <p style={{ fontSize: 12, letterSpacing: 1, opacity: 0.65 }}>CARRYING FORWARD</p>
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
  );
}
