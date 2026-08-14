import { useEffect, useMemo, useState } from "react";
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
import { ImportGoals } from "@/components/goals/ImportGoals";
import { PreviousCycleCard } from "@/components/goals/PreviousCycleCard";
import { ReviewMode, type ReviewSlide } from "@/components/goals/ReviewMode";
import { useCycles, useGoalsFor, useTeamGoals } from "@/hooks/useGoals";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useWarriors } from "@/hooks/useWarriors";
import { allTemplates, applyTemplate, templatesFor } from "@/lib/goals";

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

  const role = profile?.role ?? "member";
  const canOpenCycle = role === "hr" || role === "admin";
  const canImport = role === "hr" || role === "admin";
  const { data: warriors } = useWarriors(canImport);
  const canLead = role === "manager" || role === "hr" || role === "admin";

  /* Review mode — "mine" for the person presenting, "team" to walk the whole line. */
  const [review, setReview] = useState<null | "mine" | "team">(null);
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("review=1")) {
      setReview("mine");
    }
  }, []);

  const { data: team } = useTeamGoals(canLead && review === "team", active?.id ?? null);

  const mySlides: ReviewSlide[] = useMemo(
    () =>
      (goals ?? []).map((item) => ({
        personName: profile?.full_name ?? "You",
        personTitle: profile?.title ?? null,
        item,
      })),
    [goals, profile?.full_name, profile?.title],
  );

  const teamSlides: ReviewSlide[] = useMemo(
    () =>
      (team ?? []).flatMap((row) =>
        row.goals.map((item) => ({
          personName: row.profile.full_name,
          personTitle: row.profile.title,
          item,
        })),
      ),
    [team],
  );

  const starters = templatesFor(profile?.department).length
    ? templatesFor(profile?.department)
    : allTemplates();

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        <header className="ce-rise">
          <h1 className="font-display text-4xl text-ink">Your goals</h1>
          <p className="mt-1 text-sm text-soft">
            Measured from where you started — never from zero.
          </p>
        </header>

        {active && (goals ?? []).length > 0 ? (
          <div className="ce-rise flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-11 rounded-full border border-line bg-ivory px-4 text-[13px] font-bold text-ink"
              onClick={() => setReview("mine")}
            >
              ▶ Review mode
            </button>
            {canLead ? (
              <button
                type="button"
                className="min-h-11 rounded-full border border-line bg-ivory px-4 text-[13px] font-bold text-ink"
                onClick={() => setReview("team")}
              >
                ▶ Review my team
              </button>
            ) : null}
          </div>
        ) : null}

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

        {canImport && active && profile ? (
          <ImportGoals
            cycle={active}
            orgId={profile.org_id}
            people={warriors ?? []}
            style={{ animationDelay: "120ms" }}
          />
        ) : null}

        {(goals ?? []).map((item, i) => (
          <GoalCard
            key={item.goal.id}
            item={item}
            editable
            onEdit={() =>
              setDraft(
                draftFromGoal(
                  item.goal,
                  item.progress?.entries_count ?? 0,
                  item.progress?.current_value ?? undefined,
                ),
              )
            }
            style={{ animationDelay: `${140 + i * 60}ms` }}
          />
        ))}

        {active && (goals ?? []).length === 0 && !draft ? (
          <section className="ce-rise ce-card p-6">
            <h2 className="font-display text-2xl text-ink">
              Nothing written yet — start from one of these
            </h2>
            <p className="mt-1 text-[13px] text-soft">
              A template is a starting point, never a cage. Every step can be renamed, reordered,
              added to or removed before you save.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {starters.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="min-h-11 rounded-full border border-line bg-cream px-3 text-[12px] font-bold text-ink"
                  onClick={() => setDraft({ ...emptyDraft(), ...applyTemplate(t) })}
                >
                  {t.name}
                  <span className="ml-2 font-normal text-soft">{t.department}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn3d mt-5 w-full sm:w-auto"
              onClick={() => setDraft(emptyDraft())}
            >
              Or write your own
            </button>
          </section>
        ) : null}

      </div>

      {review && active ? (
        <ReviewMode
          cycle={active}
          slides={review === "mine" ? mySlides : teamSlides}
          showSummary={review === "team"}
          onClose={() => setReview(null)}
        />
      ) : null}
    </AppShell>
  );
}
