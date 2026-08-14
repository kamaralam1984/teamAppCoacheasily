import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { downlineIds, type Profile } from "@/lib/warriors";

export function ExitDialog({
  warrior,
  profiles,
  orgId,
  onClose,
}: {
  warrior: Profile;
  profiles: Profile[];
  orgId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [receiverId, setReceiverId] = useState(warrior.manager_id ?? "");
  const [busy, setBusy] = useState(false);

  const reports = profiles.filter((p) => p.manager_id === warrior.id && p.status === "active");

  const receivers = useMemo(() => {
    const blocked = downlineIds(profiles, warrior.id);
    return profiles.filter((p) => p.status === "active" && p.id !== warrior.id && !blocked.has(p.id));
  }, [profiles, warrior.id]);

  const lastLeader =
    (warrior.role === "hr" || warrior.role === "admin") &&
    profiles.filter(
      (p) => p.status === "active" && (p.role === "hr" || p.role === "admin") && p.id !== warrior.id,
    ).length === 0;

  async function handleExit() {
    if (lastLeader) return;
    if (!receiverId) {
      toast.error("Choose who receives their work");
      return;
    }
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase
        .from("profiles")
        .update({ status: "exited", exited_on: today })
        .eq("id", warrior.id);
      if (error) throw error;

      if (reports.length) {
        const { error: reparentError } = await supabase
          .from("profiles")
          .update({ manager_id: receiverId })
          .eq("manager_id", warrior.id)
          .eq("status", "active");
        if (reparentError) throw reparentError;
      }

      await supabase.from("notifications").insert({
        org_id: orgId,
        profile_id: receiverId,
        title: `You're taking over ${warrior.full_name}'s work`,
        body: `${warrior.full_name} has exited CoachEasily.${
          reports.length ? ` Their ${reports.length} direct report(s) now report to you.` : ""
        }`,
        link: "/warriors",
      });

      const { data: recon } = await supabase.rpc("reconcile_roster");
      const fixedCount =
        recon && typeof recon === "object" && "count" in recon ? Number(recon["count"]) : 0;

      await queryClient.invalidateQueries({ queryKey: ["warriors"] });
      toast.success(
        `${warrior.full_name.split(" ")[0]} exited` +
          (fixedCount > 0 ? ` · auto-synced ${fixedCount} report${fixedCount > 1 ? "s" : ""}` : ""),
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete the exit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-2xl border-line bg-ivory sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal text-ink">
            Exit {warrior.full_name}
          </DialogTitle>
        </DialogHeader>

        {lastLeader ? (
          <p className="rounded-xl bg-red/8 p-4 text-[13px] leading-relaxed text-red">
            This is the last HR or Admin account. Give someone else that access
            level first, otherwise nobody can manage the roster.
          </p>
        ) : (
          <>
            <p className="text-[13px] leading-relaxed text-soft">
              Their record is kept forever — nothing is deleted. They'll be marked as exited today
              {reports.length
                ? `, and their ${reports.length} direct report(s) move to the person you choose.`
                : "."}
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[11px] font-bold tracking-[0.14em] text-soft uppercase">
                Who receives their work?
              </span>
              <select
                className="ce-input"
                value={receiverId}
                onChange={(e) => setReceiverId(e.target.value)}
              >
                <option value="">Choose a warrior…</option>
                {receivers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {!lastLeader ? (
            <button className="btn3d" onClick={handleExit} disabled={busy}>
              {busy ? "Working…" : "Confirm exit"}
            </button>
          ) : null}
          <button className="btn3d btn3d-ghost" onClick={onClose}>
            {lastLeader ? "Close" : "Cancel"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
