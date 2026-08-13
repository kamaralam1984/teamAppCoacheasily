import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { useMyProfile } from "@/hooks/useMyProfile";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Home | CoachEasily Team App" },
      {
        name: "description",
        content: "The CoachEasily warriors' home base — your team operating system.",
      },
      { property: "og:title", content: "Home | CoachEasily Team App" },
      {
        property: "og:description",
        content: "The CoachEasily warriors' home base — your team operating system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useMyProfile();
  const profile = data?.profile;

  return (
    <AppShell>
      <div className="ce-rise max-w-2xl py-6">
        <h1 className="font-display text-4xl leading-tight text-ink">
          Namaste, {profile?.full_name?.split(" ")[0] ?? "warrior"}
        </h1>
        <p className="mt-2 text-sm text-soft">
          {profile?.title ? `${profile.title} · ` : ""}
          {profile?.department ?? "CoachEasily"}
        </p>
        <div className="mt-8 border-l-2 border-goldL/60 pl-4">
          <p className="text-sm leading-relaxed text-soft">
            The foundation is in place. Your team lives under{" "}
            <span className="font-semibold text-ink">Warriors</span> — the rest of the workspace
            arrives screen by screen.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
