import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/** Today's "what I'm on" line — correctable all day. The punch time never is. */
export function TodayFocus({ profileId, today }: { profileId: string; today: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["today-focus", profileId, today],
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("attendance")
        .select("id, focus")
        .eq("profile_id", profileId)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return row;
    },
  });

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    setText(data?.focus ?? "");
  }, [data?.focus]);

  const save = useMutation({
    mutationFn: async () => {
      if (!data?.id) throw new Error("Mark attendance first.");
      const { error } = await supabase
        .from("attendance")
        .update({ focus: text.trim().slice(0, 120) || null })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ["today-focus"] });
      void qc.invalidateQueries({ queryKey: ["presence-today"] });
    },
  });

  if (!data) return null;

  return (
    <div className="mt-4">
      {editing ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="ce-input flex-1 bg-white"
            maxLength={120}
            aria-label="What I'm on today"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What are you on today?"
          />
          <button
            type="button"
            className="min-h-11 rounded-full bg-goldL px-4 text-[13px] font-bold text-night"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="min-h-11 px-2 text-[13px] font-bold text-mist underline"
            onClick={() => {
              setText(data.focus ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <p className="text-[13px] leading-relaxed text-mist">
          {data.focus ? `Today: ${data.focus}` : "You haven't said what you're on today."}{" "}
          <button
            type="button"
            className="font-bold text-goldL underline underline-offset-4"
            onClick={() => setEditing(true)}
          >
            {data.focus ? "Edit" : "Add it"}
          </button>
        </p>
      )}
      {save.isError ? (
        <p className="mt-2 text-[13px] font-semibold text-goldL">
          That didn't save. Please try again.
        </p>
      ) : null}
    </div>
  );
}
