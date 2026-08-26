import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { HelpLink } from "@/components/help/HelpLink";
import { TeamPanel } from "@/components/goals/TeamPanel";
import { useMyProfile } from "@/hooks/useMyProfile";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team | CoachEasily Team App" },
      {
        name: "description",
        content:
          "See every goal in your line, who logged their numbers today and where the funnel is leaking.",
      },
      { property: "og:title", content: "Team | CoachEasily Team App" },
      {
        property: "og:description",
        content:
          "See every goal in your line, who logged their numbers today and where the funnel is leaking.",
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
  const allowed = role === "manager" || role === "hr" || role === "admin";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        <header className="ce-rise">
          <h1 className="font-display text-4xl text-ink">Team</h1>
          <HelpLink screen="team" />
          <p className="mt-1 text-sm text-soft">
            {role === "hr" || role === "admin"
              ? "Every warrior's goals for the active cycle."
              : "The goals of everyone in your reporting line."}
          </p>
        </header>

        {allowed ? (
          <TeamPanel canSeePast={role === "hr" || role === "admin"} />
        ) : (
          <p className="ce-card p-6 text-sm text-soft">
            This view is for managers and HR.
          </p>
        )}
      </div>
    </AppShell>
  );
}
