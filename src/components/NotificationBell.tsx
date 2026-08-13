import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  safeLink,
  useMarkAllNotifications,
  useMarkNotification,
  useNotifications,
  type AppNotification,
} from "@/hooks/useNotifications";

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  return isToday(iso)
    ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function NotificationBell({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications(enabled);
  const markOne = useMarkNotification();
  const markAll = useMarkAllNotifications();

  const items = data ?? [];
  const unread = items.filter((n) => !n.read).length;

  const { today, earlier } = useMemo(
    () => ({
      today: items.filter((n) => isToday(n.created_at)),
      earlier: items.filter((n) => !isToday(n.created_at)),
    }),
    [items],
  );

  function row(n: AppNotification) {
    return (
      <Link
        key={n.id}
        to={safeLink(n.link)}
        onClick={() => {
          setOpen(false);
          if (!n.read) markOne.mutate(n.id);
        }}
        className={`block border-b border-line px-3 py-2.5 last:border-b-0 hover:bg-ivory ${
          n.read ? "" : "bg-ivory/70"
        }`}
      >
        <div className="flex items-start gap-2">
          {!n.read ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-saff" /> : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{n.title}</p>
            {n.body ? <p className="mt-0.5 line-clamp-2 text-xs text-soft">{n.body}</p> : null}
          </div>
          <span className="shrink-0 text-[10px] font-semibold text-soft">
            {timeLabel(n.created_at)}
          </span>
        </div>
      </Link>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative flex h-11 w-11 items-center justify-center rounded-lg text-mist transition-colors hover:bg-night2 hover:text-goldL"
        >
          <Bell size={20} />
          {unread > 0 ? (
            <span className="absolute top-1.5 right-1.5 min-w-[18px] rounded-full bg-saffBtn px-1 text-[10px] leading-[18px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto p-0">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="text-sm font-bold text-ink">Notifications</span>
          {unread > 0 ? (
            <button
              type="button"
              data-offline-ok
              onClick={() => markAll.mutate()}
              className="flex items-center gap-1 text-xs font-semibold text-saffBtn"
            >
              <CheckCheck size={13} /> Mark all read
            </button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-soft">
            Nothing yet. Approvals, tasks and badges will show up here.
          </p>
        ) : (
          <>
            {today.length > 0 ? (
              <>
                <p className="bg-ivory px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-soft uppercase">
                  Today
                </p>
                {today.map(row)}
              </>
            ) : null}
            {earlier.length > 0 ? (
              <>
                <p className="bg-ivory px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-soft uppercase">
                  Earlier
                </p>
                {earlier.map(row)}
              </>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default NotificationBell;
