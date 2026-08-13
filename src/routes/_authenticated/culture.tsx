import { Link, createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { useMyProfile } from "@/hooks/useMyProfile";

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
  const { data } = useMyProfile();
  const role = data?.profile?.role;
  const canEdit = role === "hr" || role === "admin";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        <section className="ce-rise ce-card p-8">
          <h1 className="font-display text-3xl text-ink">Culture</h1>
          <p className="mt-3 max-w-lg text-sm text-soft">
            Honesty · Dedication · Genuine Care. Every morning starts with one of them, in the
            daily code each warrior reads before marking attendance.
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
      </div>
    </AppShell>
  );
}
