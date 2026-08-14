import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { HolidaysCard } from "@/components/calendar/HolidaysCard";
import { CyclesCard } from "@/components/settings/CyclesCard";
import { DepartmentsCard } from "@/components/settings/DepartmentsCard";
import { LeaveQuotasCard } from "@/components/settings/LeaveQuotasCard";
import { PlaybookEditor } from "@/components/settings/PlaybookEditor";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useOrgSettings, useSaveOrgSettings } from "@/hooks/useOrg";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Admin settings | CoachEasily Team App" },
      {
        name: "description",
        content:
          "Departments, leave entitlements, holidays, cycles and daily playbooks — everything HR own, in one place.",
      },
      { property: "og:title", content: "Admin settings | CoachEasily Team App" },
      {
        property: "og:description",
        content:
          "Departments, leave entitlements, holidays, cycles and daily playbooks in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data } = useMyProfile();
  const profile = data?.profile ?? null;
  const allowed = profile?.role === "hr" || profile?.role === "admin";
  const { data: settings } = useOrgSettings(Boolean(allowed));
  const save = useSaveOrgSettings();

  if (profile && !allowed) {
    return (
      <AppShell>
        <div className="ce-card mx-auto mt-6 max-w-xl p-6 text-sm text-soft">
          These controls belong to HR. Ask Shubhangi or Supriya if something here
          needs changing.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5 py-2">
        <div className="ce-rise">
          <h1 className="font-display text-3xl text-ink">Admin settings</h1>
          <p className="mt-2 text-sm text-soft">
            Everything a human should own lives here. A change flows straight through the org
            chart, approvals, calendar, goals and reports.
          </p>
        </div>

        <DepartmentsCard orgId={profile?.org_id ?? null} />
        <LeaveQuotasCard />
        <HolidaysCard orgId={profile?.org_id ?? null} canManage />
        <CyclesCard />
        <PlaybookEditor orgId={profile?.org_id ?? null} />

        <section className="ce-card p-5">
          <h2 className="font-display text-2xl text-ink">Team birthdays</h2>
          <label className="mt-3 flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={Boolean(settings?.team_birthdays)}
              onChange={(e) =>
                save.mutate(
                  { team_birthdays: e.target.checked },
                  {
                    onSuccess: () => toast.success("Saved."),
                    onError: () => toast.error("That didn't save. Please try again."),
                  },
                )
              }
            />
            <span className="text-sm text-ink">
              Show everybody's birthday in “Coming up”. The founder's always shows.
            </span>
          </label>
        </section>

        <section className="ce-card p-5">
          <h2 className="font-display text-2xl text-ink">Daily and weekly digests</h2>
          <label className="mt-3 flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={Boolean(settings?.digests_enabled)}
              onChange={(e) =>
                save.mutate(
                  { digests_enabled: e.target.checked },
                  {
                    onSuccess: () => toast.success("Saved."),
                    onError: () => toast.error("That didn't save. Please try again."),
                  },
                )
              }
            />
            <span className="text-sm text-ink">
              Send the daily summary and the Monday manager digest by email.
            </span>
          </label>
          <p className="mt-2 text-[13px] text-soft">
            Digest emails also need the mail key configured — until it is, this switch stays
            quiet.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
