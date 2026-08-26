import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { HelpLink } from "@/components/help/HelpLink";
import { Celebrate } from "@/components/Celebrate";
import { Playbook } from "@/components/culture/Playbook";
import { BrainDump } from "@/components/tasks/BrainDump";

import { QuickAdd } from "@/components/tasks/QuickAdd";
import { TodayPanel } from "@/components/tasks/TodayPanel";
import { TaskRow } from "@/components/tasks/TaskRow";
import { WeekCard } from "@/components/tasks/WeekCard";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useWarriors } from "@/hooks/useWarriors";
import { useGoalsFor } from "@/hooks/useGoals";
import {
  myLine,
  useBlockedNudge,
  useCreateTasks,
  useDeleteTask,
  useReflections,
  useSaveReflection,
  useTasks,
  useUpdateTask,
} from "@/hooks/useTasks";
import { groupTasks, istToday, type Task } from "@/lib/tasks";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks | CoachEasily Team App" },
      {
        name: "description",
        content: "Your day, grouped honestly — overdue, today, tomorrow and everything after.",
      },
      { property: "og:title", content: "Tasks | CoachEasily Team App" },
      {
        property: "og:description",
        content: "Your day, grouped honestly — overdue, today, tomorrow and everything after.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { data } = useMyProfile();
  const me = data?.profile ?? null;
  const today = istToday();

  const { data: all } = useWarriors();
  const line = useMemo(() => myLine(all ?? [], me?.id ?? null), [all, me?.id]);
  const nameOf = (id: string | null) =>
    id ? ((all ?? []).find((p) => p.id === id)?.full_name ?? null) : null;

  const { data: tasks, isLoading } = useTasks(me?.id ?? null);
  const create = useCreateTasks(me?.org_id ?? null, me?.id ?? null);
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const { data: reflections } = useReflections(me?.id ?? null);
  const saveReflection = useSaveReflection(me?.id ?? null, me?.org_id ?? null);
  useBlockedNudge(Boolean(me));

  const [showDone, setShowDone] = useState(false);
  const [celebration, setCelebration] = useState<string | null>(null);

  const mine = useMemo(() => (tasks ?? []).filter((t) => t.owner_id === me?.id), [tasks, me?.id]);
  const groups = useMemo(() => groupTasks(mine, today), [mine, today]);
  const done = useMemo(
    () =>
      mine
        .filter((t) => t.done)
        .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "")),
    [mine],
  );
  const byId = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t])), [tasks]);

  const { data: myGoals } = useGoalsFor(me?.id ?? null);
  const goalOptions = useMemo(
    () => (myGoals ?? []).map((g) => ({ id: g.goal.id, name: g.goal.name })),
    [myGoals],
  );
  const goalNameOf = (id: string | null) =>
    id ? (goalOptions.find((g) => g.id === id)?.name ?? null) : null;

  const overdue = groups.find((g) => g.key === "overdue")?.tasks.length ?? 0;
  const dueToday = groups.find((g) => g.key === "today")?.tasks.length ?? 0;

  const toggle = (task: Task) => {
    update.mutate({ id: task.id, patch: { done: !task.done } });
    if (!task.done) setCelebration(`“${task.title}” is done. One less thing.`);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        {overdue + dueToday > 0 ? (
          <section className="ce-rise overflow-hidden rounded-[14px] bg-night p-6 text-white sm:p-7">
            <p className="text-[11px] font-bold tracking-[0.16em] text-mist uppercase">
              Today's focus
            </p>
            <h1 className="mt-3 font-display text-3xl leading-tight text-white sm:text-4xl">
              {overdue > 0
                ? `${overdue} task${overdue === 1 ? "" : "s"} slipped past`
                : `${dueToday} task${dueToday === 1 ? "" : "s"} due today`}
            </h1>
            <p className="mt-2 text-sm text-mist">
              {overdue > 0 && dueToday > 0
                ? `And ${dueToday} more due today. Pick one and start there.`
                : "Pick one and start there."}
            </p>
          </section>
        ) : (
          <section className="ce-rise ce-card p-6">
            <h1 className="font-display text-3xl text-ink">Your tasks</h1>
          <HelpLink screen="tasks" />
            <p className="mt-1.5 text-sm text-soft">
              Nothing overdue and nothing due today. Good place to be.
            </p>
          </section>
        )}

        {me ? (
          <Playbook me={me} canEdit={me.role === "hr" || me.role === "admin"} />
        ) : null}



        {me ? (
          <TodayPanel
            profile={me}
            adding={create.isPending}
            onAddTask={(title) =>
              create.mutate([
                { title, slot: "Anytime", priority: "Normal", owner_id: me.id },
              ])
            }
          />
        ) : null}

        {me ? (
          <QuickAdd
            meId={me.id}
            line={line}
            openTasks={mine.filter((t) => !t.done)}
            goals={goalOptions}
            pending={create.isPending}
            onAdd={(input) =>
              create.mutate([input], {
                onSuccess: () => {
                  if (input.owner_id !== me.id) {
                    setCelebration(`Handed to ${nameOf(input.owner_id) ?? "your teammate"}.`);
                  }
                },
              })
            }
          />
        ) : null}

        {isLoading ? <p className="text-sm text-soft">Loading your tasks…</p> : null}

        {groups.map((g) => (
          <section key={g.key} className="ce-rise">
            <div className="flex items-center gap-2">
              <span aria-hidden className={`h-2 w-2 rounded-full ${g.dot}`} />
              <h2 className={`text-[11px] font-bold tracking-[0.16em] uppercase ${g.text}`}>
                {g.label} · {g.tasks.length}
              </h2>
            </div>
            <div className="mt-3 space-y-2.5">
              {g.tasks.map((t) => {
                const blocker = t.blocked_by ? (byId.get(t.blocked_by) ?? null) : null;
                return (
                  <TaskRow
                    key={t.id}
                    task={t}
                    mine
                    goalName={goalNameOf(t.goal_id)}
                    fromName={t.created_by !== me?.id ? nameOf(t.created_by) : null}
                    blockerTitle={blocker && !blocker.done ? blocker.title : null}
                    blockerLate={Boolean(
                      blocker && !blocker.done && blocker.due_date && blocker.due_date < today,
                    )}
                    onToggle={toggle}
                    onDelete={(task) => remove.mutate(task.id)}
                  />
                );
              })}
            </div>
          </section>
        ))}

        {line.length > 0 ? (
          <LineTasks
            tasks={(tasks ?? []).filter((t) => t.owner_id !== me?.id && !t.done)}
            nameOf={nameOf}
            onToggle={toggle}
          />
        ) : null}

        {done.length > 0 ? (
          <section className="ce-rise">
            <button
              type="button"
              className="min-h-11 text-[11px] font-bold tracking-[0.16em] text-soft uppercase"
              onClick={() => setShowDone((v) => !v)}
            >
              {showDone ? "Hide" : "Show"} done · {done.length}
            </button>
            {showDone ? (
              <div className="mt-3 space-y-2.5">
                {done.slice(0, 40).map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onToggle={toggle}
                    onDelete={(task) => remove.mutate(task.id)}
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {me ? (
          <BrainDump
            meId={me.id}
            line={line}
            pending={create.isPending}
            onConfirm={(inputs) =>
              create.mutate(inputs, {
                onSuccess: (n) => setCelebration(`${n} task${n === 1 ? "" : "s"} added.`),
              })
            }
          />
        ) : null}

        <WeekCard
          tasks={mine}
          reflections={reflections ?? []}
          saving={saveReflection.isPending}
          onSave={(note) => saveReflection.mutate({ date: today, note })}
        />
      </div>

      {celebration ? (
        <Celebrate message={celebration} onDone={() => setCelebration(null)} />
      ) : null}
    </AppShell>
  );
}

function LineTasks({
  tasks,
  nameOf,
  onToggle,
}: {
  tasks: Task[];
  nameOf: (id: string | null) => string | null;
  onToggle: (task: Task) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className="ce-rise">
      <h2 className="text-[11px] font-bold tracking-[0.16em] text-soft uppercase">
        With your team · {tasks.length}
      </h2>
      <div className="mt-3 space-y-2.5">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} ownerName={nameOf(t.owner_id)} onToggle={onToggle} />
        ))}
      </div>
    </section>
  );
}
