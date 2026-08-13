import { useEffect, useMemo, useState } from "react";

import { useCalendarToken } from "@/hooks/useCalendar";
import { subscribeLinks } from "@/lib/calendarLinks";

interface Props {
  profileId: string | null;
  orgId: string | null;
}

export function SyncCard({ profileId, orgId }: Props) {
  const { token, isLoading, rotate } = useCalendarToken(profileId, orgId);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const links = useMemo(
    () => (token && origin ? subscribeLinks(origin, token) : null),
    [token, origin],
  );

  const copy = async () => {
    if (!links) return;
    try {
      await navigator.clipboard.writeText(links.url);
    } catch {
      // clipboard blocked — the field is selectable, so nothing is lost
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="ce-card p-5">
      <h2 className="font-display text-2xl text-ink">Sync to my calendar</h2>
      <p className="mt-1 text-sm text-soft">
        One private link that keeps itself up to date — programmes, holidays, meetings and your own
        approved leave.
      </p>

      {isLoading || !links ? (
        <p className="mt-4 text-sm text-soft">Preparing your private link…</p>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={links.url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Your private calendar link"
              className="ce-input min-w-0 flex-1 font-mono text-[12px]"
            />
            <button type="button" className="btn3d sm:w-auto" onClick={copy}>
              {copied ? "✓ Copied" : "Copy link"}
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <a
              className="btn3d btn3d-ghost text-center"
              href={links.google}
              target="_blank"
              rel="noreferrer"
            >
              Google Calendar
            </a>
            <a className="btn3d btn3d-ghost text-center" href={links.apple}>
              Apple Calendar
            </a>
            <a
              className="btn3d btn3d-ghost text-center"
              href={links.outlook}
              target="_blank"
              rel="noreferrer"
            >
              Outlook
            </a>
          </div>

          <ul className="mt-4 space-y-1.5 text-[13px] leading-relaxed text-soft">
            <li>
              <strong className="text-ink">Google</strong> — tap the button, or Other calendars → +
              → From URL, and paste the link.
            </li>
            <li>
              <strong className="text-ink">Apple (iPhone or Mac)</strong> — tap the button, or
              Settings → Calendar → Accounts → Add Subscribed Calendar.
            </li>
            <li>
              <strong className="text-ink">Outlook</strong> — tap the button, or Add calendar →
              Subscribe from web, and paste the link.
            </li>
          </ul>

          <p className="mt-4 rounded-lg border border-gold/40 bg-cream p-3 text-[13px] leading-relaxed text-goldD">
            Your calendar refreshes automatically every few hours. For same-day changes, this app is
            always the source of truth.
          </p>

          <div className="mt-4 border-t border-line pt-3">
            <p className="text-[13px] text-soft">
              This link is yours alone — it shows your leave. Never post it in a group.
            </p>
            {confirmRotate ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn3d btn3d-danger"
                  onClick={() => {
                    rotate.mutate(undefined, { onSettled: () => setConfirmRotate(false) });
                  }}
                >
                  Yes, break the old link
                </button>
                <button
                  type="button"
                  className="btn3d btn3d-ghost"
                  onClick={() => setConfirmRotate(false)}
                >
                  Keep it
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="mt-2 text-[13px] font-bold text-saffBtn underline"
                onClick={() => setConfirmRotate(true)}
              >
                Reset my link
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
