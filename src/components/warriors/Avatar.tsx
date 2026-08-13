import { initials } from "@/lib/warriors";
import { cn } from "@/lib/utils";

export function WarriorAvatar({
  name,
  size = 44,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold text-ink",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: "linear-gradient(135deg, #F0C75E 0%, #C9A227 55%, #8F6307 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
      }}
    >
      {initials(name)}
    </span>
  );
}
