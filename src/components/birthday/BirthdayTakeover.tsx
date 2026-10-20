import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

import { Fireworks } from "@/components/birthday/Fireworks";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWarriors } from "@/hooks/useWarriors";
import { birthdayPlan, birthdaySeenKey, firstName, istToday } from "@/lib/birthdays";
import type { Profile } from "@/lib/warriors";

const SAMPLE_COLLEAGUE = {
  id: "preview",
  full_name: "Sample Colleague",
  title: "Preview only",
  department: "Technology",
} as unknown as Profile;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function seen(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markSeen(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* private window: it will simply show again on the next open */
  }
}

/**
 * On a birthday the app opens on a full-screen "Happy Birthday" for the person whose day it is, with sparks
 * and fireworks. Everyone, on opening the app, is also told whose birthday it is today. Once per person per
 * day per browser tab, so moving around the app never brings it back.
 */
export function BirthdayTakeover({
  me,
  showTeam,
}: {
  me: Profile | null;
  /** the organisation's "show team birthdays" switch */
  showTeam: boolean;
}) {
  const { data: roster } = useWarriors();
  const today = istToday();
  const plan = useMemo(
    () => birthdayPlan(me, roster ?? [], today, showTeam),
    [me, roster, today, showTeam],
  );
  const key = me ? birthdaySeenKey(me.id, today) : null;

  const [stage, setStage] = useState<"idle" | "mine" | "others">("idle");
  const decided = useRef(false);

  /** Adding ?birthday=preview to any address shows both screens without touching anybody's data. */
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("birthday") === "preview") {
      setPreview(true);
      setStage("mine");
    }
  }, []);
  const others = preview ? [SAMPLE_COLLEAGUE] : plan.others;

  useEffect(() => {
    if (preview || decided.current || !me || !key) return;
    if (!plan.mine && plan.others.length === 0) return;
    decided.current = true;
    if (seen(key)) return;
    markSeen(key);
    setStage(plan.mine ? "mine" : "others");
  }, [me, key, plan, preview]);

  const closeMine = useCallback(() => {
    setStage(others.length > 0 ? "others" : "idle");
  }, [others.length]);

  if (stage === "mine" && me) {
    return <FullScreenGreeting name={firstName(me.full_name)} onClose={closeMine} />;
  }

  return (
    <Dialog
      open={stage === "others"}
      onOpenChange={(open) => (!open ? setStage("idle") : undefined)}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl border-gold/50 bg-ivory sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-ink">
            🎂 {others.length === 1 ? "A birthday today" : "Birthdays today"}
          </DialogTitle>
        </DialogHeader>
        <ul className="space-y-2">
          {others.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5"
            >
              <span aria-hidden className="text-2xl">
                🎉
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-ink">
                  {p.full_name}
                </span>
                <span className="block truncate text-[12px] text-soft">
                  {[p.title, p.department].filter(Boolean).join(" · ") || "CoachEasily"}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[13px] leading-relaxed text-soft">
          A kind word goes a long way. You can send your wishes from the dashboard.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Link to="/dashboard" onClick={() => setStage("idle")} className="btn3d">
            Send wishes
          </Link>
          <button type="button" className="btn3d btn3d-ghost" onClick={() => setStage("idle")}>
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FullScreenGreeting({ name, onClose }: { name: string; onClose: () => void }) {
  const reduced = useMemo(prefersReducedMotion, []);
  const button = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Happy birthday, ${name}`}
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,#3a1d4d_0%,#1b0f2b_55%,#0a0614_100%)] px-6 text-center"
    >
      {reduced ? null : <Fireworks />}
      <div className="relative z-10 max-w-2xl">
        <p className="text-[13px] font-bold tracking-[0.3em] text-goldL uppercase">
          Today is your day
        </p>
        <h1 className="mt-4 font-display text-5xl leading-tight text-white drop-shadow-[0_2px_24px_rgba(255,209,102,0.55)] sm:text-7xl">
          Happy Birthday,
          <span className="mt-2 block text-goldL">{name}!</span>
        </h1>
        <p className="mt-5 text-lg text-white/85">
          🎂 The whole team is glad you're here. Have a wonderful year ahead.
        </p>
        <button
          ref={button}
          type="button"
          onClick={onClose}
          className="btn3d btn3d-gold mt-9 min-h-12 px-8"
        >
          Thank you 🎉
        </button>
      </div>
    </div>
  );
}
