import { useState } from "react";
import { toast } from "sonner";

import {
  buildCsv,
  buildPdf,
  buildXlsx,
  downloadBytes,
  MIME,
  safeFileName,
  type ExportColumn,
  type ExportRow,
} from "@/lib/exporters";
import { compareTasks, REPEAT_BADGE, shortDay, type Task } from "@/lib/tasks";
import { STATUS_LABEL, statusOf } from "@/lib/taskWorkflow";

type Kind = "csv" | "xlsx" | "pdf";
type Scope = "mine" | "all";

const COLUMNS: ExportColumn[] = [
  { key: "title", label: "Task" },
  { key: "details", label: "Details" },
  { key: "for", label: "For" },
  { key: "asked_by", label: "Asked by" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "due", label: "Due" },
  { key: "when", label: "When" },
  { key: "repeats", label: "Repeats" },
  { key: "created", label: "Created" },
];

/**
 * Take the task list away as CSV, Excel or PDF. "Mine" is the tasks I own; "everything I can see"
 * adds my team's tasks (whatever the tasks query returned under RLS).
 */
export function TaskDownload({
  tasks,
  meId,
  nameOf,
}: {
  tasks: Task[];
  meId: string;
  nameOf: (id: string | null) => string | null;
}) {
  const [scope, setScope] = useState<Scope>("mine");
  const [openOnly, setOpenOnly] = useState(false);
  const seesOthers = tasks.some((t) => t.owner_id !== meId);

  function download(kind: Kind) {
    const picked = tasks
      .filter((t) => (scope === "mine" || !seesOthers ? t.owner_id === meId : true))
      .filter((t) => (openOnly ? !t.done : true))
      .sort(compareTasks);
    if (picked.length === 0) {
      toast.error("There are no tasks to download with these choices.");
      return;
    }
    const rows: ExportRow[] = picked.map((t) => ({
      title: t.title,
      details: t.description ?? "",
      for: t.owner_id === meId ? "Me" : (nameOf(t.owner_id) ?? ""),
      asked_by:
        !t.created_by || t.created_by === t.owner_id
          ? "Self"
          : t.created_by === meId
            ? "Me"
            : (nameOf(t.created_by) ?? ""),
      status: STATUS_LABEL[statusOf(t)],
      priority: t.priority,
      due: t.due_date ? shortDay(t.due_date) : "",
      when: t.slot,
      repeats: REPEAT_BADGE[t.repeats]?.replace("↻ ", "") ?? "",
      created: new Date(t.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    }));
    const title = scope === "all" && seesOthers ? "Team tasks" : "My tasks";
    const subtitle = `${picked.length} task${picked.length === 1 ? "" : "s"}${openOnly ? " still open" : ""}`;
    const name = safeFileName(title, kind);
    if (kind === "csv") downloadBytes(name, buildCsv(COLUMNS, rows), MIME.csv);
    else if (kind === "xlsx") downloadBytes(name, buildXlsx(title, COLUMNS, rows), MIME.xlsx);
    else downloadBytes(name, buildPdf(title, subtitle, COLUMNS, rows), MIME.pdf);
  }

  return (
    <section className="ce-card p-5">
      <h2 className="text-[11px] font-bold tracking-[0.16em] text-soft uppercase">
        Download tasks
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-ink">
        {seesOthers ? (
          <select
            aria-label="Which tasks"
            className="ce-input w-auto"
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
          >
            <option value="mine">My tasks</option>
            <option value="all">My tasks and my team's</option>
          </select>
        ) : null}
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
          />
          Only ones not done yet
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Download">
        {(["xlsx", "csv", "pdf"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className="btn3d btn3d-ghost"
            onClick={() => download(kind)}
          >
            {kind === "xlsx" ? "Excel" : kind.toUpperCase()}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-soft">
        The PDF prints names in plain Latin letters; anything else shows as “?”. Use Excel or CSV
        for Hindi text.
      </p>
    </section>
  );
}
