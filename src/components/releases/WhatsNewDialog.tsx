import { Link } from "@tanstack/react-router";

import type { Release } from "@/hooks/useReleases";

export function WhatsNewDialog({
  release,
  onClose,
  closing,
}: {
  release: Release;
  onClose: () => void;
  closing?: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="What's new"
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/70 p-4"
    >
      <div className="ce-card flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden">
        <div className="border-b border-line p-6">
          <p className="ce-label">What's new</p>
          <h2 className="mt-1 font-display text-2xl leading-snug text-ink">{release.title}</h2>
          {release.summary ? (
            <p className="mt-2 text-[14px] leading-[1.7] text-soft">{release.summary}</p>
          ) : null}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {release.items.map((item) => (
            <div key={item.id} className="rounded-lg border border-line bg-ivory p-4">
              <h3 className="font-display text-lg leading-snug text-ink">{item.title}</h3>
              {item.what_it_does ? (
                <p className="mt-2 text-[13px] leading-[1.7] text-soft">{item.what_it_does}</p>
              ) : null}
              {item.how_to_use ? (
                <p className="mt-2 text-[13px] leading-[1.7] text-ink">
                  <span className="font-bold">How to use it — </span>
                  {item.how_to_use}
                </p>
              ) : null}
              {item.why_it_helps ? (
                <p className="mt-2 text-[13px] leading-[1.7] text-soft">
                  <span className="font-bold text-ink">Why it helps — </span>
                  {item.why_it_helps}
                </p>
              ) : null}
              {item.credit ? (
                <p className="mt-3 text-[12px] font-bold text-goldD">
                  Suggested by {item.credit}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-line p-6 sm:flex-row sm:items-center">
          <button type="button" className="btn3d w-full sm:w-auto" onClick={onClose} disabled={closing}>
            {closing ? "Closing…" : "Got it"}
          </button>
          <Link
            to="/whats-new"
            onClick={onClose}
            className="text-[13px] font-bold text-goldD sm:ml-auto"
          >
            See everything we've shipped →
          </Link>
        </div>
      </div>
    </div>
  );
}
