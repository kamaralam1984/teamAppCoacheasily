import { Mark } from "@/components/Mark";

/**
 * A theme's icon. Everyday declares "mark", which renders our own logo — never
 * an emoji — with the floating animation so it breathes upward.
 */
export function ThemeIcon({
  emoji,
  size = 20,
  color = "var(--ce-goldL)",
}: {
  emoji: string;
  size?: number;
  color?: string;
}) {
  if (emoji === "mark") {
    return <Mark size={size} color={color} className="ce-float" />;
  }
  return (
    <span aria-hidden style={{ fontSize: size * 0.85, lineHeight: 1 }}>
      {emoji}
    </span>
  );
}
