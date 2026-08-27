/**
 * Whether a request has *actually* failed to reach the server.
 *
 * Deliberately not `navigator.onLine` — that flag lies on VPNs, captive
 * portals and corporate networks. We only believe a real failed request,
 * and we forget it the moment anything succeeds.
 */

let failed = false;
const subscribers = new Set<() => void>();

function emit() {
  for (const cb of subscribers) cb();
}

export function subscribeNetwork(cb: () => void) {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function getNetworkFailed() {
  return failed;
}

/** The server always renders as "fine" — there is nothing to report yet. */
export function getNetworkFailedServer() {
  return false;
}

export function setNetworkFailed(value: boolean) {
  if (failed === value) return;
  failed = value;
  emit();
}

/** True when the error looks like the request never reached us. */
export function isNetworkError(error: unknown): boolean {
  const e = error as { message?: string; name?: string } | null;
  const msg = `${e?.name ?? ""} ${e?.message ?? ""}`.toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("fetch failed") ||
    msg.includes("typeerror: failed")
  );
}

export const NETWORK_FAILURE_MESSAGE =
  "That didn't reach us. Check your connection and try again.";
