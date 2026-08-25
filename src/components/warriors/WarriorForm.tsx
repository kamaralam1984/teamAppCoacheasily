import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDepartmentNames } from "@/hooks/useDepartments";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { inviteWarrior } from "@/lib/invite.functions";
import {
  ACCESS_LEVELS,
  WEEKLY_OFFS,
  accessBlurb,
  downlineIds,
  type Profile,
  type Role,
} from "@/lib/warriors";

const NEW_BADGE_OPTIONS = [
  { value: "auto", label: "Auto — first 90 days" },
  { value: "on", label: "Always show" },
  { value: "off", label: "Never show" },
];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[11px] font-bold tracking-[0.14em] text-soft uppercase">
      {children}
    </span>
  );
}

export function WarriorForm({
  editing,
  profiles,
  orgId,
  onClose,
}: {
  editing: Profile | null;
  profiles: Profile[];
  orgId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const invite = useServerFn(inviteWarrior);
  const [saving, setSaving] = useState(false);
  const departments = useDepartmentNames();

  const [form, setForm] = useState({
    full_name: editing?.full_name ?? "",
    title: editing?.title ?? "",
    department: editing?.department ?? "",
    manager_id: editing?.manager_id ?? "",
    role: (editing?.role ?? "member") as Role,
    weekly_off: editing?.weekly_off ?? "Sunday",
    sort_order: String(editing?.sort_order ?? 100),
    opening_earned_leave: String(editing?.opening_earned_leave ?? 0),
    can_manage_calendar: Boolean(editing?.can_manage_calendar),

    joined_on: editing?.joined_on ?? "",
    date_of_birth: editing?.date_of_birth ?? "",
    wedding_anniversary: editing?.wedding_anniversary ?? "",
    new_badge: editing?.new_badge ?? "auto",
    responsibilities: editing?.responsibilities ?? "",
    fun_fact: editing?.fun_fact ?? "",
    email: "",
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // A person can never manage themselves or anyone in their own downline.
  const managerOptions = useMemo(() => {
    const blocked = editing ? downlineIds(profiles, editing.id) : new Set<string>();
    return profiles.filter(
      (p) => p.status === "active" && p.id !== editing?.id && !blocked.has(p.id),
    );
  }, [profiles, editing]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.full_name.trim()) {
      toast.error("A name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        org_id: orgId,
        full_name: form.full_name.trim(),
        title: form.title.trim() || null,
        department: form.department,
        manager_id: form.manager_id || null,
        role: form.role,
        weekly_off: form.weekly_off,
        sort_order: Number.isFinite(Number(form.sort_order)) && form.sort_order.trim() !== ""
          ? Math.trunc(Number(form.sort_order))
          : 100,

        joined_on: form.joined_on || null,
        date_of_birth: form.date_of_birth || null,
        wedding_anniversary: form.wedding_anniversary || null,
        new_badge: form.new_badge,
        opening_earned_leave:
          Number.isFinite(Number(form.opening_earned_leave)) &&
          form.opening_earned_leave.trim() !== ""
            ? Math.max(0, Math.trunc(Number(form.opening_earned_leave)))
            : 0,
        can_manage_calendar: form.can_manage_calendar,
        responsibilities: form.responsibilities.trim() || null,
        fun_fact: form.fun_fact.trim() || null,
        email: form.email.trim().toLowerCase() || null,
        phone: form.phone.trim() || null,
      };


      let profileId = editing?.id ?? null;

      if (editing) {
        const { error } = await supabase.from("profiles").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("profiles")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        profileId = data.id;
      }

      let inviteNote = "";
      if (!editing && profileId && form.email.trim()) {
        try {
          await invite({
            data: {
              profileId,
              email: form.email.trim(),
              redirectTo: `${window.location.origin}/change-password`,
            },
          });
          inviteNote = " · invite sent";
        } catch (err) {
          inviteNote = " · invite could not be sent";
          console.error(err);
        }
      }

      const { data: recon } = await supabase.rpc("reconcile_roster");
      const fixedCount =
        recon && typeof recon === "object" && "count" in recon ? Number(recon["count"]) : 0;

      await queryClient.invalidateQueries({ queryKey: ["warriors"] });

      toast.success(
        `${form.full_name.split(" ")[0]} ${editing ? "updated" : "added"}${inviteNote}` +
          (fixedCount > 0 ? ` · auto-synced ${fixedCount} report${fixedCount > 1 ? "s" : ""}` : ""),
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this warrior");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-2xl border-line bg-ivory sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal text-ink">
            {editing ? "Edit warrior" : "Add a warrior"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 grid gap-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <Label>Full name</Label>
            <input
              className="ce-input"
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              required
            />
          </label>

          <label>
            <Label>Job title</Label>
            <input
              className="ce-input"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </label>

          <label>
            <Label>Department</Label>
            <select
              className="ce-input"
              value={form.department}
              onChange={(e) => set("department", e.target.value)}
            >
              <option value="">Not set</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <label>
            <Label>Reports to</Label>
            <select
              className="ce-input"
              value={form.manager_id}
              onChange={(e) => set("manager_id", e.target.value)}
            >
              <option value="">Nobody (top of the chart)</option>
              {managerOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <Label>Weekly off</Label>
            <select
              className="ce-input"
              value={form.weekly_off}
              onChange={(e) => set("weekly_off", e.target.value)}
            >
              {WEEKLY_OFFS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <label>
            <Label>Display order</Label>
            <input
              type="number"
              inputMode="numeric"
              step={10}
              className="ce-input"
              value={form.sort_order}
              onChange={(e) => set("sort_order", e.target.value)}
            />
            <span className="mt-2 block text-[13px] leading-relaxed text-soft">
              Lower numbers appear higher among people with the same manager. Leadership sits
              above everyone regardless. Leave at 100 if you don't mind.
            </span>
          </label>



          <label>
            <Label>Opening earned leave</Label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="ce-input"
              value={form.opening_earned_leave}
              onChange={(e) => set("opening_earned_leave", e.target.value)}
            />
            <span className="mt-2 block text-[13px] leading-relaxed text-soft">
              The earned leave they already had before this app. Everything after that is earned
              here, one day for every twenty worked.
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-line bg-white p-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={form.can_manage_calendar}
              onChange={(e) => set("can_manage_calendar", e.target.checked)}
            />
            <span>
              <span className="block text-sm font-bold text-ink">Can manage the calendar</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-soft">
                Lets this person add and edit programmes and events for everyone.
              </span>
            </span>
          </label>

          <label className="sm:col-span-2">
            <Label>Access level</Label>
            <select
              className="ce-input"
              value={form.role}
              onChange={(e) => set("role", e.target.value as Role)}
            >
              {ACCESS_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <span className="mt-2 block text-[13px] leading-relaxed text-soft">
              {accessBlurb(form.role)}
            </span>
          </label>

          <label>
            <Label>Joining date</Label>
            <input
              type="date"
              className="ce-input"
              value={form.joined_on}
              onChange={(e) => set("joined_on", e.target.value)}
            />
          </label>

          <label>
            <Label>Date of birth</Label>
            <input
              type="date"
              className="ce-input"
              value={form.date_of_birth}
              onChange={(e) => set("date_of_birth", e.target.value)}
            />
            {!form.date_of_birth && editing?.birthday ? (
              <span className="mt-2 block text-[13px] leading-relaxed text-soft">
                On record: {editing.birthday} (day and month only). Add the full date here.
              </span>
            ) : null}
          </label>


          <label>
            <Label>Wedding anniversary (MM-DD)</Label>
            <input
              className="ce-input"
              placeholder="11-27"
              pattern="\d{2}-\d{2}"
              value={form.wedding_anniversary}
              onChange={(e) => set("wedding_anniversary", e.target.value)}
            />
          </label>

          <label>
            <Label>"New" badge</Label>
            <select
              className="ce-input"
              value={form.new_badge}
              onChange={(e) => set("new_badge", e.target.value)}
            >
              {NEW_BADGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="sm:col-span-2">
            <Label>What they own</Label>
            <textarea
              className="ce-input min-h-[84px] py-2.5"
              value={form.responsibilities}
              onChange={(e) => set("responsibilities", e.target.value)}
            />
          </label>

          <label className="sm:col-span-2">
            <Label>One human detail for the welcome post</Label>
            <textarea
              className="ce-input min-h-[68px] py-2.5"
              value={form.fun_fact}
              onChange={(e) => set("fun_fact", e.target.value)}
            />
          </label>

          <label className="sm:col-span-2">
            <Label>Work email</Label>
            <input
              type="email"
              className="ce-input"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="name@coacheasily.com"
            />
            <span className="mt-2 block text-[13px] leading-relaxed text-soft">
              This is the allow list. Only somebody whose work email is here can set up their own
              login at /join.
            </span>
          </label>

          <label className="sm:col-span-2">
            <Label>Phone</Label>
            <input
              type="tel"
              inputMode="tel"
              className="ce-input"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+91 98200 00000"
            />
          </label>


          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button type="submit" className="btn3d" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add warrior"}
            </button>
            <button type="button" className="btn3d btn3d-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
