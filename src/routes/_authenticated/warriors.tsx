import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { ExitDialog } from "@/components/warriors/ExitDialog";
import { OrgTree } from "@/components/warriors/OrgTree";
import { ProfileModal } from "@/components/warriors/ProfileModal";
import { WarriorForm } from "@/components/warriors/WarriorForm";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useWarriors } from "@/hooks/useWarriors";
import {
  buildTree,
  daysSince,
  isOffToday,
  isPrivileged,
  upcomingAnniversary,
  type Anniversary,
  type Profile,
} from "@/lib/warriors";

export const Route = createFileRoute("/_authenticated/warriors")({
  head: () => ({
    meta: [
      { title: "Warriors | CoachEasily Team App" },
      {
        name: "description",
        content: "The CoachEasily org chart — every warrior, who they report to and what they own.",
      },
      { property: "og:title", content: "Warriors | CoachEasily Team App" },
      {
        property: "og:description",
        content: "The CoachEasily org chart — every warrior, who they report to and what they own.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WarriorsPage,
});

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-2xl text-ink">{children}</h2>;
}

function WarriorsPage() {
  const { data: mine } = useMyProfile();
  const { data: warriors, isLoading, error } = useWarriors();
  const [selected, setSelected] = useState<Profile | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [exiting, setExiting] = useState<Profile | null>(null);
  const [showEveryone, setShowEveryone] = useState(false);

  const viewer = mine?.profile ?? null;
  const canManage = isPrivileged(viewer?.role);
  const all = useMemo(() => warriors ?? [], [warriors]);
  const active = useMemo(() => all.filter((p) => p.status === "active"), [all]);
  const tree = useMemo(() => buildTree(all), [all]);
  const offToday = useMemo(() => active.filter((p) => isOffToday(p)), [active]);
  const working = useMemo(() => active.filter((p) => !isOffToday(p)), [active]);

  const newJoiners = useMemo(
    () =>
      active
        .map((p) => ({ p, days: daysSince(p.joined_on) }))
        .filter((x): x is { p: Profile; days: number } => x.days !== null && x.days >= 0 && x.days < 90)
        .sort((a, b) => a.days - b.days),
    [active],
  );

  const anniversaries = useMemo(
    () =>
      active
        .map((p) => ({ p, ann: upcomingAnniversary(p.joined_on) }))
        .filter((x): x is { p: Profile; ann: Anniversary } => x.ann !== null && x.ann.days <= 30)
        .sort((a, b) => a.ann.days - b.ann.days),
    [active],
  );

  return (
    <AppShell>
      <div className="space-y-10">
        <header className="ce-rise flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl leading-tight text-ink">Warriors</h1>
            <p className="mt-1.5 text-sm text-soft">
              {active.length} active {active.length === 1 ? "warrior" : "warriors"} at CoachEasily.
            </p>
          </div>
          {canManage ? (
            <button
              className="btn3d"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Add warrior
            </button>
          ) : null}
        </header>

        <section className="ce-rise">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <SectionHeading>Who's around today</SectionHeading>
            <p className="text-sm text-soft">
              {working.length} working · {offToday.length} on weekly off
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(showEveryone ? active : active.slice(0, 8)).map((p) => {
              const off = isOffToday(p);
              return (
                <span
                  key={p.id}
                  className={
                    off
                      ? "inline-flex items-center rounded-full border border-line bg-cream px-3 py-2 text-[13px] font-semibold text-soft"
                      : "inline-flex items-center rounded-full border border-line bg-ivory px-3 py-2 text-[13px] font-semibold text-ink"
                  }
                >
                  <span
                    className={
                      off
                        ? "mr-2 inline-block h-1.5 w-1.5 rounded-full bg-soft/50"
                        : "mr-2 inline-block h-1.5 w-1.5 rounded-full bg-emer"
                    }
                  />
                  {p.full_name}
                </span>
              );
            })}
            {active.length > 8 ? (
              <button
                type="button"
                onClick={() => setShowEveryone((v) => !v)}
                className="inline-flex min-h-11 items-center rounded-full px-3 text-[13px] font-bold text-saffBtn underline-offset-4 hover:underline"
              >
                {showEveryone ? "Show fewer" : `Show all ${active.length}`}
              </button>
            ) : null}
          </div>
        </section>

        {canManage ? (
          <section className="ce-rise grid gap-5 md:grid-cols-2">
            <div className="ce-card p-6">
              <SectionHeading>First 90 days</SectionHeading>
              <div className="mt-4 space-y-3">
                {newJoiners.length === 0 ? (
                  <p className="text-sm text-soft">Nobody is in their first 90 days right now.</p>
                ) : (
                  newJoiners.map(({ p, days }) => (
                    <div key={p.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-ink">{p.full_name}</span>
                      <span className="flex items-center gap-2 text-[13px] text-soft">
                        Day {days}
                        {days >= 83 ? (
                          <span className="rounded-full bg-saff/12 px-2 py-0.5 text-[10px] font-bold tracking-wider text-saffBtn uppercase">
                            Review due
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="ce-card p-6">
              <SectionHeading>Work anniversaries · next 30 days</SectionHeading>
              <div className="mt-4 space-y-3">
                {anniversaries.length === 0 ? (
                  <p className="text-sm text-soft">No anniversaries in the next 30 days.</p>
                ) : (
                  anniversaries.map(({ p, ann }) => (
                    <div key={p.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-ink">{p.full_name}</span>
                      <span className="text-[13px] text-soft">
                        {ann.years} year{ann.years > 1 ? "s" : ""} on {ann.label}
                        {ann.days === 0 ? " · today" : ""}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        ) : null}

        <section className="ce-rise">
          <SectionHeading>Org chart</SectionHeading>
          <div className="mt-4">
            {isLoading ? (
              <p className="text-sm text-soft">Loading the team…</p>
            ) : error ? (
              <p className="text-sm text-red">The team couldn't be loaded. Please refresh.</p>
            ) : (
              <OrgTree
                tree={tree}
                onOpen={setSelected}
                canManage={canManage}
                onEdit={(p) => {
                  setEditing(p);
                  setFormOpen(true);
                }}
                onExit={(p) => setExiting(p)}
              />

            )}
          </div>
        </section>
      </div>

      <ProfileModal
        profile={selected}
        profiles={all}
        viewer={viewer}
        onClose={() => setSelected(null)}
        onEdit={(p) => {
          setSelected(null);
          setEditing(p);
          setFormOpen(true);
        }}
        onExit={(p) => {
          setSelected(null);
          setExiting(p);
        }}
      />

      {formOpen && viewer ? (
        <WarriorForm
          editing={editing}
          profiles={all}
          orgId={viewer.org_id}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      ) : null}

      {exiting && viewer ? (
        <ExitDialog
          warrior={exiting}
          profiles={all}
          orgId={viewer.org_id}
          onClose={() => setExiting(null)}
        />
      ) : null}
    </AppShell>
  );
}
