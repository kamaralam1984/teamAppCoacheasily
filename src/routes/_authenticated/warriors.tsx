import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { HelpLink } from "@/components/help/HelpLink";
import { PresenceBoard } from "@/components/PresenceBoard";
import { ExitDialog } from "@/components/warriors/ExitDialog";
import { InvitePanel, useLoginStatus } from "@/components/warriors/InvitePanel";
import { ProbationPanel } from "@/components/probation/ProbationPanel";
import { OrgChart } from "@/components/warriors/OrgChart";
import { OrgTree } from "@/components/warriors/OrgTree";
import { ProfileModal } from "@/components/warriors/ProfileModal";
import { WarriorForm } from "@/components/warriors/WarriorForm";
import { usePresenceToday } from "@/hooks/useDailyCode";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useMissingDetails } from "@/hooks/useMyDetails";

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
  // ?probation=<profile id> opens that warrior straight away (from the probation popup).
  validateSearch: (search: Record<string, unknown>): { probation?: string } =>
    typeof search["probation"] === "string" && search["probation"] !== "preview"
      ? { probation: search["probation"] }
      : {},
  component: WarriorsPage,
});

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-2xl text-ink">{children}</h2>;
}

function WarriorsPage() {
  const { data: mine } = useMyProfile();
  const { data: warriors, isLoading, error } = useWarriors();
  const { data: presence } = usePresenceToday(Boolean(mine?.profile));
  const [selected, setSelected] = useState<Profile | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [exiting, setExiting] = useState<Profile | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteOnly, setInviteOnly] = useState<Profile | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [layout, setLayout] = useState<"chart" | "list">("chart");

  const viewer = mine?.profile ?? null;
  const canManage = isPrivileged(viewer?.role);
  const all = useMemo(() => warriors ?? [], [warriors]);
  const { probation } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (!probation) return;
    const p = all.find((w) => w.id === probation);
    if (!p) return;
    setSelected(p);
    void navigate({ to: "/warriors", search: {}, replace: true });
  }, [probation, all, navigate]);
  const active = useMemo(() => all.filter((p) => p.status === "active"), [all]);
  const visible = useMemo(
    () => (canManage && showPast ? all : active),
    [all, active, canManage, showPast],
  );
  const tree = useMemo(() => buildTree(visible), [visible]);
  const { data: logins } = useLoginStatus(canManage);
  const { data: privateLite } = useMissingDetails(canManage);
  const withoutLogin = useMemo(
    () => (logins ? active.filter((p) => !logins.get(p.id)?.has_login).length : 0),
    [active, logins],
  );

  /** HR/Admin only — a quiet nudge list, never shown to anybody else. */
  const gaps = useMemo(() => {
    if (!canManage) return undefined;
    const map = new Map<string, string[]>();
    for (const p of active) {
      const priv = privateLite?.get(p.id);
      const missing: string[] = [];
      if (!p.date_of_birth) missing.push("date of birth");
      if (!p.phone?.trim()) missing.push("phone number");
      if (!priv?.emergency_name?.trim() || !priv?.emergency_phone?.trim())
        missing.push("emergency contact");
      if (missing.length > 0) map.set(p.id, missing);
    }
    return map;
  }, [active, canManage, privateLite]);

  const newJoiners = useMemo(
    () =>
      active
        .map((p) => ({ p, days: daysSince(p.joined_on) }))
        .filter(
          (x): x is { p: Profile; days: number } => x.days !== null && x.days >= 0 && x.days < 90,
        )
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
            <HelpLink screen="warriors" />
            <p className="mt-1.5 text-sm text-soft">
              {active.length} active {active.length === 1 ? "warrior" : "warriors"} at CoachEasily.
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-12 rounded-full border border-line px-5 text-[13px] font-bold text-ink hover:bg-cream"
                onClick={() => {
                  setInviteOnly(null);
                  setInviteOpen(true);
                }}
              >
                Logins &amp; invites{withoutLogin ? ` · ${withoutLogin} pending` : ""}
              </button>
              <button
                className="btn3d"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Add warrior
              </button>
            </div>
          ) : null}
        </header>

        <PresenceBoard rows={presence ?? []} />

        {canManage ? (
          <section className="ce-rise">
            <ProbationPanel
              onOpen={(id) => {
                const p = all.find((w) => w.id === id);
                if (p) setSelected(p);
              }}
            />
          </section>
        ) : null}

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeading>Org chart</SectionHeading>
            <div className="flex flex-wrap items-center gap-3">
              <div
                role="group"
                aria-label="Layout"
                className="flex gap-1 rounded-full border border-line p-1"
              >
                {(["chart", "list"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={layout === l}
                    onClick={() => setLayout(l)}
                    className={`min-h-9 rounded-full px-4 text-[13px] font-bold capitalize ${
                      layout === l ? "bg-cream text-goldD" : "text-soft hover:text-ink"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {canManage ? (
                <label className="flex items-center gap-2 text-[13px] text-soft">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={showPast}
                    onChange={(e) => setShowPast(e.target.checked)}
                  />
                  Show past warriors
                </label>
              ) : null}
            </div>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <p className="text-sm text-soft">Loading the team…</p>
            ) : error ? (
              <p className="text-sm text-red">The team couldn't be loaded. Please refresh.</p>
            ) : layout === "chart" ? (
              <OrgChart profiles={visible} viewerId={viewer?.id ?? null} onOpen={setSelected} />
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
                logins={logins}
                onInvite={(p) => {
                  setInviteOnly(p);
                  setInviteOpen(true);
                }}
                gaps={gaps}
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

      {inviteOpen && canManage ? (
        <InvitePanel
          tree={tree}
          statuses={logins}
          only={inviteOnly}
          onClose={() => {
            setInviteOpen(false);
            setInviteOnly(null);
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
