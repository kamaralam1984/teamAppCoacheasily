/**
 * Reads a PAN, or the last four Aadhaar digits, off a card photo on the person's own
 * device (Tesseract OCR) — the card is never sent anywhere to be read. Pure text
 * parsing lives in panFromText / aadhaarLast4FromText so it can be checked without OCR.
 */

const TO_LETTER: Record<string, string> = {
  "0": "O",
  "1": "I",
  "2": "Z",
  "5": "S",
  "6": "G",
  "8": "B",
};
const TO_DIGIT: Record<string, string> = {
  O: "0",
  D: "0",
  Q: "0",
  I: "1",
  L: "1",
  Z: "2",
  S: "5",
  G: "6",
  B: "8",
};
// 4th PAN character: the holder type (P = person, C = company, …).
const HOLDER = "PCHFATBLJG";
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Fixes OCR's usual letter/digit mix-ups in a 10-character candidate, or null. */
function coercePan(token: string): string | null {
  if (token.length !== 10) return null;
  const out = token.split("").map((ch, i) => {
    const wantDigit = i >= 5 && i <= 8;
    if (wantDigit) return /\d/.test(ch) ? ch : (TO_DIGIT[ch] ?? ch);
    return /[A-Z]/.test(ch) ? ch : (TO_LETTER[ch] ?? ch);
  });
  const pan = out.join("");
  return PAN.test(pan) ? pan : null;
}

export function panFromText(text: string): string | null {
  const tokens = text
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  // Also try neighbours joined, for a PAN that OCR split with a stray space.
  const candidates = [...tokens];
  for (let i = 0; i + 1 < tokens.length; i++) candidates.push(tokens[i]! + tokens[i + 1]!);

  const exact = candidates.filter((t) => PAN.test(t));
  const fixed = candidates.map(coercePan).filter((t): t is string => Boolean(t));
  const pick = (list: string[]) => list.find((p) => HOLDER.includes(p[3]!)) ?? list[0] ?? null;
  return pick(exact) ?? pick(fixed);
}

// Verhoeff check digit — every real Aadhaar number passes it, OCR misreads almost never do.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function verhoeffValid(digits: string): boolean {
  let c = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) c = D[c]![P[i % 8]![Number(rev[i])]!]!;
  return c === 0;
}

/** Only the last four digits ever leave this function — never the full number. */
export function aadhaarLast4FromText(text: string): string | null {
  for (const line of text.split(/\n/)) {
    if (/\bVID\b/i.test(line)) continue;
    // Masked e-Aadhaar: XXXX XXXX 1234
    const masked = /[X×]{4}\s?[X×]{4}\s?(\d{4})(?!\d)/i.exec(line);
    if (masked) return masked[1]!;
    // A 12-digit group in 4-4-4, not part of a 16-digit VID.
    for (const m of line.matchAll(/(?<![\d])(\d{4})\s?(\d{4})\s?(\d{4})(?!\s?\d)/g)) {
      const n = m[1]! + m[2]! + m[3]!;
      if (/^[2-9]/.test(n) && verhoeffValid(n)) return n.slice(-4);
    }
  }
  return null;
}

/** OCR a card photo in the browser. Null when nothing usable was found. */
export async function readCardOnDevice(
  image: Blob,
  kind: "pan" | "aadhaar",
): Promise<string | null> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(image);
    return kind === "pan" ? panFromText(data.text) : aadhaarLast4FromText(data.text);
  } finally {
    await worker.terminate();
  }
}
