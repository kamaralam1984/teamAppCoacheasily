import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DumpCandidate {
  title: string;
  due_date: string | null;
  slot: "Morning" | "Afternoon" | "Evening" | "Anytime";
  priority: "Low" | "Normal" | "High" | "Urgent";
  /** profile id the AI suggests — only ever someone the caller manages */
  owner_id: string | null;
  owner_reason: string | null;
}

const SLOTS = ["Morning", "Afternoon", "Evening", "Anytime"];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];

/**
 * Turns a messy brain dump or meeting transcript into candidate tasks.
 * Nothing is ever written here — the human confirms an editable list.
 */
export const readBrainDump = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { text: string; today: string }) => {
    const text = (input?.text ?? "").trim();
    if (!text) throw new Error("Write a few lines first.");
    return { text: text.slice(0, 8000), today: input.today };
  })
  .handler(async ({ data, context }): Promise<{ tasks: DumpCandidate[] }> => {
    const { supabase, userId } = context;
    const { askAi, parseJson, AiUnavailable } = await import("@/lib/ai.server");

    const { data: me } = await supabase
      .from("profiles")
      .select("id, department, role")
      .eq("auth_user_id", userId)
      .maybeSingle();

    // People this person may hand work to — used only to suggest an owner.
    const { data: team } = me
      ? await supabase
          .from("profiles")
          .select("id, full_name, title, department")
          .eq("manager_id", me.id)
          .eq("status", "active")
      : { data: [] as { id: string; full_name: string; title: string | null; department: string | null }[] };

    const roster = team ?? [];
    const rosterLine = roster.length
      ? roster
          .map((p) => `${p.full_name} — ${p.title ?? "warrior"}, ${p.department ?? "no department"}`)
          .join("\n")
      : "";

    const system =
      `You turn a person's messy notes or meeting transcript into a clean task list for an Indian online coaching company (CoachEasily, Mumbai, Asia/Kolkata). ` +
      `Today is ${data.today}. The writer works in ${me?.department ?? "the company"}.\n` +
      `Return JSON only: {"tasks":[{"title":"","due_date":"YYYY-MM-DD or null","slot":"Morning|Afternoon|Evening|Anytime","priority":"Low|Normal|High|Urgent","owner":"exact name from the team list or null","owner_reason":"short why or null"}]}\n` +
      `Rules: titles are short, imperative, in the writer's own words. Resolve "today", "tomorrow", "by Friday", "before the CBA batch", "end of week", "next month" into real dates; if a date is genuinely unclear use null. ` +
      `Priority comes from urgency language: "urgent", "escalated", "angry member", "today" → Urgent or High; routine → Normal; "someday", "when free" → Low. ` +
      `Slot comes from time-of-day language (morning calls → Morning, evening review → Evening), otherwise Anytime. ` +
      `Never invent tasks that are not in the notes. Merge duplicates.` +
      (rosterLine
        ? `\nSuggest an owner ONLY from this team, matching the work to their department and role. If nothing fits, use null.\n${rosterLine}`
        : `\nAlways use null for owner.`);

    let raw = "";
    try {
      raw = await askAi([
        { role: "system", content: system },
        { role: "user", content: data.text },
      ]);
    } catch (e) {
      if (e instanceof AiUnavailable) throw new Error(e.message);
      throw e;
    }

    const parsed = parseJson<{ tasks?: unknown }>(raw, {});
    const rows = Array.isArray(parsed.tasks) ? parsed.tasks : [];

    const byName = new Map(roster.map((p) => [p.full_name.toLowerCase(), p.id]));

    const tasks: DumpCandidate[] = rows
      .map((r) => r as Record<string, unknown>)
      .filter((r) => typeof r["title"] === "string" && (r["title"] as string).trim().length > 0)
      .slice(0, 30)
      .map((r) => {
        const ownerName = typeof r["owner"] === "string" ? r["owner"].trim().toLowerCase() : "";
        const ownerId = byName.get(ownerName) ?? null;
        return {
          title: (r["title"] as string).trim().slice(0, 160),
          due_date:
            typeof r["due_date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r["due_date"] as string)
              ? (r["due_date"] as string)
              : null,
          slot: SLOTS.includes(r["slot"] as string)
            ? (r["slot"] as DumpCandidate["slot"])
            : "Anytime",
          priority: PRIORITIES.includes(r["priority"] as string)
            ? (r["priority"] as DumpCandidate["priority"])
            : "Normal",
          owner_id: ownerId,
          owner_reason:
            ownerId && typeof r["owner_reason"] === "string"
              ? (r["owner_reason"] as string).trim().slice(0, 120)
              : null,
        };
      });

    return { tasks };
  });
