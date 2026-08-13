import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DumpCandidate {
  title: string;
  due_date: string | null;
  slot: "Morning" | "Afternoon" | "Evening" | "Anytime";
  priority: "Low" | "Normal" | "High" | "Urgent";
}

const SLOTS = ["Morning", "Afternoon", "Evening", "Anytime"];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];

/** Turns a messy brain dump into candidate tasks. Nothing is written here. */
export const readBrainDump = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { text: string; today: string }) => {
    const text = (input?.text ?? "").trim();
    if (!text) throw new Error("Write a few lines first.");
    return { text: text.slice(0, 4000), today: input.today };
  })
  .handler(async ({ data }): Promise<{ tasks: DumpCandidate[] }> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("The AI reader isn't configured yet.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              `You turn a person's messy notes into a clean task list. Today is ${data.today} (Asia/Kolkata). ` +
              `Return JSON only: {"tasks":[{"title":"","due_date":"YYYY-MM-DD or null","slot":"Morning|Afternoon|Evening|Anytime","priority":"Low|Normal|High|Urgent"}]}. ` +
              `Titles are short, imperative and in the writer's own words. Resolve "today", "tomorrow", "Friday" to real dates. Never invent tasks that are not in the notes.`,
          },
          { role: "user", content: data.text },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) throw new Error("The AI reader is busy. Try again in a moment.");
    if (res.status === 402) throw new Error("The AI workspace is out of credits.");
    if (!res.ok) throw new Error("The AI reader could not be reached.");

    const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let parsed: { tasks?: unknown } = {};
    try {
      parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}") as { tasks?: unknown };
    } catch {
      parsed = {};
    }

    const rows = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const tasks: DumpCandidate[] = rows
      .map((r) => r as Record<string, unknown>)
      .filter((r) => typeof r["title"] === "string" && (r["title"] as string).trim().length > 0)
      .slice(0, 25)
      .map((r) => ({
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
      }));

    return { tasks };
  });
