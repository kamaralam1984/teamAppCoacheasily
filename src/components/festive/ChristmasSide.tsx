import { useEffect, useState } from "react";

import { useOrgSettings } from "@/hooks/useOrg";
import type { OrgSettings } from "@/lib/punctuality";
import { BigTree, Gift } from "@/components/festive/ChristmasDecor";

/**
 * Christmas extras for the free space to the right of the page on wide screens: a big tree with
 * presents, a waving snowman, a countdown and hanging decorations. Each one is switched on by the
 * developer (Developer → Festive theme → org setting xmas_extras); any mix can show at once. They
 * size themselves to the space that is actually free and hide when there is too little of it.
 */

export type XmasExtra = NonNullable<OrgSettings["xmas_extras"]>[number];

export const XMAS_EXTRAS: { value: XmasExtra; label: string; help: string }[] = [
  {
    value: "tree",
    label: "Big Christmas tree",
    help: "Tall tree with swaying bulbs and a pile of presents.",
  },
  { value: "snowman", label: "Snowman", help: "Hat and muffler, waves and blinks now and then." },
  {
    value: "countdown",
    label: "Christmas countdown",
    help: '"Christmas in 34 days" in gold, with snow on it.',
  },
  {
    value: "hanging",
    label: "Hanging decorations",
    help: "Baubles, stars and candy canes swinging from the top.",
  },
];

const ALL = XMAS_EXTRAS.map((e) => e.value);

function pick(raw: unknown): XmasExtra[] {
  return Array.isArray(raw) ? ALL.filter((v) => raw.includes(v)) : [];
}

/**
 * Local preview only (the dev server, never a build): ?xmextras=tree,snowman (or "all") shows
 * the extras without touching the company setting, ?xmextras=none stops.
 */
function extrasPreview(): XmasExtra[] | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search).get("xmextras");
    if (q === "none") window.sessionStorage.removeItem("ce-xmas-extras");
    else if (q) window.sessionStorage.setItem("ce-xmas-extras", q === "all" ? ALL.join(",") : q);
    const v = window.sessionStorage.getItem("ce-xmas-extras");
    return v ? pick(v.split(",")) : null;
  } catch {
    return null;
  }
}

export function useXmasExtras(): XmasExtra[] {
  const { data: org } = useOrgSettings();
  return extrasPreview() ?? pick(org?.xmas_extras);
}

/** s: how much bigger than a 1600×900 screen this one is (1 on laptops, about 2.4 on a 4K screen). */
type Room = { left: number; width: number; top: number; bottom: number; s: number };

/** The free strip between the right edge of the page's content and the window's edge. */
function useSideRoom(on: boolean): Room | null {
  const [room, setRoom] = useState<Room | null>(null);
  useEffect(() => {
    if (!on) {
      setRoom(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const main = document.querySelector("main");
        const header = document.querySelector("header");
        const vw = document.documentElement.clientWidth;
        if (!main || window.innerWidth < 1024) {
          setRoom(null);
          return;
        }
        // the right-most thing actually drawn in the page (a few levels deep is enough)
        let right = 0;
        const walk = (el: Element, depth: number) => {
          for (const c of Array.from(el.children)) {
            const r = c.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && getComputedStyle(c).position !== "fixed") {
              right = Math.max(right, r.right);
            }
            if (depth > 0) walk(c, depth - 1);
          }
        };
        walk(main, 3);
        if (right === 0) right = main.getBoundingClientRect().right;
        const left = Math.round(right + 24);
        const width = Math.round(vw - 10 - left);
        const top = Math.round(header?.getBoundingClientRect().bottom ?? 0);
        const s = Math.min(2.4, Math.max(1, Math.min(window.innerHeight / 900, vw / 1600)));
        const next =
          width >= 150
            ? { left, width, top, bottom: window.innerHeight, s: Math.round(s * 100) / 100 }
            : null;
        setRoom((old) =>
          old &&
          next &&
          old.left === next.left &&
          old.width === next.width &&
          old.top === next.top &&
          old.bottom === next.bottom &&
          old.s === next.s
            ? old
            : next,
        );
      });
    };
    measure();
    const t = window.setInterval(measure, 600); // pages load, the sidebar collapses
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(t);
      window.removeEventListener("resize", measure);
    };
  }, [on]);
  return room;
}

function istParts(now: Date) {
  const s = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

function countdownText(now: Date): { top: string; big: string; bottom: string } {
  const { y, m, d } = istParts(now);
  const today = Date.UTC(y, m - 1, d);
  const days = (to: number) => Math.round((to - today) / 86_400_000);
  if (m === 12 && d === 25)
    return { top: "Merry", big: "Christmas", bottom: "to you and your family" };
  if (m === 12 && d > 25) {
    const n = days(Date.UTC(y + 1, 0, 1));
    return { top: "New Year in", big: String(n), bottom: n === 1 ? "day to go" : "days to go" };
  }
  const n = days(Date.UTC(y, 11, 25));
  return { top: "Christmas in", big: String(n), bottom: n === 1 ? "day to go" : "days to go" };
}

/* ── pieces ─────────────────────────────────────────────── */

function Snowman({ h }: { h: number }) {
  return (
    <svg aria-hidden viewBox="0 0 130 200" width={h * 0.65} height={h} className="overflow-visible">
      <defs>
        <radialGradient id="xm-sm-body" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="65%" stopColor="#eef3fb" />
          <stop offset="100%" stopColor="#b9c8de" />
        </radialGradient>
        <linearGradient id="xm-sm-scarf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e2343c" />
          <stop offset="100%" stopColor="#99121a" />
        </linearGradient>
      </defs>
      <ellipse cx="65" cy="194" rx="50" ry="6" fill="#0b1a30" opacity="0.35" />
      {/* left arm, still */}
      <path
        d="M40 104 L8 84 M18 90 L10 78 M18 90 L6 94"
        stroke="#5a3a1e"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* right arm, waving */}
      <g className="xm-wave" style={{ transformOrigin: "90px 102px" }}>
        <path
          d="M90 102 L122 74 M112 82 L114 68 M112 82 L126 86"
          stroke="#5a3a1e"
          strokeWidth="3.2"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <circle cx="65" cy="152" r="41" fill="url(#xm-sm-body)" />
      <circle cx="65" cy="100" r="30" fill="url(#xm-sm-body)" />
      {[88, 101, 114].map((y) => (
        <circle key={y} cx="65" cy={y} r="3" fill="#1d2430" />
      ))}
      <circle cx="65" cy="54" r="22" fill="url(#xm-sm-body)" />
      {/* face */}
      <g className="xm-blink">
        <ellipse cx="57" cy="49" rx="2.6" ry="2.9" fill="#1d2430" />
        <ellipse cx="73" cy="49" rx="2.6" ry="2.9" fill="#1d2430" />
      </g>
      <path
        d="M65 55 L88 60 L65 60 Z"
        fill="#f07b1d"
        stroke="#c45a0c"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle
          key={i}
          cx={56 + i * 4.5}
          cy={66 + Math.sin((i / 4) * Math.PI) * 2.6}
          r="1.4"
          fill="#1d2430"
        />
      ))}
      <circle cx="51" cy="58" r="3.5" fill="#ff7a8a" opacity="0.35" />
      <circle cx="79" cy="58" r="3.5" fill="#ff7a8a" opacity="0.35" />
      {/* muffler */}
      <path d="M43 72 Q65 82 87 72 L88 80 Q65 90 42 80 Z" fill="url(#xm-sm-scarf)" />
      <g className="xm-scarf" style={{ transformOrigin: "78px 80px" }}>
        <path d="M74 78 L84 78 L88 110 L76 110 Z" fill="url(#xm-sm-scarf)" />
        <path
          d="M76 110 L77 116 M80 110 L81 117 M84 110 L86 116"
          stroke="#e2343c"
          strokeWidth="1.6"
        />
      </g>
      <path d="M46 76 Q65 84 84 76" stroke="#f6d77a" strokeWidth="1.4" fill="none" opacity="0.8" />
      {/* top hat */}
      <rect x="40" y="32" width="50" height="6" rx="2" fill="#151a24" />
      <rect x="47" y="4" width="36" height="30" rx="2" fill="#1d2430" />
      <rect x="47" y="24" width="36" height="6" fill="#c0171f" />
      <circle cx="78" cy="27" r="4" fill="#2e7d3c" />
      <circle cx="80" cy="24" r="2" fill="#c0171f" />
      {/* a little snow on the hat */}
      <path d="M47 5 Q65 -1 83 5 Q65 9 47 5 Z" fill="url(#xm-snow)" />
    </svg>
  );
}

function Hanging({
  x,
  top,
  len,
  kind,
  i,
  s,
}: {
  x: number;
  top: number;
  len: number;
  kind: number;
  i: number;
  s: number;
}) {
  const item =
    kind === 0 || kind === 3 ? (
      <g>
        <rect x="-4" y="0" width="8" height="5" rx="1" fill="url(#xm-gold)" />
        <circle cx="0" cy="20" r="16" fill={`url(#xm-ball-${kind === 0 ? "red" : "silver"})`} />
        <ellipse cx="-6" cy="13" rx="4.5" ry="3" fill="#fff" opacity="0.7" />
        <path d="M-15 22 Q0 28 15 22" stroke="url(#xm-gold)" strokeWidth="1.6" fill="none" />
      </g>
    ) : kind === 1 ? (
      <g className="xm-hstar">
        <circle cx="0" cy="18" r="20" fill="url(#xm-warm-glow)" opacity="0.8" />
        <path
          d="M0 0 l5 11 12 1.4 -9 8.2 2.4 11.8 -10.4-6 -10.4 6 2.4-11.8 -9-8.2 12-1.4Z"
          fill="url(#xm-gold)"
          stroke="#fff3c4"
          strokeWidth="0.8"
        />
      </g>
    ) : (
      <g>
        <path
          d="M0 0 L0 30 Q0 42 -10 42 Q-20 42 -20 32"
          stroke="#ffffff"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M0 0 L0 30 Q0 42 -10 42 Q-20 42 -20 32"
          stroke="#d81b28"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray="5 6"
          fill="none"
        />
      </g>
    );
  return (
    <div
      className="xm-swing absolute"
      style={{
        left: x - 30 * s,
        top,
        width: 60 * s,
        animationDuration: `${3.2 + (i % 4) * 0.6}s`,
        animationDelay: `${(i * 0.7) % 3}s`,
      }}
    >
      <svg
        aria-hidden
        viewBox={`-30 0 60 ${len / s + 50}`}
        width={60 * s}
        height={len + 50 * s}
        className="overflow-visible"
      >
        <line x1="0" y1="0" x2="0" y2={len / s} stroke="#e9d9a6" strokeWidth="1" opacity="0.8" />
        <g transform={`translate(0 ${len / s})`}>{item}</g>
      </svg>
    </div>
  );
}

function Countdown({ width, s }: { width: number; s: number }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const c = countdownText(now);
  const bigIsWord = !/^\d+$/.test(c.big);
  const bigSize = bigIsWord ? Math.min(width * 0.22, 54 * s) : Math.min(width * 0.36, 92 * s);
  const small = Math.max(18, Math.min(width * 0.13, 34 * s));
  return (
    <div className="xm-count relative text-center" style={{ width }}>
      <svg
        aria-hidden
        viewBox="0 0 200 26"
        preserveAspectRatio="none"
        className="absolute left-1/2 -translate-x-1/2"
        style={{ top: -12 * s, height: 24 * s, width: Math.min(width * 0.88, 260 * s) }}
      >
        <path
          d="M0 22 Q8 4 30 8 Q50 0 72 7 Q100 -2 128 7 Q150 1 170 8 Q192 4 200 22 Z"
          fill="url(#xm-snow)"
        />
        {[24, 58, 96, 140, 176].map((x, k) => (
          <path
            key={x}
            d={`M${x - 3} 18 L${x} ${30 + (k % 3) * 6} L${x + 3} 18 Z`}
            fill="#eaf3ff"
            opacity="0.85"
          />
        ))}
      </svg>
      <p className="xm-happy leading-none" style={{ paddingTop: 16 * s }}>
        <span className="xm-happy-white block" style={{ fontSize: small }}>
          {c.top}
        </span>
        <span
          className="block"
          style={{ fontSize: bigSize, fontFamily: bigIsWord ? undefined : "'Rozha One', serif" }}
        >
          {c.big}
        </span>
        <span className="block" style={{ fontSize: small * 0.9 }}>
          {c.bottom}
        </span>
      </p>
    </div>
  );
}

/* ── placement ──────────────────────────────────────────── */

export function ChristmasSideDecor() {
  const extras = useXmasExtras();
  const on = extras.length > 0;
  const room = useSideRoom(on);
  const has = (e: XmasExtra) => extras.includes(e);

  // with something standing on the right of the floor, the corner lantern and pines step aside
  const floor = Boolean(room) && (has("tree") || has("snowman"));
  useEffect(() => {
    const root = document.documentElement;
    if (floor) root.dataset["xmFloor"] = "1";
    else delete root.dataset["xmFloor"];
    return () => {
      delete root.dataset["xmFloor"];
    };
  }, [floor]);

  if (!room) return null;
  const { left, width: W, top, bottom, s } = room;

  const hangZone = has("hanging") ? Math.min(180 * s, (bottom - top) * 0.28) : 0;
  const countTop = top + (has("hanging") ? hangZone + 24 * s : 36 * s);
  const countH = has("countdown")
    ? Math.min(W * 0.36, 92 * s) + Math.max(18, Math.min(W * 0.13, 34 * s)) * 2 + 34 * s
    : 0;
  const floorTop = has("countdown")
    ? countTop + countH + 24 * s
    : has("hanging")
      ? top + hangZone + 30
      : top + 30;
  const floorH = bottom - 18 - floorTop;

  let treeH = 0;
  let manH = 0;
  if (has("tree") && has("snowman")) {
    treeH = Math.min(floorH, 470 * s, (W * 0.92) / 0.833);
    manH = Math.min(treeH * 0.5, 200 * s, (W * 0.48) / 0.65);
  } else if (has("tree")) {
    treeH = Math.min(floorH, 480 * s, (W * 0.92) / 0.833);
  } else if (has("snowman")) {
    manH = Math.min(floorH, 250 * s, (W * 0.9) / 0.65);
  }
  if (treeH < 100) treeH = 0;
  if (manH < 70) manH = 0;
  // side by side when both fit, otherwise the snowman stands in front of the tree, to its left
  const sideBySide = treeH > 0 && manH > 0 && treeH * 0.833 + manH * 0.65 - 12 <= W;

  const n = Math.max(3, Math.min(12, Math.floor(W / (50 * s))));
  const gift = Math.max(24, treeH * 0.14);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {has("hanging")
        ? Array.from({ length: n }, (_, i) => (
            <Hanging
              key={i}
              i={i}
              x={left + (W * (i + 0.5)) / n}
              top={top}
              len={Math.max(24 * s, hangZone - 50 * s - ((i * 37) % 3) * ((hangZone - 70 * s) / 3))}
              kind={i % 4}
              s={s}
            />
          ))
        : null}
      {has("countdown") ? (
        <div className="absolute" style={{ left, top: countTop }}>
          <Countdown width={W} s={s} />
        </div>
      ) : null}
      {treeH || manH ? (
        <div
          className={`absolute flex items-end ${treeH && manH && !sideBySide ? "justify-end" : "justify-center"}`}
          style={{ left, width: W, bottom: 14 }}
        >
          {manH ? (
            <div
              className={
                !treeH ? "" : sideBySide ? "relative z-10 -mr-3" : "absolute bottom-0 left-0 z-10"
              }
            >
              <Snowman h={manH} />
            </div>
          ) : null}
          {treeH ? (
            <div className="relative">
              <BigTree h={treeH} />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-center">
                <Gift w={gift} className="-mr-1" />
                <Gift w={gift * 1.25} red={false} />
                <Gift w={gift * 0.9} className="-ml-1" />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
