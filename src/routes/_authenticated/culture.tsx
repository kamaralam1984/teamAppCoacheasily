import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/culture")({
  head: () => ({
    meta: [
      { title: "Culture | CoachEasily Team App" },
      { name: "description", content: "Culture for the CoachEasily warriors." },
      { property: "og:title", content: "Culture | CoachEasily Team App" },
      { property: "og:description", content: "Culture for the CoachEasily warriors." },
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
        <h1 className="font-display text-3xl text-ink">Culture</h1>
        <p className="mt-3 max-w-lg text-sm text-soft">
          This space is being built. It lands in an upcoming release.
        </p>
      </div>
    </AppShell>
  );
}
