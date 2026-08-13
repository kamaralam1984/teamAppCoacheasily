import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/leave")({
  head: () => ({
    meta: [
      { title: "Leave | CoachEasily Team App" },
      { name: "description", content: "Leave for the CoachEasily warriors." },
      { property: "og:title", content: "Leave | CoachEasily Team App" },
      { property: "og:description", content: "Leave for the CoachEasily warriors." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <div className="ce-rise ce-card p-8">
        <h1 className="font-display text-3xl text-ink">Leave</h1>
        <p className="mt-3 max-w-lg text-sm text-soft">
          This space is being built. It lands in an upcoming release.
        </p>
      </div>
    </AppShell>
  );
}
