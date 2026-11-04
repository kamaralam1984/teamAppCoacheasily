import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { StrategicMeetingsManager } from "@/components/meetings/StrategicMeetingsManager";
import { useMyProfile } from "@/hooks/useMyProfile";
import { invalidateMeetings, type StrategicMeeting } from "@/hooks/useStrategicMeetings";
import type { Json } from "@/integrations/supabase/types";
import { devBrowse, devWriteRow } from "@/lib/developer.functions";
import { Failed } from "./shared";

/** Developers keep strategic meetings through the gated, audited Developer writes. */
export function DevStrategicMeetings() {
  const qc = useQueryClient();
  const browse = useServerFn(devBrowse);
  const write = useServerFn(devWriteRow);
  const { data: me } = useMyProfile();
  const orgId = me?.profile?.org_id ?? null;

  const q = useQuery({
    queryKey: ["dev-strategic-meetings"],
    queryFn: async () => {
      const res = await browse({ data: { table: "strategic_meetings", page: 0 } });
      return (res.rows as unknown as StrategicMeeting[]).sort((a, b) =>
        a.meeting_date.localeCompare(b.meeting_date),
      );
    },
  });

  const done = () => {
    void qc.invalidateQueries({ queryKey: ["dev-strategic-meetings"] });
    invalidateMeetings(qc);
  };

  if (q.error) return <Failed error={q.error} retry={() => void q.refetch()} />;

  return (
    <StrategicMeetingsManager
      meetings={q.data ?? []}
      loading={q.isLoading}
      onSave={async (values, id) => {
        const row = values as unknown as { [k: string]: Json };
        if (id) {
          await write({ data: { table: "strategic_meetings", op: "update", key: { id }, values: row } });
        } else {
          if (!orgId) throw new Error("Your profile isn't loaded yet.");
          await write({ data: { table: "strategic_meetings", op: "insert", values: { ...row, org_id: orgId } } });
        }
        done();
      }}
      onDelete={async (id) => {
        await write({ data: { table: "strategic_meetings", op: "delete", key: { id } } });
        done();
      }}
    />
  );
}
