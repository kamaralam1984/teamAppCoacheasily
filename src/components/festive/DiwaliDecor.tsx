import { useTheme } from "@/hooks/useTheme";
import { useOrgSettings } from "@/hooks/useOrg";
import { FireworksCanvas } from "@/components/festive/FireworksCanvas";

/**
 * Diwali decorations. On by itself on the Diwali theme's days, or switched on or off for the
 * whole company from the Developer panel (org setting festive_decor: "diwali" | "off"; absent
 * means follow the calendar). Purely decorative: aria-hidden and never in the way of a click.
 */
/**
 * Local preview only (the dev server, never a build): open any page with ?diwali=1 to see the
 * decorations without changing the company setting, ?diwali=0 to stop. Remembered for the tab.
 */
function localPreview(): boolean | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search).get("diwali");
    if (q === "1") window.sessionStorage.setItem("ce-diwali-preview", "1");
    if (q === "0") window.sessionStorage.removeItem("ce-diwali-preview");
    return window.sessionStorage.getItem("ce-diwali-preview") === "1" ? true : null;
  } catch {
    return null;
  }
}

export function useDiwaliDecor(): boolean {
  const { theme } = useTheme();
  const { data: org } = useOrgSettings();
  if (localPreview()) return true;
  // Until the company setting has loaded, show nothing: otherwise the calendar default flashes
  // the decorations for a moment even when the setting is "off".
  if (!org) return false;
  const mode = org.festive_decor;
  if (mode === "diwali") return true;
  if (mode === "off") return false;
  return theme.key === "diwali";
}

/* ── pieces ─────────────────────────────────────────────── */

/** A marigold garland: orange and yellow flowers with leaves, repeated across. */
function Garland({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden className={className} preserveAspectRatio="none" height="16" width="100%">
      <defs>
        <radialGradient id="dw-mari-o" cx="40%" cy="35%" r="65%">
          <stop offset="0" stopColor="#ffd166" />
          <stop offset="0.6" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#c2410c" />
        </radialGradient>
        <radialGradient id="dw-mari-y" cx="40%" cy="35%" r="65%">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="0.6" stopColor="#facc15" />
          <stop offset="1" stopColor="#ca8a04" />
        </radialGradient>
        <pattern id="dw-garland" width="30" height="16" patternUnits="userSpaceOnUse">
          <ellipse cx="7" cy="12" rx="4" ry="2" fill="#4d7c0f" transform="rotate(-25 7 12)" />
          <circle cx="8" cy="7" r="6.5" fill="url(#dw-mari-o)" />
          <ellipse cx="22" cy="12" rx="4" ry="2" fill="#65a30d" transform="rotate(25 22 12)" />
          <circle cx="23" cy="7" r="6" fill="url(#dw-mari-y)" />
        </pattern>
      </defs>
      <rect width="100%" height="16" fill="url(#dw-garland)" />
    </svg>
  );
}

/** A string of warm bulbs that twinkle one after another. */
function BulbString({ count = 24, className = "" }: { count?: number; className?: string }) {
  return (
    <div aria-hidden className={`flex justify-between ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="dw-bulb" style={{ animationDelay: `${(i % 6) * 0.25}s` }} />
      ))}
    </div>
  );
}

/** A hanging lantern (kandil) that swings gently. */
function Lantern({ string = 36, size = 34, delay = 0, className = "" }: { string?: number; size?: number; delay?: number; className?: string }) {
  const h = string + size * 1.6;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 40 ${h * (40 / size)}`}
      width={size}
      height={h}
      className={`dw-swing ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <defs>
        <radialGradient id="dw-lantern-glow" cx="50%" cy="50%" r="55%">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.55" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#9a3412" />
        </radialGradient>
        <linearGradient id="dw-lantern-gold" x1="0" x2="1">
          <stop offset="0" stopColor="#8f6307" />
          <stop offset="0.5" stopColor="#f0c75e" />
          <stop offset="1" stopColor="#8f6307" />
        </linearGradient>
      </defs>
      {(() => {
        const s = string * (40 / size);
        return (
          <g>
            <line x1="20" y1="0" x2="20" y2={s} stroke="#c9a227" strokeWidth="1.2" />
            <rect x="13" y={s} width="14" height="5" rx="1.5" fill="url(#dw-lantern-gold)" />
            <path
              d={`M8 ${s + 9} Q20 ${s + 3} 32 ${s + 9} L30 ${s + 40} Q20 ${s + 46} 10 ${s + 40} Z`}
              fill="url(#dw-lantern-glow)"
              stroke="url(#dw-lantern-gold)"
              strokeWidth="1.6"
            />
            <path d={`M20 ${s + 6} L20 ${s + 44} M12 ${s + 10} Q20 ${s + 26} 12 ${s + 40} M28 ${s + 10} Q20 ${s + 26} 28 ${s + 40}`} stroke="#8f6307" strokeWidth="0.9" fill="none" opacity="0.8" />
            <rect x="14" y={s + 43} width="12" height="4" rx="1.5" fill="url(#dw-lantern-gold)" />
            <path d={`M15 ${s + 47} l-2 10 M20 ${s + 47} l0 12 M25 ${s + 47} l2 10`} stroke="#d97706" strokeWidth="1.2" strokeLinecap="round" />
          </g>
        );
      })()}
    </svg>
  );
}

/** A clay diya with a flickering flame and a soft glow. */
export function Diya({ size = 28, delay = 0, className = "" }: { size?: number; delay?: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 60 50" width={size} height={(size * 50) / 60} className={className}>
      <defs>
        <radialGradient id="dw-diya-glow" cx="50%" cy="60%" r="50%">
          <stop offset="0" stopColor="#ffd166" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffd166" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="dw-diya-clay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f59e0b" />
          <stop offset="0.5" stopColor="#c2410c" />
          <stop offset="1" stopColor="#7c2d12" />
        </linearGradient>
        <linearGradient id="dw-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#f97316" />
          <stop offset="0.5" stopColor="#facc15" />
          <stop offset="1" stopColor="#fffbe6" />
        </linearGradient>
      </defs>
      <circle className="dw-glow" cx="30" cy="20" r="20" fill="url(#dw-diya-glow)" style={{ animationDelay: `${delay}s` }} />
      <path className="dw-flame" d="M30 4 C 36 14, 35 22, 30 26 C 25 22, 24 14, 30 4 Z" fill="url(#dw-flame)" style={{ animationDelay: `${delay}s` }} />
      <path d="M4 28 Q30 30 56 28 Q52 46 30 47 Q8 46 4 28 Z" fill="url(#dw-diya-clay)" />
      <path d="M8 31 Q30 34 52 31" stroke="#fde68a" strokeWidth="1.4" fill="none" opacity="0.8" />
      <circle cx="18" cy="38" r="1.6" fill="#fde68a" opacity="0.8" />
      <circle cx="30" cy="40" r="1.6" fill="#fde68a" opacity="0.8" />
      <circle cx="42" cy="38" r="1.6" fill="#fde68a" opacity="0.8" />
    </svg>
  );
}

/** A rangoli mandala that turns very slowly. */
function Rangoli({ size = 160, className = "" }: { size?: number; className?: string }) {
  const petals = (n: number, r: number, rx: number, ry: number, fill: string) =>
    Array.from({ length: n }, (_, i) => (
      <ellipse key={`${r}-${i}`} cx="0" cy={-r} rx={rx} ry={ry} fill={fill} transform={`rotate(${(360 / n) * i})`} />
    ));
  return (
    <svg aria-hidden viewBox="-100 -100 200 200" width={size} height={size} className={`dw-rangoli ${className}`}>
      {petals(16, 72, 10, 22, "#db2777")}
      {petals(16, 72, 5, 14, "#f9a8d4")}
      {petals(12, 50, 11, 20, "#f59e0b")}
      {petals(12, 50, 5, 11, "#fde68a")}
      {petals(8, 28, 9, 16, "#7c3aed")}
      <circle r="16" fill="#f0c75e" />
      <circle r="9" fill="#c2410c" />
      <circle r="88" fill="none" stroke="#f0c75e" strokeWidth="2" strokeDasharray="2 6" />
    </svg>
  );
}

/* ── placements ─────────────────────────────────────────── */

/** Inside the top bar: garland on top, lights, a lantern in each corner, diyas along the nav. */
export function DiwaliHeaderDecor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
      <Garland className="absolute inset-x-0 top-0" />
      <BulbString className="absolute inset-x-6 top-[14px]" count={32} />
      <Lantern className="absolute top-3 left-1 hidden xl:block" string={16} size={22} />
      <Lantern className="absolute top-3 right-1 hidden xl:block" string={16} size={22} delay={0.7} />
      <div className="absolute inset-x-[8%] bottom-0 flex justify-between">
        {Array.from({ length: 7 }, (_, i) => (
          <Diya key={i} size={30} delay={i * 0.2} />
        ))}
      </div>
    </div>
  );
}

/** Around the page: lanterns hanging on both sides and rangoli in the bottom corners. */
export function DiwaliPageDecor() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <BulbString className="absolute top-[118px] left-0 w-[16%] -rotate-3" count={7} />
      <BulbString className="absolute top-[118px] right-0 w-[16%] rotate-3" count={7} />
      <Lantern className="absolute top-[118px] left-[4%]" string={40} size={30} />
      <Lantern className="absolute top-[118px] left-[11%]" string={70} size={26} delay={0.5} />
      <Lantern className="absolute top-[118px] right-[4%]" string={40} size={30} delay={0.3} />
      <Lantern className="absolute top-[118px] right-[11%]" string={70} size={26} delay={0.9} />
      <Rangoli className="absolute -bottom-10 -left-10 opacity-70" size={220} />
      <Rangoli className="absolute -right-10 -bottom-10 opacity-70" size={220} />
      <span className="dw-sparkle absolute top-[45%] left-[7%]" />
      <span className="dw-sparkle absolute top-[60%] left-[12%]" style={{ animationDelay: "1.1s" }} />
      <span className="dw-sparkle absolute top-[40%] right-[8%]" style={{ animationDelay: "0.6s" }} />
      <span className="dw-sparkle absolute top-[65%] right-[13%]" style={{ animationDelay: "1.6s" }} />
    </div>
  );
}

/** Over the dashboard greeting: lights, marigolds, Happy Diwali, fireworks and a row of diyas. */
export function DiwaliHeroDecor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[14px]">
      <Garland className="absolute inset-x-0 top-0 opacity-95" />
      <BulbString className="absolute inset-x-8 top-[14px]" count={22} />
      {/* real-feeling fireworks: rockets that burst, and two anars throwing a big fountain */}
      <div className="absolute inset-0">
        <FireworksCanvas />
      </div>
      <div className="absolute inset-x-0 bottom-[96px] flex w-full flex-col items-center sm:inset-x-auto sm:right-[3%] sm:bottom-[40%] sm:w-[38%]">
        <Diya size={52} className="mb-2" />
        <p className="dw-happy text-center leading-[0.82]">
          <span className="block text-[42px]">Happy</span>
          <span className="block text-[74px]">Diwali</span>
        </p>
      </div>
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-end gap-1.5 sm:bottom-3 sm:left-[79%]">
        <Diya size={44} delay={0.3} />
        <Diya size={70} delay={0.1} />
        <Diya size={44} delay={0.5} />
      </div>
      <div className="absolute inset-x-[6%] bottom-1 hidden justify-between sm:right-[42%] sm:flex">
        {Array.from({ length: 8 }, (_, i) => (
          <Diya key={i} size={18} delay={i * 0.15} />
        ))}
      </div>
    </div>
  );
}
