import { useState } from "react";

import { initials } from "@/lib/warriors";
import { cn } from "@/lib/utils";
import { isValidBirthday, istToday, mmdd } from "@/lib/birthdays";
import { useAvatarMap } from "@/hooks/useAvatars";

export function WarriorAvatar({
  name,
  size = 44,
  className,
  birthday = null,
  path = null,
  src = null,
}: {
  name: string;
  size?: number;
  className?: string;
  /** MM-DD. On the day, the avatar quietly carries a cake. */
  birthday?: string | null;
  /** Storage path in the private `avatars` bucket. Resolved from the shared batch. */
  path?: string | null;
  /** An already-signed or local preview URL, used ahead of `path`. */
  src?: string | null;
}) {
  const isBirthday = isValidBirthday(birthday) && birthday === mmdd(istToday());
  const map = useAvatarMap();
  const [broken, setBroken] = useState(false);

  const photo = src ?? (path ? (map?.get(path) ?? null) : null);
  const showPhoto = Boolean(photo) && !broken;

  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {showPhoto ? (
        <img
          src={photo!}
          alt={name}
          onError={() => setBroken(true)}
          className="h-full w-full rounded-full object-cover"
          style={{
            boxShadow: isBirthday
              ? "inset 0 1px 0 rgba(255,255,255,0.5), 0 0 0 2px var(--ce-goldD)"
              : "inset 0 1px 0 rgba(255,255,255,0.5)",
          }}
        />
      ) : (
        <span
          aria-hidden
          className="flex h-full w-full items-center justify-center rounded-full font-bold text-ink"
          style={{
            fontSize: size * 0.36,
            background:
              "linear-gradient(135deg, var(--ce-goldL) 0%, var(--ce-gold) 55%, var(--ce-goldD) 100%)",
            boxShadow: isBirthday
              ? "inset 0 1px 0 rgba(255,255,255,0.5), 0 0 0 2px var(--ce-goldD)"
              : "inset 0 1px 0 rgba(255,255,255,0.5)",
          }}
        >
          {initials(name)}
        </span>
      )}
      {isBirthday ? (
        <span
          title={`It's ${name}'s birthday today`}
          className="absolute -right-1 -bottom-1 leading-none"
          style={{ fontSize: Math.max(11, size * 0.34) }}
        >
          🎂
        </span>
      ) : null}
    </span>
  );
}
