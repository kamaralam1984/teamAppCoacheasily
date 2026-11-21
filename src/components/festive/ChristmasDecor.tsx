import { useEffect, useRef, useState } from "react";

import { useTheme } from "@/hooks/useTheme";
import { useOrgSettings } from "@/hooks/useOrg";
import { istMonthDay } from "@/lib/theme";

export { SnowScene } from "@/components/festive/SnowScene";
export { SleighFlight } from "@/components/festive/SleighFlight";

/**
 * Christmas decorations. On by itself from 18 to 31 December (or on the Christmas theme), or
 * switched on or off for the whole company from the Developer panel (org setting
 * festive_decor: "christmas" | "off"). Purely decorative: aria-hidden, never in a click's way.
 */

/**
 * Local preview only (the dev server, never a build): open any page with ?christmas=1 to see
 * the decorations without changing the company setting, ?christmas=0 to stop.
 */
export function christmasPreview(): boolean | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search).get("christmas");
    if (q === "1") window.sessionStorage.setItem("ce-christmas-preview", "1");
    if (q === "0") window.sessionStorage.removeItem("ce-christmas-preview");
    return window.sessionStorage.getItem("ce-christmas-preview") === "1" ? true : null;
  } catch {
    return null;
  }
}

export function useChristmasDecor(): boolean {
  const { theme } = useTheme();
  const { data: org } = useOrgSettings();
  const preview = christmasPreview();
  const md = istMonthDay();
  const on = preview
    ? true
    : !org
      ? false
      : org.festive_decor === "christmas"
        ? true
        : org.festive_decor
          ? false
          : theme.key === "christmas" || (md >= "12-18" && md <= "12-31");
  // the shell, sidebar and nav pick their Christmas colours up from this attribute
  useEffect(() => {
    const root = document.documentElement;
    if (on) root.dataset["xmas"] = "1";
    else delete root.dataset["xmas"];
    return () => {
      delete root.dataset["xmas"];
    };
  }, [on]);
  return on;
}

/* ── pieces ─────────────────────────────────────────────── */

/** Shared gradients and textures, drawn once and used by every piece below. */
export function ChristmasDefs() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <defs>
        {/* pine needles: many thin strokes in several greens, tiled along a branch */}
        <pattern id="xm-needles" width="26" height="22" patternUnits="userSpaceOnUse">
          <rect width="26" height="22" fill="#123b21" />
          {[
            [2, 3, 10, 9, "#1f6b3a"],
            [6, 1, 13, 11, "#2e8b4e"],
            [14, 2, 7, 12, "#1b5e33"],
            [18, 0, 25, 10, "#3a9a5b"],
            [22, 4, 15, 14, "#24713f"],
            [1, 12, 9, 18, "#2b7f47"],
            [10, 10, 4, 20, "#174f2b"],
            [12, 13, 20, 21, "#3f9f60"],
            [20, 11, 25, 19, "#1d6336"],
            [5, 7, 0, 15, "#2f8a50"],
            [16, 8, 24, 15, "#4aa86a"],
            [8, 16, 15, 22, "#22693c"],
          ].map(([x1, y1, x2, y2, c], i) => (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={c as string}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          ))}
        </pattern>
        <radialGradient id="xm-ball-red" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ff8a8a" />
          <stop offset="0.35" stopColor="#d4161f" />
          <stop offset="1" stopColor="#5c0408" />
        </radialGradient>
        <radialGradient id="xm-ball-gold" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#fff6c9" />
          <stop offset="0.4" stopColor="#e2b23c" />
          <stop offset="1" stopColor="#6e4a06" />
        </radialGradient>
        <radialGradient id="xm-ball-silver" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#c3cad6" />
          <stop offset="1" stopColor="#4b5566" />
        </radialGradient>
        <linearGradient id="xm-ribbon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff5a5f" />
          <stop offset="0.45" stopColor="#d1121b" />
          <stop offset="1" stopColor="#7a0710" />
        </linearGradient>
        <linearGradient id="xm-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7a5408" />
          <stop offset="0.3" stopColor="#f6d77a" />
          <stop offset="0.55" stopColor="#c9962a" />
          <stop offset="0.8" stopColor="#fff0b8" />
          <stop offset="1" stopColor="#8a5f0a" />
        </linearGradient>
        <linearGradient id="xm-snow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c6d5ea" />
        </linearGradient>
        <radialGradient id="xm-window" cx="50%" cy="50%" r="60%">
          <stop offset="0" stopColor="#fff3c0" />
          <stop offset="0.6" stopColor="#ffb547" />
          <stop offset="1" stopColor="#c46a12" />
        </radialGradient>
        <radialGradient id="xm-warm-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffcf6b" stopOpacity="0.75" />
          <stop offset="1" stopColor="#ffcf6b" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** Twinkling fairy lights in warm gold, with a red, green or silver one now and then. */
function Lights({ count, className = "" }: { count: number; className?: string }) {
  const colours = [
    "xm-bulb-gold",
    "xm-bulb-gold",
    "xm-bulb-red",
    "xm-bulb-gold",
    "xm-bulb-silver",
    "xm-bulb-green",
  ];
  return (
    <div aria-hidden className={`flex justify-between ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`xm-bulb ${colours[i % colours.length]}`}
          style={{
            animationDelay: `${((i * 7) % 11) * 0.21}s`,
            marginTop: `${Math.sin(i * 0.9) * 3 + 3}px`,
          }}
        />
      ))}
    </div>
  );
}

/** The ways the top-bar lights play, in turn: running, twinkling, alternating, a wave, … */
const LIGHT_MODES = ["run", "twinkle", "alt", "wave", "flash", "steady", "run-back"] as const;

/**
 * Crystal fairy lights in the top bar: a dark wire sagging between hooks and a cut-glass drop
 * at each clip, with facets that catch the light. They switch between several ways of
 * playing every few seconds (running, twinkling, alternating, a wave, flashing, steady).
 */
function StringLights({ swags, className = "" }: { swags: number; className?: string }) {
  const perSwag = 5;
  const colours = ["gold", "red", "green", "blue", "silver", "pink"];
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let k = 0;
    el.dataset["mode"] = LIGHT_MODES[0];
    const t = window.setInterval(() => {
      k = (k + 1) % LIGHT_MODES.length;
      el.dataset["mode"] = LIGHT_MODES[k];
    }, 6500);
    return () => window.clearInterval(t);
  }, []);
  const total = swags * perSwag;
  return (
    <div ref={ref} aria-hidden className={`xm-lights flex ${className}`}>
      {Array.from({ length: swags }, (_, s) => (
        <div key={s} className="relative h-[36px] flex-1">
          <svg
            className="absolute inset-x-0 top-0 h-[20px] w-full"
            viewBox="0 0 100 20"
            preserveAspectRatio="none"
          >
            <path
              d="M0 2 Q50 16 100 2"
              fill="none"
              stroke="#1d2a1a"
              strokeWidth="1.6"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M0 2 Q50 16 100 2"
              fill="none"
              stroke="#6f7f62"
              strokeWidth="0.5"
              opacity="0.6"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {Array.from({ length: perSwag }, (_, b) => {
            const t = (b + 0.5) / perSwag;
            // where the wire is at t (same curve as the path: a quadratic sag)
            const y = 2 + 2 * t * (1 - t) * 14;
            const n = s * perSwag + b;
            return (
              <span
                key={b}
                className={`xm-sbulb xm-sbulb-${colours[n % colours.length]} ${n % 2 ? "is-odd" : ""}`}
                style={
                  {
                    left: `${t * 100}%`,
                    top: `${y}px`,
                    transform: `translateX(-50%) rotate(${(t - 0.5) * -30}deg)`,
                    "--i": n,
                    "--ri": total - n,
                    "--rnd": ((n * 7919) % 23) / 23,
                  } as React.CSSProperties
                }
              >
                <span className="xm-crystal" />
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** A thick pine garland with baubles and pine cones. */
function Garland({
  width = 600,
  height = 40,
  className = "",
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  const n = Math.max(3, Math.round(width / 70));
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
    >
      <path
        d={`M0 ${height * 0.35} ${Array.from({ length: n }, (_, i) => {
          const x = ((i + 1) * width) / n;
          return `Q${x - width / n / 2} ${height * 0.62} ${x} ${height * 0.35}`;
        }).join(" ")}`}
        fill="none"
        stroke="url(#xm-needles)"
        strokeWidth={height * 0.55}
        strokeLinecap="round"
      />
      {Array.from({ length: n }, (_, i) => {
        const x = ((i + 0.5) * width) / n;
        const kind = ["red", "gold", "silver"][i % 3];
        return (
          <g key={i}>
            <line
              x1={x}
              y1={height * 0.45}
              x2={x}
              y2={height * 0.62}
              stroke="#c9a227"
              strokeWidth="1"
            />
            <circle cx={x} cy={height * 0.75} r={height * 0.16} fill={`url(#xm-ball-${kind})`} />
            <ellipse
              cx={x - height * 0.05}
              cy={height * 0.69}
              rx={height * 0.04}
              ry={height * 0.025}
              fill="#fff"
              opacity="0.8"
            />
          </g>
        );
      })}
    </svg>
  );
}

/** A satin red bow with tails. */
function Bow({ size = 70, className = "" }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 100 90" width={size} height={size * 0.9} className={className}>
      <path d="M46 40 L28 86 L38 80 L44 88 L50 44 Z" fill="url(#xm-ribbon)" />
      <path d="M54 40 L72 86 L62 80 L56 88 L50 44 Z" fill="url(#xm-ribbon)" />
      <path
        d="M50 38 C 30 6, 2 10, 6 32 C 9 50, 34 48, 50 40 Z"
        fill="url(#xm-ribbon)"
        stroke="#5c0408"
        strokeWidth="0.8"
      />
      <path
        d="M50 38 C 70 6, 98 10, 94 32 C 91 50, 66 48, 50 40 Z"
        fill="url(#xm-ribbon)"
        stroke="#5c0408"
        strokeWidth="0.8"
      />
      <path
        d="M14 24 C 22 18, 34 24, 44 34"
        stroke="#ff9a9e"
        strokeWidth="2"
        fill="none"
        opacity="0.6"
      />
      <path
        d="M86 24 C 78 18, 66 24, 56 34"
        stroke="#ff9a9e"
        strokeWidth="2"
        fill="none"
        opacity="0.6"
      />
      <ellipse
        cx="50"
        cy="40"
        rx="9"
        ry="10"
        fill="url(#xm-ribbon)"
        stroke="#5c0408"
        strokeWidth="0.8"
      />
      <ellipse cx="47" cy="36" rx="3" ry="2" fill="#ffb3b6" opacity="0.7" />
    </svg>
  );
}

/** Holly: two spiky leaves and three berries. */
function Holly({ size = 46, className = "" }: { size?: number; className?: string }) {
  const leaf =
    "M0 0 C 6 -6, 10 -2, 14 -8 C 16 -2, 22 -4, 26 -10 C 28 -2, 34 -2, 38 -6 C 36 2, 30 6, 24 6 C 22 10, 16 8, 12 10 C 10 6, 4 6, 0 0 Z";
  return (
    <svg
      aria-hidden
      viewBox="-40 -30 80 60"
      width={size}
      height={size * 0.75}
      className={className}
    >
      <path
        d={leaf}
        fill="#1d6b35"
        stroke="#0e3d1d"
        strokeWidth="1"
        transform="rotate(-160) translate(2 0)"
      />
      <path
        d={leaf}
        fill="#2a8445"
        stroke="#0e3d1d"
        strokeWidth="1"
        transform="rotate(-20) translate(2 0)"
      />
      <circle cx="-4" cy="-4" r="6" fill="url(#xm-ball-red)" />
      <circle cx="6" cy="-6" r="6" fill="url(#xm-ball-red)" />
      <circle cx="1" cy="4" r="6" fill="url(#xm-ball-red)" />
    </svg>
  );
}

/** A snow-laden pine. */
function Pine({
  h = 120,
  className = "",
  tone = "#0f3a24",
}: {
  h?: number;
  className?: string;
  tone?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 60 100" width={h * 0.6} height={h} className={className}>
      <rect x="27" y="86" width="6" height="14" fill="#3b2414" />
      {[0, 1, 2, 3].map((i) => {
        const top = 6 + i * 20;
        const half = 10 + i * 6;
        return (
          <g key={i}>
            <path
              d={`M30 ${top} L${30 - half} ${top + 30} L${30 + half} ${top + 30} Z`}
              fill={tone}
            />
            <path
              d={`M30 ${top} L${30 - half * 0.85} ${top + 26} Q${30 - half * 0.5} ${top + 22} ${30 - half * 0.2} ${top + 25} Q30 ${top + 20} ${30 + half * 0.3} ${top + 24} Q${30 + half * 0.6} ${top + 21} ${30 + half * 0.85} ${top + 26} Z`}
              fill="url(#xm-snow)"
              opacity="0.92"
            />
          </g>
        );
      })}
    </svg>
  );
}

/** A small snowy cabin with warm windows and lights along the roof. */
function Cabin({ w = 120, className = "" }: { w?: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 120 90" width={w} height={w * 0.75} className={className}>
      <ellipse cx="60" cy="60" rx="58" ry="34" fill="url(#xm-warm-glow)" className="xm-glow" />
      <rect x="20" y="42" width="80" height="44" fill="#5a3418" />
      {[48, 56, 64, 72, 80].map((y) => (
        <line key={y} x1="20" y1={y} x2="100" y2={y} stroke="#3e220f" strokeWidth="1" />
      ))}
      <path d="M10 46 L60 10 L110 46 Z" fill="#4a2a14" />
      <path d="M6 48 L60 6 L114 48 L108 50 Q84 40 60 46 Q36 40 12 51 Z" fill="url(#xm-snow)" />
      <rect
        x="30"
        y="54"
        width="18"
        height="14"
        rx="1"
        fill="url(#xm-window)"
        className="xm-window"
      />
      <rect
        x="72"
        y="54"
        width="18"
        height="14"
        rx="1"
        fill="url(#xm-window)"
        className="xm-window"
        style={{ animationDelay: "1.3s" }}
      />
      <line x1="39" y1="54" x2="39" y2="68" stroke="#5a3418" strokeWidth="1.4" />
      <line x1="81" y1="54" x2="81" y2="68" stroke="#5a3418" strokeWidth="1.4" />
      <rect x="53" y="60" width="14" height="26" fill="#3a1f0c" />
      <circle cx="60" cy="68" r="5" fill="none" stroke="#1f6b35" strokeWidth="2.5" />
      <circle cx="60" cy="64" r="1.3" fill="#d4161f" />
      {Array.from({ length: 11 }, (_, i) => (
        <circle
          key={i}
          cx={12 + i * 9.6}
          cy={(() => {
            const x = 12 + i * 9.6;
            return (x <= 60 ? 46 - ((x - 10) * 36) / 50 : 10 + ((x - 60) * 36) / 50) + 2;
          })()}
          r="1.6"
          className={`xm-dot ${i % 3 === 0 ? "xm-dot-red" : ""}`}
          style={{ animationDelay: `${i * 0.17}s` }}
        />
      ))}
      <path d="M0 90 Q30 78 60 84 Q90 78 120 86 L120 90 Z" fill="url(#xm-snow)" />
    </svg>
  );
}

/** A red Santa hat that sits on the H of "Happy". */
function SantaHat({ size = 64, className = "" }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 100 80" width={size} height={size * 0.8} className={className}>
      <path
        d="M14 58 C 20 24, 50 4, 78 14 C 90 18, 96 34, 92 48 C 86 36, 74 30, 62 34 C 58 44, 54 52, 50 58 Z"
        fill="url(#xm-ribbon)"
      />
      <path
        d="M30 40 C 40 22, 58 14, 74 18"
        stroke="#ff8a8e"
        strokeWidth="3"
        fill="none"
        opacity="0.45"
      />
      <rect x="8" y="52" width="52" height="16" rx="8" fill="url(#xm-snow)" />
      <circle cx="92" cy="52" r="10" fill="url(#xm-snow)" />
    </svg>
  );
}

/** A wrapped present with a gold ribbon. */
function Gift({
  w = 60,
  red = true,
  className = "",
}: {
  w?: number;
  red?: boolean;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 60 60" width={w} height={w} className={className}>
      <rect
        x="4"
        y="22"
        width="52"
        height="36"
        rx="2"
        fill={red ? "url(#xm-ball-red)" : "url(#xm-ball-gold)"}
      />
      <rect x="2" y="16" width="56" height="10" rx="2" fill={red ? "#b10f17" : "#d6a63a"} />
      <rect x="26" y="16" width="8" height="42" fill={red ? "url(#xm-gold)" : "url(#xm-ribbon)"} />
      <path
        d="M30 16 C 18 2, 8 8, 14 14 C 18 18, 26 16, 30 16 C 42 2, 52 8, 46 14 C 42 18, 34 16, 30 16 Z"
        fill={red ? "url(#xm-gold)" : "url(#xm-ribbon)"}
      />
      <path d="M4 26 L56 26" stroke="#000" strokeOpacity="0.2" />
    </svg>
  );
}

/** A lantern with a flickering candle, snow on its roof. */
function Lantern({ h = 150, className = "" }: { h?: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 70 120" width={h * 0.58} height={h} className={className}>
      <ellipse cx="35" cy="70" rx="40" ry="44" fill="url(#xm-warm-glow)" className="xm-glow" />
      <circle cx="35" cy="8" r="6" fill="none" stroke="#2a2a2a" strokeWidth="3" />
      <path d="M12 26 L35 12 L58 26 Z" fill="#7a0d14" />
      <path d="M8 27 Q35 6 62 27 Q35 20 8 29 Z" fill="url(#xm-snow)" />
      <rect x="12" y="28" width="46" height="6" fill="#7a0d14" />
      <rect x="15" y="34" width="40" height="66" fill="#ffd27a" opacity="0.28" />
      <rect x="27" y="68" width="16" height="30" rx="2" fill="#fff4dc" />
      <path
        className="xm-flame"
        d="M35 50 C 41 60, 40 66, 35 69 C 30 66, 29 60, 35 50 Z"
        fill="#ffcf5a"
      />
      <path
        className="xm-flame"
        d="M35 57 C 38 62, 37 66, 35 68 C 33 66, 32 62, 35 57 Z"
        fill="#fffbe6"
      />
      <path
        d="M15 34 L15 100 M55 34 L55 100 M35 34 L35 46 M15 66 L27 66 M43 66 L55 66"
        stroke="#7a0d14"
        strokeWidth="3"
      />
      <rect x="10" y="100" width="50" height="8" rx="1" fill="#7a0d14" />
      <path d="M8 102 Q35 94 62 102 L62 104 Q35 98 8 106 Z" fill="url(#xm-snow)" />
    </svg>
  );
}

/* ── placements ─────────────────────────────────────────── */

/** Inside the top bar: fairy lights, pine with a bow in the left corner, silver/gold line. */
export function ChristmasHeaderDecor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <StringLights className="absolute inset-x-0 top-0" swags={12} />
      {/* the moon, up in the night sky of the top bar: there on every page and every screen */}
      <div className="xm-moon xm-moon-header" />
      <div className="absolute -top-3 -left-6 hidden w-[200px] -rotate-6 md:block">
        <Garland width={220} height={44} className="h-[44px] w-full" />
        <Bow size={52} className="absolute top-3 left-14" />
      </div>
      <div className="absolute -top-3 -right-8 hidden w-[180px] rotate-6 md:block">
        <Garland width={200} height={44} className="h-[44px] w-full" />
      </div>
    </div>
  );
}

/** The gold and silver lines that run under the top bar. */
export function ChristmasNavLines() {
  return (
    <div aria-hidden className="relative h-[5px] bg-night">
      <div className="xm-line-gold absolute inset-x-0 top-0 h-[2px]" />
      <div className="xm-line-silver absolute inset-x-0 top-[3px] h-[1.5px]" />
    </div>
  );
}

/**
 * Lays every page out round PH Sir's Santa, who stands on the left next to the sidebar:
 * --xm-side is where the sidebar ends (the Santa and the left-hand decorations start there),
 * and --xm-pad is the room the page leaves on its left so nothing covers him.
 */
function useSantaRoom(santa: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const aside = document.querySelector("aside[aria-label='Personal']");
        const ar = aside?.getBoundingClientRect();
        // on small screens the sidebar is a drawer off to the left
        const side = ar && ar.right > 0 && window.innerWidth >= 1024 ? ar.right : 0;
        root.style.setProperty("--xm-side", `${Math.round(side)}px`);
        const img = document.querySelector(".xm-santa");
        const main = document.querySelector<HTMLElement>("main");
        const sr = img?.getBoundingClientRect();
        if (!santa || !main || !sr || sr.width === 0) {
          root.style.removeProperty("--xm-pad");
          return;
        }
        // the page starts where the picture fades out, never over his arm, gift or face
        const limit = sr.right - sr.width * 0.1;
        const pad = Math.max(16, Math.round(limit - main.getBoundingClientRect().left));
        root.style.setProperty("--xm-pad", `${pad}px`);
      });
    };
    measure();
    const t = window.setInterval(measure, 500); // the sidebar can collapse or expand
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(t);
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--xm-pad");
      root.style.removeProperty("--xm-side");
    };
  }, [santa]);
}

const TREE_BULBS = ["#ffd66b", "#ff4b53", "#47dc84", "#6fb6ff", "#f2f5fa", "#ffb347"];

/** A full-size Christmas tree: snowy tiers, gold garland, baubles, twinkling lights, a star. */
function BigTree({ h = 300, className = "" }: { h?: number; className?: string }) {
  const tiers = [
    { y: 34, half: 26, depth: 36 },
    { y: 58, half: 38, depth: 40 },
    { y: 86, half: 52, depth: 44 },
    { y: 118, half: 66, depth: 48 },
    { y: 152, half: 80, depth: 52 },
  ];
  const balls = [
    [92, 66, "red"],
    [112, 80, "gold"],
    [74, 98, "silver"],
    [126, 110, "red"],
    [98, 122, "gold"],
    [60, 134, "red"],
    [140, 142, "silver"],
    [84, 156, "gold"],
    [116, 168, "red"],
    [52, 178, "silver"],
    [150, 186, "gold"],
    [100, 192, "silver"],
    [70, 200, "red"],
    [130, 200, "red"],
  ] as const;
  return (
    <svg aria-hidden viewBox="0 0 200 240" width={h * (200 / 240)} height={h} className={className}>
      <ellipse
        cx="100"
        cy="120"
        rx="110"
        ry="120"
        fill="url(#xm-warm-glow)"
        opacity="0.35"
        className="xm-glow"
      />
      <rect x="92" y="200" width="16" height="26" fill="#4a2a14" />
      {tiers.map((t, i) => (
        <g key={i}>
          <path
            d={`M100 ${t.y - 22} C ${100 - t.half * 0.4} ${t.y + t.depth * 0.4}, ${100 - t.half * 0.8} ${t.y + t.depth * 0.7}, ${100 - t.half} ${t.y + t.depth} Q100 ${t.y + t.depth + 10} ${100 + t.half} ${t.y + t.depth} C ${100 + t.half * 0.8} ${t.y + t.depth * 0.7}, ${100 + t.half * 0.4} ${t.y + t.depth * 0.4}, 100 ${t.y - 22} Z`}
            fill="url(#xm-needles)"
            stroke="#0d3a1e"
            strokeWidth="1"
          />
          <path
            d={`M${100 - t.half} ${t.y + t.depth} Q${100 - t.half * 0.5} ${t.y + t.depth - 6} 100 ${t.y + t.depth - 2} Q${100 + t.half * 0.5} ${t.y + t.depth - 6} ${100 + t.half} ${t.y + t.depth} Q100 ${t.y + t.depth + 8} ${100 - t.half} ${t.y + t.depth} Z`}
            fill="url(#xm-snow)"
            opacity="0.9"
          />
          <path
            d={`M${100 - t.half * 0.75} ${t.y + t.depth * 0.55} Q100 ${t.y + t.depth * 0.95} ${100 + t.half * 0.75} ${t.y + t.depth * 0.55}`}
            fill="none"
            stroke="url(#xm-gold)"
            strokeWidth="2.2"
            className="xm-tinsel"
          />
        </g>
      ))}
      {balls.map(([x, y, c], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="5.5" fill={`url(#xm-ball-${c})`} />
          <ellipse cx={x - 1.6} cy={y - 2} rx="1.4" ry="0.9" fill="#fff" opacity="0.8" />
        </g>
      ))}
      {/* light bulbs hanging from each gold garland, swaying and twinkling */}
      {tiers.flatMap((t, ti) => {
        const n = ti + 2;
        const x0 = 100 - t.half * 0.75;
        const x2 = 100 + t.half * 0.75;
        const y0 = t.y + t.depth * 0.55;
        const y1 = t.y + t.depth * 0.95;
        return Array.from({ length: n }, (_, bi) => {
          const u = (bi + 0.5) / n;
          const x = (1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * 100 + u * u * x2;
          const y = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * y1 + u * u * y0;
          const colour = TREE_BULBS[(ti * 3 + bi) % TREE_BULBS.length]!;
          const k = ti * 5 + bi;
          return (
            <g
              key={`${ti}-${bi}`}
              className="xm-hang"
              style={{
                transformOrigin: `${x.toFixed(1)}px ${y.toFixed(1)}px`,
                animationDelay: `${((k * 7) % 10) * -0.27}s`,
                animationDuration: `${2 + ((k * 3) % 5) * 0.25}s`,
              }}
            >
              <line x1={x} y1={y} x2={x} y2={y + 3} stroke="#2b3a22" strokeWidth="0.6" />
              <rect x={x - 1} y={y + 2.6} width="2" height="1.8" rx="0.4" fill="#1f4a28" />
              <ellipse
                cx={x}
                cy={y + 6.4}
                rx="1.9"
                ry="2.7"
                fill={colour}
                className="xm-tbulb"
                style={{ color: colour, animationDelay: `${((k * 5) % 9) * 0.21}s` }}
              />
              <ellipse cx={x - 0.6} cy={y + 5.6} rx="0.5" ry="0.8" fill="#fff" opacity="0.8" />
            </g>
          );
        });
      })}
      <g className="xm-topstar">
        <circle cx="100" cy="12" r="14" fill="url(#xm-warm-glow)" />
        <path
          d="M100 0 l3.5 7.5 8.2 1 -6 5.6 1.6 8.1 -7.3-4 -7.3 4 1.6-8.1 -6-5.6 8.2-1Z"
          fill="url(#xm-gold)"
          stroke="#fff3c4"
          strokeWidth="0.6"
        />
      </g>
    </svg>
  );
}

/** Behind the whole page: the winter night, pines, lantern, presents and PH Sir's Santa. */
export function ChristmasPageDecor({ dark, santa }: { dark: boolean; santa: boolean }) {
  useSantaRoom(santa);
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${dark ? "xm-night" : "xm-day"}`}
    >
      <ChristmasDefs />
      {dark ? (
        <>
          <div className="absolute inset-0">
            {Array.from({ length: 60 }, (_, i) => (
              <span
                key={i}
                className="xm-star"
                style={{
                  left: `${(i * 37.3) % 100}%`,
                  top: `${(i * 19.7) % 55}%`,
                  animationDelay: `${(i % 9) * 0.45}s`,
                  transform: `scale(${0.5 + ((i * 13) % 10) / 10})`,
                }}
              />
            ))}
          </div>
        </>
      ) : null}
      {/* distant snowy forest */}
      <div className="absolute inset-x-0 bottom-[60px] flex items-end justify-between opacity-70 blur-[1px]">
        {Array.from({ length: 14 }, (_, i) => (
          <Pine
            key={i}
            h={80 + ((i * 37) % 60)}
            tone={dark ? "#12304a" : "#5d7f96"}
            className={i % 3 === 0 ? "" : "-ml-4"}
          />
        ))}
      </div>
      {/* snow on the ground */}
      <svg
        className="absolute inset-x-0 bottom-0 h-[110px] w-full"
        viewBox="0 0 1200 110"
        preserveAspectRatio="none"
      >
        <path
          d="M0 50 Q150 10 320 40 T640 34 T960 44 T1200 30 L1200 110 L0 110 Z"
          fill="url(#xm-snow)"
        />
        <path
          d="M0 80 Q200 50 420 72 T860 66 T1200 70 L1200 110 L0 110 Z"
          fill="#ffffff"
          opacity="0.85"
        />
      </svg>
      {/* right-hand corner: a lantern, presents and snowy pines */}
      <div className="absolute right-0 bottom-0 hidden items-end lg:flex">
        <Lantern h={130} className="mb-6" />
        <Gift w={52} className="mb-3" />
        <Gift w={40} red={false} className="mb-3 -ml-2" />
        <Pine h={210} className="-ml-4" />
        <Pine h={160} className="-ml-12" tone="#145233" />
      </div>
      {/* the mist a gust carries across (SnowScene starts it): in the scene, behind Santa */}
      <div className="xm-fog" />
      {santa ? (
        <div
          className="absolute bottom-0 hidden xl:block"
          style={{ left: "var(--xm-side, 224px)" }}
        >
          <div className="xm-santa">
            <img
              src="/festive/santa-ph.webp"
              alt=""
              draggable={false}
              className="block h-auto w-full select-none"
            />
          </div>
          <Holly size={58} className="absolute bottom-3 left-2" />
        </div>
      ) : (
        <div
          className="absolute bottom-0 hidden items-end lg:flex"
          style={{ left: "var(--xm-side, 0px)" }}
        >
          <Pine h={190} className="-ml-6" />
          <Pine h={140} className="-ml-8" tone="#145233" />
          <Holly size={56} className="mb-4" />
        </div>
      )}
    </div>
  );
}

/**
 * How tall the greeting's tree can be: the free height between the wish and the bottom of the
 * card (less the snowy mound), and no wider than its corner allows. Follows every resize.
 */
function useTreeRoom(
  rootRef: React.RefObject<HTMLDivElement | null>,
  wishRef: React.RefObject<HTMLDivElement | null>,
  areaRef: React.RefObject<HTMLDivElement | null>,
): number {
  const [h, setH] = useState(180);
  useEffect(() => {
    const root = rootRef.current;
    const wish = wishRef.current;
    const area = areaRef.current;
    if (!root || !wish || !area) return;
    const measure = () => {
      const rr = root.getBoundingClientRect();
      const wr = wish.getBoundingClientRect();
      const free = rr.bottom - wr.bottom - 28 - 14; // the mound under it, a little air above
      const byWidth = ((area.getBoundingClientRect().width - 96) / 200) * 240;
      const next = Math.round(Math.max(110, Math.min(300, free, byWidth)));
      setH((prev) => (Math.abs(prev - next) > 2 ? next : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    ro.observe(wish);
    return () => ro.disconnect();
  }, [rootRef, wishRef, areaRef]);
  return h;
}

/** Over the dashboard greeting: garland with a bow, Happy Christmas, holly, a snowy cabin. */
export function ChristmasHeroDecor() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const wishRef = useRef<HTMLDivElement | null>(null);
  const treeAreaRef = useRef<HTMLDivElement | null>(null);
  const treeH = useTreeRoom(rootRef, wishRef, treeAreaRef);
  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[14px]"
    >
      <ChristmasDefs />
      <div className="absolute inset-x-0 top-0">
        <Garland width={1000} height={46} className="h-[46px] w-full" />
        <Lights className="absolute inset-x-4 top-[8px]" count={30} />
      </div>
      <InnerSnow count={34} />
      <Bow size={78} className="absolute -top-2 left-1/2 -translate-x-1/2" />
      {/* silver divider between the greeting and the wish */}
      <div className="xm-divider absolute top-[22%] bottom-[38%] left-[59%] hidden w-px md:block" />
      <div className="absolute inset-x-0 bottom-[190px] flex flex-col items-center md:inset-x-auto md:right-[2%] md:bottom-auto md:top-[12%] md:w-[38%]">
        <div ref={wishRef} className="relative">
          <SantaHat size={58} className="absolute -top-7 -left-5 -rotate-12" />
          <Holly size={48} className="absolute -top-6 -right-8" />
          <p className="xm-happy text-center leading-[0.82]">
            <span className="block text-[46px] text-white xm-happy-white">Happy</span>
            <span className="block text-[66px]">Christmas</span>
          </p>
          <svg viewBox="0 0 200 30" className="mx-auto -mt-1 h-[26px] w-[190px]">
            <path
              className="xm-swoosh"
              d="M6 20 Q80 2 150 14 Q176 18 196 8"
              fill="none"
              stroke="url(#xm-gold)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
      {/* the Christmas tree, lit, standing under the wish with a cabin and pines beside it */}
      <div
        ref={treeAreaRef}
        className="absolute inset-x-0 bottom-0 flex items-end justify-center md:inset-x-auto md:right-[2%] md:w-[38%] md:justify-center"
      >
        <Pine h={66} className="-mr-3 mb-1" />
        <Cabin w={96} className="-mr-3" />
        {/* on a snowy mound, right under the wish */}
        <div className="relative z-0 mb-[28px]">
          <BigTree h={treeH} />
          <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 items-end">
            <Gift w={32} />
            <Gift w={40} red={false} />
            <Gift w={28} />
          </div>
          <svg
            className="absolute -bottom-[44px] left-1/2 h-[52px] w-[260px] -translate-x-1/2"
            viewBox="0 0 260 52"
          >
            <path d="M0 52 Q40 14 130 8 Q220 14 260 52 Z" fill="url(#xm-snow)" />
            <path
              d="M40 30 Q130 4 220 30"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              opacity="0.8"
            />
          </svg>
        </div>
        <Pine h={84} className="-ml-4 mb-1 md:hidden" tone="#145233" />
      </div>
      <svg
        className="absolute inset-x-0 bottom-0 h-[34px] w-full"
        viewBox="0 0 600 34"
        preserveAspectRatio="none"
      >
        <path
          d="M0 30 Q120 26 260 30 Q380 18 470 14 Q540 10 600 6 L600 34 L0 34 Z"
          fill="url(#xm-snow)"
          opacity="0.95"
        />
      </svg>
    </div>
  );
}

/** Soft snow falling inside a box (the greeting, the banner), behind its words. */
function InnerSnow({ count }: { count: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }, (_, i) => {
        const size = 2 + ((i * 7) % 5) * 0.8;
        return (
          <span
            key={i}
            className="xm-inflake"
            style={{
              left: `${(i * 37.7) % 100}%`,
              width: `${size}px`,
              height: `${size}px`,
              opacity: 0.45 + ((i * 3) % 5) * 0.11,
              animationDuration: `${6 + ((i * 11) % 7)}s`,
              animationDelay: `${-((i * 13) % 11)}s`,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * The Christmas wish at the top of every page other than the dashboard (which has its own).
 * On screens too small for the standing Santa, PH Sir's picture is here instead, cropped to
 * his face and never altered.
 */
export function ChristmasBanner() {
  return (
    <div
      aria-hidden
      className="xm-hero xm-frame xm-banner relative mb-6 overflow-hidden rounded-[14px] px-5 pt-9 pb-7 sm:px-6"
    >
      <ChristmasDefs />
      <InnerSnow count={22} />
      {/* snow that has settled inside, along the bottom of the box */}
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[22px] w-full"
        viewBox="0 0 600 22"
        preserveAspectRatio="none"
      >
        <path
          d="M0 12 Q40 4 90 10 T200 8 T320 11 T440 6 T600 10 L600 22 L0 22 Z"
          fill="url(#xm-snow)"
        />
        <path
          d="M0 16 Q150 9 300 15 T600 13"
          fill="none"
          stroke="#fff"
          strokeWidth="1.5"
          opacity="0.8"
        />
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-0">
        <Garland width={1000} height={34} className="h-[34px] w-full" />
        <Lights className="absolute inset-x-4 top-[6px]" count={30} />
      </div>
      <Bow size={50} className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2" />
      <div className="relative flex items-center gap-4">
        <img
          src="/festive/santa-ph.webp"
          alt=""
          draggable={false}
          className="xm-santa-face h-16 w-16 shrink-0 rounded-full object-cover select-none sm:h-20 sm:w-20 xl:hidden"
        />
        <div className="relative min-w-0">
          <SantaHat size={34} className="absolute -top-4 -left-3 -rotate-12" />
          <p className="xm-happy leading-none">
            <span className="xm-happy-white text-[30px] sm:text-[36px]">Happy </span>
            <span className="text-[40px] sm:text-[48px]">Christmas</span>
          </p>
          <p className="mt-1 text-[12px] font-semibold tracking-wide text-[#f3d9d9] sm:text-[13px]">
            Wishing you and your family joy, warmth and a wonderful year ahead.
          </p>
        </div>
        <div className="ml-auto hidden shrink-0 items-end gap-1 md:flex">
          <Holly size={40} className="mb-8" />
          <BigTree h={96} />
          <Gift w={30} className="-ml-3" />
        </div>
      </div>
    </div>
  );
}

/** For the Everyday card: a small decorated tree. */
export function XmasTree({ size = 34 }: { size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 40 50" width={size} height={size * 1.25}>
      <path
        d="M20 4 L6 22 L12 22 L4 34 L11 34 L2 44 L38 44 L29 34 L36 34 L28 22 L34 22 Z"
        fill="#1f6b3a"
      />
      <rect x="17" y="44" width="6" height="5" fill="#5a3418" />
      <path
        d="M20 0 l1.5 3 3.2.4 -2.4 2.2 .6 3.2 -2.9-1.6 -2.9 1.6 .6-3.2 -2.4-2.2 3.2-.4Z"
        fill="#f6d77a"
      />
      {[
        [14, 20, "#d4161f"],
        [25, 26, "#f6d77a"],
        [12, 32, "#c3cad6"],
        [27, 38, "#d4161f"],
        [18, 40, "#f6d77a"],
        [21, 14, "#c3cad6"],
      ].map(([x, y, c], i) => (
        <circle
          key={i}
          cx={x as number}
          cy={y as number}
          r="2"
          fill={c as string}
          className="xm-dot-blink"
          style={{ animationDelay: `${i * 0.3}s` }}
        />
      ))}
    </svg>
  );
}

/** For the strategic meeting card: a pile of presents on the right. */
export function MeetingGifts() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-3 bottom-0 z-0 hidden items-end gap-0.5 sm:flex"
    >
      <ChristmasDefs />
      <Gift w={54} />
      <Gift w={40} red={false} />
      <Gift w={30} />
    </div>
  );
}
