import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { errMsg } from "@/hooks/useDeveloper";
import { devGetLeaveRelease, devSetLeaveRelease } from "@/lib/leaveExtras.functions";
import { Card, Failed, Loading } from "./shared";

/** Approve new features for everyone. Until then only HR and developers see them. */
export function DevFeatures() {
  const qc = useQueryClient();
  const get = useServerFn(devGetLeaveRelease);
  const set = useServerFn(devSetLeaveRelease);
  const [confirming, setConfirming] = useState(false);
  const q = useQuery({ queryKey: ["dev-leave-release"], queryFn: () => get() });
  const m = useMutation({
    mutationFn: (released: boolean) => set({ data: { released } }),
    onSuccess: (_r, released) => {
      toast.success(
        released ? "Approved. Everyone has it now." : "Back to HR and developers only.",
      );
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["dev-leave-release"] });
      void qc.invalidateQueries({ queryKey: ["leave-extras"] });
      void qc.invalidateQueries({ queryKey: ["dev-audit"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (q.isLoading) return <Loading what="features" />;
  if (q.error || !q.data)
    return <Failed error={q.error ?? new Error("Not found")} retry={() => void q.refetch()} />;
  const on = q.data.released;

  return (
    <Card>
      <h2 className="font-display text-2xl text-ink">Leave improvements</h2>
      <p className="mt-1 text-sm text-soft">
        Edit and cancel a pending request, first or second half of the day, and Send reminder.
      </p>
      <p className="mt-3 text-sm font-bold text-ink">
        {on
          ? `Approved for everyone${q.data.released_by ? ` by ${q.data.released_by}` : ""}${
              q.data.released_at
                ? ` on ${new Date(q.data.released_at).toLocaleDateString("en-GB")}`
                : ""
            }`
          : "Only HR and developers see this"}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              className="btn3d"
              disabled={m.isPending}
              onClick={() => m.mutate(!on)}
            >
              {on ? "Yes, take it back" : "Yes, approve for everyone"}
            </button>
            <button
              type="button"
              className="btn3d btn3d-ghost"
              onClick={() => setConfirming(false)}
            >
              No
            </button>
          </>
        ) : (
          <button
            type="button"
            className={on ? "btn3d btn3d-ghost" : "btn3d"}
            onClick={() => setConfirming(true)}
          >
            {on ? "Take back" : "Approve for everyone"}
          </button>
        )}
      </div>
    </Card>
  );
}
