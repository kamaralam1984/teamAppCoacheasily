import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
// ~4MB of file once base64 is unwrapped — images are shrunk on the device first.
const MAX_BASE64 = 5_600_000;

/**
 * Reads the PAN number, or the last four Aadhaar digits, off an uploaded card so the
 * person does not have to type it. Nothing is stored here; the number only pre-fills
 * a box the person checks and can edit. The full Aadhaar number never leaves this function.
 */
export const readIdNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: "pan" | "aadhaar"; mime: string; data: string }) => {
    if (input?.kind !== "pan" && input?.kind !== "aadhaar") throw new Error("Unknown document.");
    if (!MIME.includes(input.mime)) throw new Error("That file type can't be read.");
    const data = input.data ?? "";
    if (!data || data.length > MAX_BASE64) throw new Error("That file is too large to read.");
    return { kind: input.kind, mime: input.mime, data };
  })
  .handler(async ({ data }): Promise<{ number: string | null }> => {
    const { askAi, parseJson, AiUnavailable } = await import("@/lib/ai.server");

    const ask =
      data.kind === "pan"
        ? `This should be an Indian PAN card. Return JSON only: {"pan":"ABCDE1234F or null"}. ` +
          `The PAN is 10 characters: 5 letters, 4 digits, 1 letter. If it is not a PAN card or the number is unreadable, use null.`
        : `This should be an Indian Aadhaar card. Return JSON only: {"last4":"1234 or null"}. ` +
          `Give ONLY the last four digits of the 12-digit Aadhaar number, never the full number. ` +
          `Ignore the VID and any other numbers. If it is not an Aadhaar card or the number is unreadable, use null.`;

    let raw = "";
    try {
      raw = await askAi([
        {
          role: "user",
          content: [
            { type: "text", text: ask },
            { type: "image_url", image_url: { url: `data:${data.mime};base64,${data.data}` } },
          ],
        },
      ]);
    } catch (e) {
      if (e instanceof AiUnavailable) return { number: null };
      throw e;
    }

    const parsed = parseJson<{ pan?: unknown; last4?: unknown }>(raw, {});
    if (data.kind === "pan") {
      const pan = String(parsed.pan ?? "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      return { number: /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) ? pan : null };
    }
    const last4 = String(parsed.last4 ?? "")
      .replace(/\D/g, "")
      .slice(-4);
    return { number: /^\d{4}$/.test(last4) ? last4 : null };
  });
