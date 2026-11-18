import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeReadForm, type ReadForm } from "@/lib/selfEvaluation";

const FILE_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
// ~4MB of file once base64 is unwrapped.
const MAX_BASE64 = 5_600_000;
const MAX_TEXT = 200_000;

const SCHEMA = `{
  "about": {"role_team": "", "manager": "", "review_period": ""},
  "goals": [{"goal": "", "target": "", "result": "", "evidence": "", "rating": "O|EE|FME|PME|DNME|"}],
  "values": {
    "ownership": {"example": "", "rating": ""}, "collaboration": {...}, "problem_solving": {...},
    "growth_mindset": {...}, "communication": {...}, "optimism": {...}, "courage": {...},
    "integrity": {...}, "responsibility": {...}, "leadership": {...}, "efficiency": {...},
    "strategic_thinking": {...}
  },
  "reflection": {"proud": "", "missed": "", "challenge": "", "feedback": "", "development": "", "support": ""},
  "potential": {
    "learn": {"rating": "Low|Moderate|High", "why": ""},
    "bigger_role": {...}, "help_others": {...}, "stretch": {...}
  }
}`;

const ASK =
  `This is a filled "Annual Self-Evaluation Form" (CoachEasily). Copy the person's own answers into JSON, ` +
  `exactly as written (keep their words, fix nothing, translate nothing). Return JSON only, in this shape:\n${SCHEMA}\n\n` +
  `Rules:\n` +
  `- IGNORE every table marked "EXAMPLE" / "For guidance only" (the worked examples about customer experience ` +
  `rating and refund cases, and the example Ownership row). Use only the person's own rows.\n` +
  `- goals: Part A, one item per numbered goal, in order. "goal" is the "Goal and the company priority it supports" ` +
  `cell, "target" the "Target / measure" cell, "result" the "Result achieved" cell, "evidence" the ` +
  `"Evidence (numbers, links, feedback)" cell. A row may run over two pages: join its pieces.\n` +
  `- values: Part B, keyed by value name (Problem-solving → problem_solving, Growth mindset → growth_mindset, ` +
  `Strategic thinking → strategic_thinking). "example" is the "Your example from this year" cell, all paragraphs.\n` +
  `- reflection: Part C answers, by question: proudest results → proud; missed a goal or value → missed; biggest ` +
  `challenge → challenge; feedback from quarterly check-ins → feedback; self-development goal → development; ` +
  `support or resources → support.\n` +
  `- potential: Part D: learn new skills → learn; bigger role → bigger_role; help others → help_others; ` +
  `stretch work → stretch.\n` +
  `- Ratings: O, EE, FME, PME or DNME (e.g. "Outstanding (o)" → "O", "Exceeds Expectations ( EE)" → "EE"); ` +
  `potential ratings Low, Moderate or High as written.\n` +
  `- Words split by the PDF ("f rom", "ef f ort", "lef t") should be joined back ("from", "effort", "left").\n` +
  `- Anything blank or missing: "". Never invent an answer.`;

/**
 * Reads an uploaded self-evaluation form (PDF, photo, or the text of a Word file) and returns the
 * answers in the form's shape, so the boxes can be filled. Nothing is stored here: the person
 * sees what was found and chooses to apply it.
 */
export const readSelfEvaluationForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mime?: string; data?: string; text?: string }) => {
    const text = typeof input?.text === "string" ? input.text : "";
    if (text) {
      if (text.length > MAX_TEXT) throw new Error("That file is too long to read.");
      return { text, mime: "", data: "" };
    }
    const mime = String(input?.mime ?? "");
    if (!FILE_MIME.includes(mime)) throw new Error("That file type can't be read.");
    const data = String(input?.data ?? "");
    if (!data || data.length > MAX_BASE64)
      throw new Error("That file is too large to read (4MB at most).");
    return { text: "", mime, data };
  })
  .handler(async ({ data }): Promise<{ form: ReadForm | null; error?: string }> => {
    const { askAi, parseJson, AiUnavailable } = await import("@/lib/ai.server");
    let raw = "";
    try {
      raw = await askAi([
        {
          role: "user",
          content: data.text
            ? [{ type: "text", text: `${ASK}\n\nThe form:\n\n${data.text}` }]
            : [
                { type: "text", text: ASK },
                { type: "image_url", image_url: { url: `data:${data.mime};base64,${data.data}` } },
              ],
        },
      ]);
    } catch (e) {
      if (e instanceof AiUnavailable) return { form: null, error: e.message };
      throw e;
    }
    const parsed = parseJson<unknown>(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""), null);
    if (!parsed) {
      // Length only — never the answer, which holds the person's appraisal.
      console.error("[self-eval read] unreadable AI answer, length", raw.length);
      return { form: null, error: "The form could not be read. Fill it in by hand." };
    }
    return { form: normalizeReadForm(parsed) };
  });
