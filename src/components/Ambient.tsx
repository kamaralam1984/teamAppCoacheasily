import { useMemo } from "react";

import { useTheme } from "@/hooks/useTheme";
import type { Particles } from "@/lib/theme";

const COUNT = 24;

/** Particle colours always come from the live token layer — never a literal. */
function palette(kind: Particles): string[] {
  if (kind === "colour")
    return [
      "var(--ce-gold)",
      "var(--ce-goldL)",
      "var(--ce-saff)",
      "var(--ce-violet)",
      "var(--ce-emer)",
    ];
  if (kind === "sparkle") return ["var(--ce-goldL)", "var(--ce-mist)", "var(--ce-gold)"];
  return ["var(--ce-gold)", "var(--ce-goldL)", "var(--ce-saff)"];
}

/**
 * A fixed layer of slow flame-shaped embers behind everything. Decorative,
 * never interactive, and switched off entirely for reduced motion.
 */
export function Ambient() {
  const { theme } = useTheme();
  const colours = palette(theme.particles);

  const flames = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => {
        const seed = (i * 9301 + 49297) % 233280;
        const r = seed / 233280;
        return {
          left: (i / COUNT) * 100 + r * 3,
          size: 6 + r * 12,
          duration: 8 + r * 14,
          delay: -(r * 18 + i * 0.4),
          drift: (r - 0.5) * 140,
          colour: colours[i % colours.length],
          opacity: 0.16 + r * 0.22,
        };
      }),
    // colours change with the theme
    [colours.join("|")],
  );

  if (theme.particles === "none") return null;

  return (
    <div className="ce-ambient" aria-hidden>
      {flames.map((f, i) => (
        <span
          key={i}
          className="ce-flame"
          style={{
            left: `${f.left}%`,
            width: f.size,
            height: f.size * 1.5,
            background: f.colour,
            opacity: f.opacity,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
            ["--ce-drift" as string]: `${f.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
