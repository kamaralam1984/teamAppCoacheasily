import { StrategicMeetingsManager } from "@/components/meetings/StrategicMeetingsManager";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useDeleteMeeting, useSaveMeeting, useStrategicMeetings } from "@/hooks/useStrategicMeetings";

/** HR and admin keep strategic meetings here (Admin settings). */
export function StrategicMeetingsCard() {
  const { data: me } = useMyProfile();
  const profile = me?.profile ?? null;
  const { data, isLoading } = useStrategicMeetings(Boolean(profile));
  const save = useSaveMeeting();
  const del = useDeleteMeeting();

  return (
    <StrategicMeetingsManager
      meetings={data ?? []}
      loading={isLoading}
      onSave={async (values, id) => {
        if (!profile) throw new Error("Your profile isn't loaded yet.");
        await save.mutateAsync({ ...(id ? { id } : {}), orgId: profile.org_id, createdBy: profile.id, values });
      }}
      onDelete={(id) => del.mutateAsync(id)}
    />
  );
}
