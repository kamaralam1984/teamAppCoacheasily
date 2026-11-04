import { useState } from "react";
import { toast } from "sonner";

import {
  useAddOpenPosition,
  useRemoveOpenPosition,
  type OpenPosition,
} from "@/hooks/useOpenPositions";
import type { Profile } from "@/lib/warriors";

/**
 * HR: posts nobody holds yet. Each shows on the org chart as a dashed "To be hired" box under the
 * person it reports to. People are drawn under one from their own edit form ("Show in the chart
 * under"). When the post is filled, point those people at the new hire and remove it here.
 */
export function OpenPositionsPanel({
  positions,
  profiles,
  orgId,
}: {
  positions: OpenPosition[];
  profiles: Profile[];
  orgId: string;
}) {
  const add = useAddOpenPosition();
  const remove = useRemoveOpenPosition();
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [reportsTo, setReportsTo] = useState("");

  const active = profiles.filter((p) => p.status === "active");
  const nameOf = (id: string | null) =>
    id ? (profiles.find((p) => p.id === id)?.full_name ?? "Someone who left") : "Nobody";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Give the post a name");
      return;
    }
    try {
      await add.mutateAsync({
        org_id: orgId,
        title: title.trim(),
        department: department.trim() || null,
        reports_to: reportsTo || null,
      });
      setTitle("");
      setDepartment("");
      setReportsTo("");
      toast.success("Open position added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the position");
    }
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="font-display text-xl text-ink">Open positions</h3>
      <p className="mt-1 text-[13px] text-soft">
        Posts nobody holds yet. They show on the chart as “To be hired”.
      </p>

      {positions.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {positions.map((pos) => {
            const under = profiles.filter((p) => p.chart_position_id === pos.id);
            return (
              <li
                key={pos.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-gold/50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{pos.title}</p>
                  <p className="text-[12px] text-soft">
                    Reports to {nameOf(pos.reports_to)}
                    {under.length > 0 ? ` · shown above ${under.map((p) => p.full_name).join(", ")}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (!window.confirm(`Remove “${pos.title}”? Do this once the post is filled.`)) return;
                    remove.mutate(pos.id, {
                      onSuccess: () => toast.success("Open position removed"),
                      onError: (err) => toast.error(err.message),
                    });
                  }}
                  className="min-h-9 rounded-lg border border-line px-3 text-[12px] font-bold text-ink"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input
          className="ce-input"
          placeholder="Post, e.g. Manager – Sales"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
        <input
          className="ce-input"
          placeholder="Department (optional)"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          maxLength={80}
        />
        <select className="ce-input" value={reportsTo} onChange={(e) => setReportsTo(e.target.value)}>
          <option value="">Reports to…</option>
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={add.isPending} className="btn3d min-h-11 px-4">
          Add
        </button>
      </form>
    </div>
  );
}
