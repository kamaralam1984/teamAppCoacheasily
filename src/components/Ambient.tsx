import { useMemo } from "react";

import { useTheme } from "@/hooks/useTheme";
import type { Particles } from "@/lib/theme";

/** Particle colours always come from the live token layer — never a literal. */
function palette(kind: Particles): string[] {
  switch (kind) {
    case "colour":
    case "petals":
      return [
        "var(--ce-gold)",
        "var(--ce-goldL)",
        "var(--ce-saff)",
        "var(--ce-violet)",
        "var(--ce-emer)",
      ];
    case "tricolour":
      return ["var(--ce-saff)", "var(--ce-white)", "var(--ce-emer)"];
    case "sparkle":
      return ["var(--ce-goldL)", "var(--ce-mist)", "var(--ce-gold)"];
    case "marigold":
      return ["var(--ce-goldL)", "var(--ce-saff)", "var(--ce-gold)"];
    case "grain":
      return ["var(--ce-goldL)", "var(--ce-gold)"];
    case "sparks":
      return ["var(--ce-goldL)", "var(--ce-mist)", "var(--ce-gold)"];
    case "diya":
      return ["var(--ce-goldL)", "var(--ce-saff)", "var(--ce-gold)"];
    default:
      return ["var(--ce-gold)", "var(--ce-goldL)", "var(--ce-saff)"];
  }
}

interface Shape {
  /** css class carrying the shape and the keyframes */
  className: string;
  count: number;
  /** px */
  min: number;
  max: number;
  /** seconds */
  slow: number;
  fast: number;
  /** horizontal travel, px */
  drift: number;
  /** brightest this kind is ever allowed to be */
  peak: number;
}

/**
 * Atmosphere, not decoration. Counts are low, motion is slow and the opacity
 * range is deliberately faint — you should notice this layer only if you look
 * for it. `peak` is the brightest a particle of this kind ever gets.
 */
const SHAPES: Record<Particles, Shape> = {
  none: { className: "", count: 0, min: 0, max: 0, slow: 0, fast: 0, drift: 0, peak: 0 },
  embers: { className: "ce-p-ember", count: 13, min: 10, max: 26, slow: 22, fast: 46, drift: 70, peak: 0.12 },
  diya: { className: "ce-p-diya", count: 9, min: 16, max: 34, slow: 26, fast: 52, drift: 50, peak: 0.14 },
  tricolour: { className: "ce-p-band", count: 12, min: 8, max: 16, slow: 20, fast: 40, drift: 70, peak: 0.11 },
  petals: { className: "ce-p-petal", count: 14, min: 9, max: 20, slow: 18, fast: 34, drift: 180, peak: 0.11 },
  marigold: { className: "ce-p-marigold", count: 12, min: 8, max: 16, slow: 20, fast: 38, drift: 130, peak: 0.12 },
  grain: { className: "ce-p-grain", count: 16, min: 3, max: 7, slow: 26, fast: 48, drift: 220, peak: 0.13 },
  sparks: { className: "ce-p-spark", count: 12, min: 3, max: 8, slow: 12, fast: 24, drift: 55, peak: 0.13 },
  sparkle: { className: "ce-p-sparkle", count: 16, min: 4, max: 9, slow: 4, fast: 8, drift: 0, peak: 0.14 },
  colour: { className: "ce-p-petal", count: 14, min: 9, max: 20, slow: 18, fast: 34, drift: 170, peak: 0.11 },
};

/**
 * A fixed layer of slow ambient motion behind everything, with a character of
 * its own per festival. Decorative, never interactive, and switched off
 * entirely for reduced motion.
 */
export function Ambient() {
  const { theme } = useTheme();
  if (!theme) return null;

  const kind = theme.particles;
  if (!kind || kind === "none") return null;

  const shape = SHAPES[kind];
  if (!shape || shape.count === 0) return null;

  const colours = palette(kind);
  if (!colours || colours.length === 0) return null;

  const bits = useMemo(() => {
    if (!shape || shape.count === 0) return [];
    return Array.from({ length: shape.count }, (_, i) => {
      const seed = (i * 9301 + 49297) % 233280;
      const r = seed / 233280;
      const r2 = ((i * 7919 + 104729) % 233280) / 233280;
      const size = shape.min + r * (shape.max - shape.min);
      return {
        left: (i / shape.count) * 100 + r2 * 4,
        top: r2 * 96,
        size,
        duration: shape.slow + r * (shape.fast - shape.slow),
        delay: -(r * 18 + i * 0.4),
        drift: (r - 0.5) * shape.drift,
        colour: colours[i % colours.length],
        opacity: shape.peak * (0.5 + r * 0.5),
        spin: r2 > 0.5 ? 1 : -1,
      };
    });
    // colours and shape both change with the theme
  }, [colours.join("|"), shape]);

  if (!bits || bits.length === 0) return null;

  const falling = kind === "petals" || kind === "marigold" || kind === "colour";
  const still = kind === "sparkle";

  return (
    <div className="ce-ambient" aria-hidden data-particles={kind}>
      {bits.map((b, i) => (
        <span
          key={i}
          className={`ce-particle ${shape.className}`}
          style={{
            left: `${b.left}%`,
            ...(still ? { top: `${b.top}%` } : falling ? { top: "-12vh" } : { bottom: "-8vh" }),
            /* The mark's aspect ratio is fixed at 0.694 — never squash it. */
            width: kind === "embers" ? b.size * 0.694 : b.size,
            height: kind === "tricolour" ? b.size * 0.5 : b.size,
            background: b.colour,
            opacity: b.opacity,
            animationDuration: `${b.duration}s`,
            animationDelay: `${b.delay}s`,
            ["--ce-drift" as string]: `${b.drift}px`,
            ["--ce-spin" as string]: `${b.spin * 360}deg`,
            ["--ce-tilt" as string]: `${b.spin * (2 + b.size / 12)}deg`,
            ["--ce-peak" as string]: b.opacity,
          }}
        />
      ))}
    </div>
  );
}
