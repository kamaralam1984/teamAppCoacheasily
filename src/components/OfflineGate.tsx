import { useEffect } from "react";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";

import { useOnline } from "@/hooks/useOnline";

/**
 * Registers the service worker, shows a clear offline banner, and blocks every
 * save while the phone has no signal. Reads keep working from the cache.
 * There is deliberately no offline write queue.
 */
export function OfflineGate() {
  const online = useOnline();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  useEffect(() => {
    document.body.dataset["offline"] = online ? "" : "1";
    if (online) delete document.body.dataset["offline"];

    if (online) return;
    const block = (event: MouseEvent) => {
      const el = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        "button[type='submit'], .btn3d, [data-write]",
      );
      if (!el || el.hasAttribute("data-offline-ok") || el.tagName === "A") return;
      event.preventDefault();
      event.stopPropagation();
      toast.error("You're offline — saving is paused until you're back on the network.");
    };
    document.addEventListener("click", block, true);
    return () => document.removeEventListener("click", block, true);
  }, [online]);

  if (online) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-night2 px-4 py-2 text-center text-xs font-semibold text-goldL">
      <WifiOff size={14} />
      You&apos;re offline — you can read what&apos;s here, but saving is paused.
    </div>
  );
}

export default OfflineGate;
