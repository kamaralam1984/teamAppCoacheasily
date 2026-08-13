import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { CyclePanel } from "@/components/goals/CyclePanel";
import { GoalCard } from "@/components/goals/GoalCard";
import {
  GoalForm,
  draftFromGoal,
  emptyDraft,
  type GoalDraft,
} from "@/components/goals/GoalForm";
import { PreviousCycleCard } from "@/components/goals/PreviousCycleCard";
import { useCycles, useGoalsFor } from "@/hooks/useGoals";
import { useMyProfile } from "@/hooks/useMyProfile";

export const Route = createFileRoute("/_authenticated/goals")({
  head: () => ({
    meta: [
      { title: "Goals | CoachEasily Team App" },
      {
        name: "description",
        content:
          "Write your goals for the cycle, log your numbers daily and watch the weakest step in your funnel.",
      },
      { property: "og:title", content: "Goals | CoachEasily Team App" },
      {
        property: "og:description",
        content:
          "Write your goals for the cycle, log your numbers daily and watch the weakest step in your funnel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { data } = useMyProfile();
  const profile = data?.profile ?? null;
  const { data: cycles } = useCycles();

  const active = useMemo(() => cycles?.find((c) => c.status === "active") ?? null, [cycles]);
  const previous = useMemo(
    () => cycles?.filter((c) => c.status === "closed")[0] ?? null,
    [cycles],
  );

  const { data: goals } = useGoalsFor(profile ? undefined : null, active?.id ?? null);
  const [draft, setDraft] = useState<GoalDraft | null>(null);

  const canOpenCycle = profile?.role === "hr" || profile?.role === "admin";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        <header className="ce-rise">
          <h1 className="font-display text-4xl text-ink">Your goals</h1>
          <p className="mt-1 text-sm text-soft">
            Measured from where you started — never from zero.
          </p>
        </header>

        <CyclePanel cycle={active} canOpen={Boolean(canOpenCycle)} style={{ animationDelay: "60ms" }} />

        {active && previous && profile ? (
          <PreviousCycleCard
            cycle={previous}
            profileId={profile.id}
            onCarryForward={(d) => setDraft(d)}
            style={{ animationDelay: "100ms" }}
          />
        ) : null}

        {active && profile ? (
          draft ? (
            <GoalForm
              cycle={active}
              profileId={profile.id}
              orgId={profile.org_id}
              department={profile.department}
              initial={draft}
              onDone={() => setDraft(null)}
              onCancel={() => setDraft(null)}
            />
          ) : (
            <button type="button" className="btn3d w-full sm:w-auto" onClick={() => setDraft(emptyDraft())}>
              + Write a goal
            </button>
          )
        ) : null}

        {(goals ?? []).map((item, i) => (
          <GoalCard
            key={item.goal.id}
            item={item}
            editable
            onEdit={() => setDraft(draftFromGoal(item.goal))}
            style={{ animationDelay: `${140 + i * 60}ms` }}
          />
        ))}

        {active && (goals ?? []).length === 0 && !draft ? (
          <p className="text-sm text-soft">
            Nothing written for {active.name} yet. Four short steps and you're done.
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
