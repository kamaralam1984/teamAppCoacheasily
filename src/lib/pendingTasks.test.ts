import { describe, it as test } from "node:test";
import { equal, deepEqual } from "node:assert/strict";
import { completedSummary, doneLine, whatsLeft } from "./pendingTasks";
import type { Task } from "./tasks";

const TODAY = "2026-10-20";
let n = 0;
const task = (over: Partial<Task>): Task =>
  ({
    id: `t${++n}`,
    title: `Task ${n}`,
    due_date: null,
    status: "accepted",
    done: false,
    done_at: null,
    blocked_by: null,
    created_at: `2026-10-0${(n % 9) + 1}T05:00:00Z`,
    ...over,
  }) as unknown as Task;

const index = (tasks: Task[]) => new Map(tasks.map((t) => [t.id, t]));

describe("What is left", () => {
  const late = task({ title: "Late", due_date: "2026-10-17" });
  const today = task({ title: "Today", due_date: TODAY, status: "in_progress" });
  const soon = task({ title: "Soon", due_date: "2026-10-25" });
  const undated = task({ title: "Undated" });
  const review = task({ title: "Review", due_date: "2026-10-18", status: "review" });
  const done = task({ title: "Done", status: "completed", done: true });
  const blockerTask = task({ title: "Blocker", due_date: "2026-10-30" });
  const blocked = task({ title: "Blocked", due_date: "2026-10-22", blocked_by: blockerTask.id });
  const all = [late, today, soon, undated, review, done, blockerTask, blocked];
  const left = whatsLeft(all, index(all), TODAY);

  test("completed tasks are not left", () => {
    equal(left.total, 7);
    equal(
      left.items.some((i) => i.task.title === "Done"),
      false,
    );
  });
  test("counts", () => {
    equal(left.overdue, 2);
    equal(left.dueToday, 1);
    equal(left.inProgress, 1);
    equal(left.inReview, 1);
    equal(left.blocked, 1);
    equal(left.noDate, 1);
    equal(left.notStarted, 5);
  });
  test("late work comes first, then today, then the rest, and waiting ones last", () => {
    deepEqual(
      left.items.map((i) => i.task.title),
      ["Late", "Today", "Soon", "Blocker", "Undated", "Review", "Blocked"],
    );
  });
  test("each task says what is missing", () => {
    const reason = (t: string) => left.items.find((i) => i.task.title === t)!.reason;
    equal(reason("Late"), "3 days late — was due 17 Oct, not started");
    equal(reason("Today"), "Due today — in progress");
    equal(reason("Review"), "Sent for review — waiting for the person who asked");
    equal(reason("Blocked"), "Waiting on “Blocker”");
    equal(reason("Undated"), "No date — not started");
  });
  test("a finished blocker no longer blocks", () => {
    const finished = { ...blockerTask, status: "completed", done: true } as Task;
    const tasks = [finished, blocked];
    const l = whatsLeft(tasks, index(tasks), TODAY);
    equal(l.blocked, 0);
    equal(l.items[0]!.reason, "Due 22 Oct — not started");
  });
  test("one day late is singular", () => {
    const one = task({ due_date: "2026-10-19" });
    equal(whatsLeft([one], index([one]), TODAY).items[0]!.reason.startsWith("1 day late"), true);
  });
  test("nothing left", () => {
    const l = whatsLeft([done], index([done]), TODAY);
    equal(l.total, 0);
    deepEqual(l.items, []);
  });
});

describe("Completed", () => {
  const at = (iso: string) => iso;
  const onTime = task({
    due_date: "2026-10-18",
    status: "completed",
    done: true,
    done_at: at("2026-10-18T10:00:00Z"),
  });
  const lateDone = task({
    due_date: "2026-10-10",
    status: "completed",
    done: true,
    done_at: at("2026-10-14T10:00:00Z"),
  });
  const noDate = task({ status: "completed", done: true, done_at: at("2026-10-01T10:00:00Z") });
  const open = task({});

  test("lines say on time or how late", () => {
    equal(doneLine(onTime), "Done 18 Oct · on time");
    equal(doneLine(lateDone), "Done 14 Oct · 4 days late");
    equal(doneLine(noDate), "Done 1 Oct");
  });
  test("newest first, and this week is counted", () => {
    const s = completedSummary([noDate, onTime, lateDone, open], TODAY);
    deepEqual(
      s.done.map((t) => t.id),
      [onTime.id, lateDone.id, noDate.id],
    );
    equal(s.thisWeek, 2);
  });
});
