import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { HrCards } from "@/components/overview/HrCards";
import { TeamTable } from "@/components/overview/TeamTable";
import { useDashHr, useDashTeam } from "@/hooks/useDashboards";
import { useMyProfile } from "@/hooks/useMyProfile";

export const Route = createFileRoute("/_authenticated/overview")({
  head: () => ({
    meta: [
      { title: "Overview | CoachEasily Team App" },
      {
        name: "description",
        content: "Attendance, tasks, goals and leave across your team or the whole company.",
      },
      { property: "og:title", content: "Overview | CoachEasily Team App" },
      {
        property: "og:description",
        content: "Attendance, tasks, goals and leave across your team or the whole company.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { data } = useMyProfile();
  const role = data?.profile?.role;
  const isHr = role === "hr" || role === "admin";
  const allowed = isHr || role === "manager";

  const team = useDashTeam(allowed);
  const hr = useDashHr(isHr);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-8 py-2">
        <header className="ce-rise">
          <h1 className="font-display text-4xl text-ink">
            {role === "admin" ? "Company overview" : isHr ? "People overview" : "Team overview"}
          </h1>
          <p className="mt-1 text-sm text-soft">
            {isHr
              ? "The whole company: attendance, leave, probation, goals and tasks. Open anyone to see more."
              : "Your team: who is in, what is open and how goals are going. Open anyone to see more."}
          </p>
        </header>

        {data && !allowed ? (
          <p className="ce-card p-6 text-sm text-soft">This view is for managers, HR and admin.</p>
        ) : (
          <>
            {isHr ? (
              hr.isLoading ? (
                <p className="text-sm text-soft">Loading…</p>
              ) : hr.error || !hr.data ? (
                <p className="text-sm text-red">The company numbers couldn't be loaded.</p>
              ) : (
                <HrCards data={hr.data} />
              )
            ) : null}

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-ink">{isHr ? "Everyone" : "Your team"}</h2>
              {team.isLoading ? (
                <p className="text-sm text-soft">Loading…</p>
              ) : team.error || !team.data ? (
                <p className="text-sm text-red">The team view couldn't be loaded.</p>
              ) : (
                <TeamTable rows={team.data.rows} canGroup={isHr} />
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
