import { useEffect, useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

import {
  NETWORK_FAILURE_MESSAGE,
  getNetworkFailed,
  getNetworkFailedServer,
  subscribeNetwork,
} from "@/lib/netStatus";

/**
 * Registers the service worker and shows one quiet line *after* a request has
 * genuinely failed to reach us. It never disables, hides or gates a control,
 * and it clears itself the moment anything succeeds again.
 */
export function OfflineGate() {
  const failed = useSyncExternalStore(
    subscribeNetwork,
    getNetworkFailed,
    getNetworkFailedServer,
  );

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  if (!failed) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-night2 px-4 py-2 text-center text-xs font-semibold text-goldL"
    >
      <WifiOff size={14} />
      {NETWORK_FAILURE_MESSAGE}
    </div>
  );
}

export default OfflineGate;
