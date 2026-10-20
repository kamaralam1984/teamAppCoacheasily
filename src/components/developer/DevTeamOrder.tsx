import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { WarriorAvatar } from "@/components/warriors/Avatar";
import { errMsg } from "@/hooks/useDeveloper";
import { devSaveTeamOrder, devTeamList } from "@/lib/developer.functions";
import { teamOrder } from "@/lib/teamOrder";
import type { Profile } from "@/lib/warriors";
import { Card, Failed, Loading } from "./shared";

type TeamPerson = Awaited<ReturnType<typeof devTeamList>>[number];

/** Arrange the team list by hand. What is saved here is the order everybody sees on the Culture page. */
export function DevTeamOrder() {
  const qc = useQueryClient();
  const list = useServerFn(devTeamList);
  const save = useServerFn(devSaveTeamOrder);
  const q = useQuery({ queryKey: ["dev-team-list"], queryFn: () => list() });

  const data = q.data;
  const sorted = useMemo(
    () => teamOrder((data ?? []) as unknown as Profile[]) as unknown as TeamPerson[],
    [data],
  );
  const [draft, setDraft] = useState<string[]>([]);
  useEffect(() => setDraft(sorted.map((p) => p.id)), [sorted]);

  const byId = useMemo(() => new Map(sorted.map((p) => [p.id, p])), [sorted]);
  const dirty = draft.length > 0 && draft.some((id, i) => id !== sorted[i]?.id);
  const placed = sorted.filter((p) => p.team_order !== null).length;

  const done = (message: string) => {
    toast.success(message);
    void qc.invalidateQueries({ queryKey: ["dev-team-list"] });
    void qc.invalidateQueries({ queryKey: ["warriors"] });
    void qc.invalidateQueries({ queryKey: ["dev-audit"] });
  };
  const saveM = useMutation({
    mutationFn: () => save({ data: { orderedIds: draft } }),
    onSuccess: () => done("The team order is saved."),
    onError: (e) => toast.error(errMsg(e)),
  });
  const resetM = useMutation({
    mutationFn: () => save({ data: { reset: true } }),
    onSuccess: () => done("Back to the automatic order."),
    onError: (e) => toast.error(errMsg(e)),
  });

  function move(index: number, by: -1 | 1) {
    setDraft((d) => {
      const target = index + by;
      if (target < 0 || target >= d.length) return d;
      const next = [...d];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  if (q.isLoading) return <Loading what="the team" />;
  if (q.error || !q.data) return <Failed error={q.error} retry={() => void q.refetch()} />;

  return (
    <div className="space-y-3">
      <Card>
        <p className="text-sm text-soft">
          This is the order of “The team” on the Culture page. Move people up or down and save. Until it
          is saved, the page follows its rule: founder, People &amp; Culture, then by post and role.{" "}
          {placed > 0
            ? `${placed} of ${sorted.length} people have a place set by hand.`
            : "Nobody has a place set by hand yet."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn3d" disabled={!dirty || saveM.isPending} onClick={() => saveM.mutate()}>
            {saveM.isPending ? "Saving…" : "Save the order"}
          </button>
          <button
            className="btn3d btn3d-ghost"
            disabled={!dirty || saveM.isPending}
            onClick={() => setDraft(sorted.map((p) => p.id))}
          >
            Undo my moves
          </button>
          <button
            className="btn3d btn3d-ghost"
            disabled={placed === 0 || resetM.isPending}
            onClick={() => {
              if (window.confirm("Go back to the automatic order for everybody?")) resetM.mutate();
            }}
          >
            {resetM.isPending ? "Working…" : "Back to automatic"}
          </button>
        </div>
      </Card>

      <ol className="space-y-2">
        {draft.map((id, i) => {
          const p = byId.get(id);
          if (!p) return null;
          return (
            <li key={id} className="ce-card flex items-center gap-3 p-3">
              <span className="w-7 shrink-0 text-center text-sm font-bold text-soft">{i + 1}</span>
              <WarriorAvatar name={p.full_name} size={36} path={p.avatar_url} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold text-ink">{p.full_name}</span>
                <span className="block truncate text-[12px] text-soft">
                  {[p.title, p.department, p.role].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  aria-label={`Move ${p.full_name} up`}
                  className="min-h-11 min-w-11 rounded-lg border border-line bg-ivory text-lg font-bold text-ink disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${p.full_name} down`}
                  className="min-h-11 min-w-11 rounded-lg border border-line bg-ivory text-lg font-bold text-ink disabled:opacity-30"
                  disabled={i === draft.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
