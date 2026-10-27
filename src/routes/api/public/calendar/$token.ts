import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { buildIcs, type IcsEntry } from "@/lib/ics";

interface FeedProgram {
  id: string;
  name: string;
  type: string;
  language: string | null;
  from_date: string;
  to_date: string;
  from_time: string | null;
  to_time: string | null;
  location: string | null;
  description: string | null;
  session_no: number | null;
  sequence: number;
  status: string;
  host: string | null;
  cover: string | null;
}

interface FeedEvent {
  id: string;
  name: string;
  type: string;
  date: string;
  end_date: string | null;
  from_time: string | null;
  to_time: string | null;
  location: string | null;
  description: string | null;
  sequence: number;
  status: string;
  host: string | null;
}

interface Feed {
  name: string;
  programs: FeedProgram[];
  events: FeedEvent[];
  holidays: { id: string; name: string; date: string }[];
  leave: {
    id: string;
    type: string;
    from_date: string;
    to_date: string;
    half_day: boolean;
  }[];
}

const LEAVE_LABEL: Record<string, string> = {
  casual: "Casual leave",
  sick: "Sick leave",
  earned: "Earned leave",
  comp_off: "Comp-off",
  flexi: "Flexi holiday",
  lwp: "Leave without pay",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token ?? "").replace(/\.ics$/i, "");
        if (!UUID.test(token)) {
          return new Response("Not found", { status: 404 });
        }

        const supabase = createClient<Database>(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_PUBLISHABLE_KEY"]!,
          { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
        );

        const { data, error } = await supabase.rpc("calendar_feed", { p_token: token });
        if (error) return new Response("Calendar unavailable", { status: 500 });
        if (!data) return new Response("Not found", { status: 404 });

        const feed = data as unknown as Feed;
        const entries: IcsEntry[] = [];

        for (const p of feed.programs ?? []) {
          const bits = [
            p.host ? `Hosted by ${p.host}` : "Host not set",
            p.cover ? `Cover: ${p.cover}` : null,
            p.language,
            p.description,
          ].filter(Boolean);
          entries.push({
            uid: `program-${p.id}`,
            title: `${p.name}${p.session_no ? ` · Session ${p.session_no}` : ""}`,
            start: p.from_date,
            end: p.to_date,
            fromTime: p.from_time,
            toTime: p.to_time,
            location: p.location,
            description: bits.join(" · "),
            sequence: p.sequence ?? 0,
            cancelled: p.status === "cancelled",
          });
        }

        for (const e of feed.events ?? []) {
          entries.push({
            uid: `event-${e.id}`,
            title: e.name,
            start: e.date,
            end: e.end_date ?? e.date,
            fromTime: e.from_time,
            toTime: e.to_time,
            location: e.location,
            description: [e.host ? `Hosted by ${e.host}` : null, e.description]
              .filter(Boolean)
              .join(" · "),
            sequence: e.sequence ?? 0,
            cancelled: e.status === "cancelled",
          });
        }

        for (const h of feed.holidays ?? []) {
          entries.push({
            uid: `holiday-${h.id}`,
            title: `Holiday · ${h.name}`,
            start: h.date,
            end: h.date,
          });
        }

        for (const l of feed.leave ?? []) {
          entries.push({
            uid: `leave-${l.id}`,
            title: `${LEAVE_LABEL[l.type] ?? l.type}${l.half_day ? " · half day" : ""}`,
            start: l.from_date,
            end: l.to_date,
            description: "Approved leave in the CoachEasily team app.",
          });
        }

        const body = buildIcs("CoachEasily", entries);
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "text/calendar; charset=utf-8",
            "content-disposition": 'inline; filename="coacheasily.ics"',
            "cache-control": "public, max-age=900",
          },
        });
      },
    },
  },
});
