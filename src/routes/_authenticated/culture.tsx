import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { HelpLink } from "@/components/help/HelpLink";
import { CheckInRequest } from "@/components/culture/CheckInRequest";
import {
  GiveRecognition,
  MyShelf,
  RecognitionCard,
} from "@/components/culture/RecognitionWall";
import { useRecognitions } from "@/hooks/useCulture";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useWarriors } from "@/hooks/useWarriors";
import { compareTeam } from "@/lib/teamOrder";

export const Route = createFileRoute("/_authenticated/culture")({
  head: () => ({
    meta: [
      { title: "Culture | CoachEasily Team App" },
      {
        name: "description",
        content:
          "The recognition wall, your private energy check-in and the daily code that starts every CoachEasily morning.",
      },
      { property: "og:title", content: "Culture | CoachEasily Team App" },
      {
        property: "og:description",
        content:
          "Appreciation, badges and a private check-in for the CoachEasily warriors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Tab = "wall" | "shelf" | "checkin";

function Page() {
  const { data } = useMyProfile();
  const me = data?.profile ?? null;
  const role = me?.role;
  const canEdit = role === "hr" || role === "admin";
  const isLead = role === "manager" || role === "hr" || role === "admin";

  const { data: people } = useWarriors();
  const { data: rows, isLoading } = useRecognitions();
  const [tab, setTab] = useState<Tab>("wall");

  const feed = useMemo(() => rows ?? [], [rows]);

  /** Appreciation and badges stay newest-first; the "joined" cards are the team, listed in order of post. */
  const wall = useMemo(() => {
    const byId = new Map((people ?? []).map((p) => [p.id, p]));
    const moments = feed.filter((r) => r.kind !== "welcome");
    const team = feed
      .filter((r) => r.kind === "welcome")
      .map((r) => ({ row: r, who: byId.get(r.to_id) }))
      .filter((x) => x.who === undefined || x.who.status === "active")
      .sort((a, b) =>
        a.who && b.who ? compareTeam(a.who, b.who) : a.who ? -1 : b.who ? 1 : 0,
      )
      .map((x) => x.row);
    return { moments, team };
  }, [feed, people]);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        <section className="ce-rise ce-card p-8">
          <h1 className="font-display text-3xl text-ink">Culture</h1>
          <HelpLink screen="culture" />
          <p className="mt-3 max-w-lg text-sm text-soft">
            Honesty · Dedication · Genuine Care. We are spread across a city and a country — so we
            say the good things out loud, and we keep the hard things private.
          </p>
          {canEdit ? (
            <Link
              to="/daily-codes"
              className="btn3d mt-6 inline-flex w-full items-center justify-center sm:w-auto"
            >
              Edit the daily codes
            </Link>
          ) : null}
        </section>

        <div className="flex gap-2 overflow-x-auto">
          {(
            [
              ["wall", "Recognition wall"],
              ["shelf", "My shelf"],
              ["checkin", "Ask for a check-in"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-[13px] font-bold transition ${
                tab === key
                  ? "border-goldD bg-gold/15 text-goldD"
                  : "border-line bg-ivory text-soft"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {!me ? (
          <p className="text-[13px] text-soft">Loading your profile…</p>
        ) : tab === "wall" ? (
          <>
            <GiveRecognition me={me} people={people ?? []} canBadge={isLead} />
            {isLoading ? (
              <p className="text-[13px] text-soft">Loading the wall…</p>
            ) : feed.length === 0 ? (
              <section className="ce-card p-6">
                <p className="text-[14px] text-soft">
                  Nothing on the wall yet. Be the first — appreciate someone who helped you this
                  week.
                </p>
              </section>
            ) : (
              <>
                {wall.moments.length > 0 ? (
                  <div className="space-y-3">
                    {wall.moments.map((r, i) => (
                      <RecognitionCard
                        key={r.id}
                        row={r}
                        people={people ?? []}
                        style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                      />
                    ))}
                  </div>
                ) : null}
                {wall.team.length > 0 ? (
                  <section aria-label="The team" className="space-y-3">
                    <div>
                      <h2 className="font-display text-2xl text-ink">The team</h2>
                      <p className="text-[12px] text-soft">
                        Founder first, then People & Culture, then everyone by post and role.
                      </p>
                    </div>
                    {wall.team.map((r, i) => (
                      <RecognitionCard
                        key={r.id}
                        row={r}
                        people={people ?? []}
                        style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                      />
                    ))}
                  </section>
                ) : null}
              </>
            )}
          </>
        ) : tab === "shelf" ? (
          <MyShelf rows={feed} people={people ?? []} meId={me.id} />
        ) : (
          <CheckInRequest me={me} people={people ?? []} isLead={isLead} />
        )}

      </div>
    </AppShell>
  );
}
