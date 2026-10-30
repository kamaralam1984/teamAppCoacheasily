/** Shared Lovable AI gateway call. Server-only. */

export type AiPart =
  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface AiMessage {
  role: "system" | "user";
  content: string | AiPart[];
}

export class AiUnavailable extends Error {}

/**
 * Calls google/gemini-2.5-flash and returns the raw assistant text.
 * Throws AiUnavailable with a human sentence when the gateway can't help —
 * every caller is expected to degrade gracefully.
 */
export async function askAi(messages: AiMessage[], json = true): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new AiUnavailable("The AI helper isn't switched on yet.");

  let res: Response;
  try {
    res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        ...(json ? { response_format: { type: "json_object" as const } } : {}),
      }),
    });
  } catch {
    throw new AiUnavailable("The AI helper could not be reached. Carry on without it.");
  }

  if (res.status === 429) throw new AiUnavailable("The AI helper is busy. Try again in a moment.");
  if (res.status === 402) throw new AiUnavailable("The AI workspace is out of credits.");
  if (!res.ok) throw new AiUnavailable("The AI helper could not be reached. Carry on without it.");

  const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return payload.choices?.[0]?.message?.content ?? "";
}

export function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
