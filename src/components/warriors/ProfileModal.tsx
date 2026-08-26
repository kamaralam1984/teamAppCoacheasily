import { useQuery } from "@tanstack/react-query";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WarriorAvatar } from "@/components/warriors/Avatar";
import { HrRecord } from "@/components/warriors/HrRecord";
import { supabase } from "@/integrations/supabase/client";
import {
  daysSince,
  isNewWarrior,
  isPrivileged,
  roleLabel,
  type Profile,
} from "@/lib/warriors";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold tracking-[0.14em] text-soft uppercase">{label}</p>
      <p className="mt-1 text-[15px] text-ink">{value}</p>
    </div>
  );
}

export function ProfileModal({
  profile,
  profiles,
  viewer,
  onClose,
  onEdit,
  onExit,
}: {
  profile: Profile | null;
  profiles: Profile[];
  viewer: Profile | null;
  onClose: () => void;
  onEdit: (p: Profile) => void;
  onExit: (p: Profile) => void;
}) {
  // manages() answers "is this person in my downline?" — the authoritative check.
  const { data: managesTarget } = useQuery({
    queryKey: ["manages", profile?.id],
    enabled: !!profile && !!viewer && profile.id !== viewer.id && !isPrivileged(viewer.role),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("manages", { target_id: profile!.id });
      if (error) throw error;
      return Boolean(data);
    },
  });

  if (!profile) return null;

  const manager = profiles.find((p) => p.id === profile.manager_id) ?? null;
  const canSeePrivate =
    !!viewer &&
    (viewer.id === profile.id || isPrivileged(viewer.role) || managesTarget === true);
  const canManage = isPrivileged(viewer?.role);
  const days = daysSince(profile.joined_on);
  const label = roleLabel(profile.role);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-2xl border-line bg-ivory sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">{profile.full_name}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <WarriorAvatar
            name={profile.full_name}
            size={62}
            birthday={profile.birthday}
            path={profile.avatar_url}
          />

          <div className="min-w-0">
            <h2 className="font-display text-2xl leading-tight text-ink">{profile.full_name}</h2>
            <p className="mt-0.5 text-sm text-soft">{profile.title ?? "—"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {label ? (
                <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-bold tracking-wider text-goldD uppercase">
                  {label}
                </span>
              ) : null}
              {isNewWarrior(profile) ? (
                <span className="rounded-full bg-saff/12 px-2 py-0.5 text-[10px] font-bold tracking-wider text-saffBtn uppercase">
                  New
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-5">
          <Field label="Department" value={profile.department ?? "—"} />
          <Field label="Reports to" value={manager?.full_name ?? "—"} />
          <Field label="Weekly off" value={profile.weekly_off ?? "—"} />
          <Field label="Joined" value={profile.joined_on ?? "—"} />
        </div>

        {profile.responsibilities ? (
          <div className="mt-5">
            <Field label="What they own" value={profile.responsibilities} />
          </div>
        ) : null}
        {profile.fun_fact ? (
          <div className="mt-5">
            <Field label="One human detail" value={profile.fun_fact} />
          </div>
        ) : null}

        <div className="mt-6 border-t border-line pt-5">
          {canSeePrivate ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-cream p-3 text-center">
                <p className="font-display text-2xl text-ink">{days !== null && days >= 0 ? days : "—"}</p>
                <p className="text-[11px] font-semibold text-soft">Days worked</p>
              </div>
              <div className="rounded-xl bg-cream p-3 text-center">
                {/* The opening figure only. Live balances come from leave_balances(). */}
                <p className="font-display text-2xl text-ink">{profile.opening_earned_leave}</p>
                <p className="text-[11px] font-semibold text-soft">Opening earned leave</p>
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-cream p-4 text-[13px] leading-relaxed text-soft">
              Goals, attendance and leave are private — visible to the person, their manager,
              HR and Admin.
            </p>
          )}
        </div>

        {canManage ? <HrRecord profile={profile} /> : null}

        {canManage ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="btn3d" onClick={() => onEdit(profile)}>
              Edit warrior
            </button>
            {profile.status === "active" ? (
              <button className="btn3d btn3d-ghost" onClick={() => onExit(profile)}>
                Exit warrior
              </button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
