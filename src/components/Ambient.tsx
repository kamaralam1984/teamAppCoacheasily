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
}

const SHAPES: Record<Particles, Shape> = {
  none: { className: "", count: 0, min: 0, max: 0, slow: 0, fast: 0, drift: 0 },
  embers: { className: "ce-p-ember", count: 24, min: 6, max: 18, slow: 8, fast: 22, drift: 140 },
  diya: { className: "ce-p-diya", count: 14, min: 14, max: 30, slow: 16, fast: 34, drift: 60 },
  tricolour: { className: "ce-p-band", count: 21, min: 8, max: 16, slow: 10, fast: 24, drift: 90 },
  petals: { className: "ce-p-petal", count: 26, min: 9, max: 20, slow: 9, fast: 20, drift: 220 },
  marigold: { className: "ce-p-marigold", count: 22, min: 8, max: 16, slow: 11, fast: 24, drift: 160 },
  grain: { className: "ce-p-grain", count: 34, min: 3, max: 7, slow: 14, fast: 30, drift: 260 },
  sparks: { className: "ce-p-spark", count: 20, min: 3, max: 8, slow: 6, fast: 14, drift: 70 },
  sparkle: { className: "ce-p-sparkle", count: 30, min: 4, max: 10, slow: 2.4, fast: 5.5, drift: 0 },
  colour: { className: "ce-p-petal", count: 26, min: 9, max: 20, slow: 9, fast: 20, drift: 200 },
};

/**
 * A fixed layer of slow ambient motion behind everything, with a character of
 * its own per festival. Decorative, never interactive, and switched off
 * entirely for reduced motion.
 */
export function Ambient() {
  const { theme } = useTheme();
  const kind = theme.particles;
  const colours = palette(kind);
  const shape = SHAPES[kind] ?? SHAPES.embers;

  const bits = useMemo(() => {
    if (shape.count === 0) return [];
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
        opacity: 0.16 + r * 0.24,
        spin: r2 > 0.5 ? 1 : -1,
      };
    });
    // colours and shape both change with the theme
  }, [colours.join("|"), shape]);

  if (kind === "none" || bits.length === 0) return null;

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
            width: b.size,
            height:
              kind === "embers" ? b.size * 1.5 : kind === "tricolour" ? b.size * 0.5 : b.size,
            background: b.colour,
            opacity: b.opacity,
            animationDuration: `${b.duration}s`,
            animationDelay: `${b.delay}s`,
            ["--ce-drift" as string]: `${b.drift}px`,
            ["--ce-spin" as string]: `${b.spin * 360}deg`,
          }}
        />
      ))}
    </div>
  );
}
