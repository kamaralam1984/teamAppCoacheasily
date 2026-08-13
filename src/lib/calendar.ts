/** Everything the calendar needs to reason about dates, colours and plain English. */

export const IST = "Asia/Kolkata";

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Dates are handled as plain YYYY-MM-DD strings so no timezone can shift a day. */
export function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseIso(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

export function addDays(isoDate: string, n: number): string {
  const { y, m, d } = parseIso(isoDate);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function dayOfWeek(isoDate: string): number {
  const { y, m, d } = parseIso(isoDate);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekdayName(isoDate: string): string {
  return WEEKDAYS[dayOfWeek(isoDate)] ?? "";
}

export function daysBetween(a: string, b: string): number {
  const pa = parseIso(a);
  const pb = parseIso(b);
  return Math.round(
    (Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000,
  );
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function longDate(isoDate: string): string {
  const { y, m, d } = parseIso(isoDate);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function niceDate(isoDate: string): string {
  const { m, d } = parseIso(isoDate);
  return `${d} ${(MONTHS[m - 1] ?? "").slice(0, 3)}`;
}

export function rangeLabel(from: string, to: string): string {
  if (from === to) return niceDate(from);
  const a = parseIso(from);
  const b = parseIso(to);
  if (a.m === b.m && a.y === b.y) return `${a.d}–${b.d} ${(MONTHS[a.m - 1] ?? "").slice(0, 3)}`;
  return `${niceDate(from)} – ${niceDate(to)}`;
}

export function timeLabel(t: string | null): string | null {
  if (!t) return null;
  const [hRaw, min] = t.split(":");
  const h = Number(hRaw);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return min && min !== "00" ? `${h12}:${min}${suffix}` : `${h12}${suffix}`;
}

/** Six-week grid, Sunday first, with padding days from the neighbouring months. */
export function monthGrid(y: number, m: number): { date: string; inMonth: boolean }[] {
  const first = iso(y, m, 1);
  const lead = dayOfWeek(first);
  const total = daysInMonth(y, m);
  const cells: { date: string; inMonth: boolean }[] = [];
  for (let i = lead; i > 0; i -= 1) cells.push({ date: addDays(first, -i), inMonth: false });
  for (let d = 1; d <= total; d += 1) cells.push({ date: iso(y, m, d), inMonth: true });
  while (cells.length % 7 !== 0) {
    cells.push({ date: addDays(cells[cells.length - 1]!.date, 1), inMonth: false });
  }
  return cells;
}

// ───────────────────────── colours & ordering ─────────────────────────

export type ProgramType = "CBA" | "MCA" | "Kickstart" | "Summit" | "Webinar";

export const PROGRAM_TYPES: ProgramType[] = ["CBA", "MCA", "Kickstart", "Summit", "Webinar"];

/** CBA = goldD · MCA = emer · Kickstart = saff · Summit = violet · Holiday = red. */
export const MARKER_COLOUR: Record<string, string> = {
  CBA: "bg-goldD",
  MCA: "bg-emer",
  Kickstart: "bg-saff",
  Summit: "bg-violet",
  Webinar: "bg-night",
  Holiday: "bg-red",
  Event: "bg-soft",
};

export const CHIP_STYLE: Record<string, string> = {
  CBA: "bg-goldD/10 text-goldD border-goldD/30",
  MCA: "bg-emer/10 text-emer border-emer/30",
  Kickstart: "bg-saff/10 text-saff border-saff/30",
  Summit: "bg-violet/10 text-violet border-violet/30",
  Webinar: "bg-night/10 text-night border-night/30",
  Holiday: "bg-red/10 text-red border-red/30",
  Event: "bg-cream text-soft border-line",
};

/** Month summary always reads in this order. */
export const SUMMARY_ORDER = ["CBA", "MCA", "Kickstart", "Summit", "Holiday"] as const;

export const EVENT_TYPES = [
  "Meeting",
  "Review",
  "1:1",
  "Standup",
  "Training",
  "Retreat",
  "Webinar",
] as const;

// ───────────────────────── plain-English parsing ─────────────────────────

export interface Parsed {
  ok: boolean;
  error?: string;
  raw: string;
  name: string;
  type: string;
  isProgram: boolean;
  from: string;
  to: string;
  fromTime: string | null;
  toTime: string | null;
  location: string | null;
  /** 0–6, Sunday first, when the line asked for a weekly repeat. */
  repeatDow: number | null;
  repeatUntil: string | null;
  /** true when the line repeats but never said when to stop. */
  unbounded: boolean;
  /** how many weeks the expansion actually covered. */
  weeks: number;
  dates: { from: string; to: string }[];
}

/** How far an open-ended "every Wednesday" runs unless somebody says otherwise. */
export const DEFAULT_HORIZON_WEEKS = 12;
export const HORIZON_CHOICES = [4, 8, 12, 26, 52] as const;
/** Above this, creating the series needs an explicit tick. */
export const BULK_CONFIRM_ABOVE = 26;

const MONTH_WORDS: Record<string, number> = {};
MONTHS.forEach((name, i) => {
  MONTH_WORDS[name.toLowerCase()] = i + 1;
  MONTH_WORDS[name.toLowerCase().slice(0, 3)] = i + 1;
});
MONTH_WORDS["sept"] = 9;

function monthNumber(word: string): number | null {
  return MONTH_WORDS[word.toLowerCase().replace(/\./g, "")] ?? null;
}

function resolveYear(month: number, day: number, today: string): number {
  const t = parseIso(today);
  const candidate = iso(t.y, month, day);
  return daysBetween(today, candidate) < -180 ? t.y + 1 : t.y;
}

function parseTime(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ?? "00";
  const mer = m[3]?.toLowerCase();
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  if (!mer && h < 8) h += 12; // "at 4 to 6" almost always means the evening here
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${min}`;
}

// ── naming: what's left after the when, the where and the filler ──

/** "we have", "please add" and friends carry no meaning in an event name. */
const FILLER = [
  "i want to add",
  "i want to schedule",
  "i'd like to add",
  "please add",
  "please schedule",
  "let us do",
  "let's do",
  "lets do",
  "let us have",
  "let's have",
  "lets have",
  "we have",
  "we do",
  "we run",
  "we hold",
  "there is",
  "there's",
  "there are",
  "schedule a",
  "schedule an",
  "schedule the",
  "schedule",
  "add a",
  "add an",
  "add the",
  "add",
  "book a",
  "book an",
  "book",
  "create a",
  "create an",
  "create",
  "put in",
  "set up a",
  "set up",
];

const EDGE_WORDS = new Set([
  "on","at","from","to","the","a","an","for","every","until","till","in","of","and","with",
  "we","is","are","be","it","this","that","our","my","new","also","then","please","pm","am",
]);

const KEEP_CAPS = /^[A-Z0-9][A-Z0-9&./-]*$/; // CBA, MCA, 1:1, R&D

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (KEEP_CAPS.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** "sessions" → "session": every occurrence is one of them. */
function singularise(word: string): string {
  const lower = word.toLowerCase();
  if (/(ss|us|is)$/.test(lower)) return word;
  if (/ies$/i.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|x|z|s)es$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word) && word.length > 3) return word.slice(0, -1);
  return word;
}

/**
 * Builds the event name from whatever the sentence has left once the date,
 * time, recurrence and location phrases have been eaten out of it.
 */
export function cleanName(leftover: string, opts: { type: string; recurring: boolean }): string {
  let s = ` ${leftover.toLowerCase()} `
    .replace(/[,:;–—“”"()]+/g, " ")
    .replace(/\s+/g, " ");

  // filler can sit anywhere in the sentence, not only at the front
  for (const phrase of FILLER) {
    s = s.replace(new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), " ");
  }
  s = s.replace(/\s+/g, " ").trim();

  // keep the original casing of the surviving words (CBA, MCA, Hinglish…)
  const originals = leftover.replace(/[,:;–—“”"()]+/g, " ").split(/\s+/).filter(Boolean);
  let words = s.split(/\s+/).filter(Boolean).map((w) => {
    const hit = originals.find((o) => o.replace(/[^A-Za-z0-9:&./-]/g, "").toLowerCase() === w);
    return (hit ?? w).replace(/[^A-Za-z0-9:&./'-]+$/g, "");
  });

  // trim stray connectors and stop-words from both ends
  while (words.length && EDGE_WORDS.has(words[0]!.toLowerCase())) words.shift();
  while (words.length && EDGE_WORDS.has(words[words.length - 1]!.toLowerCase())) words.pop();

  if (recurringPlural(words, opts.recurring)) {
    words[words.length - 1] = singularise(words[words.length - 1]!);
  }

  const name = titleCase(words.join(" ").trim());
  if (name.replace(/[^A-Za-z0-9]/g, "").length < 3) return opts.type;
  return name;
}

function recurringPlural(words: string[], recurring: boolean): boolean {
  if (!recurring || words.length === 0) return false;
  return /s$/i.test(words[words.length - 1]!);
}

/**
 * Turns one line of ordinary English into a dated item.
 * Deliberately forgiving — anything it cannot date is returned with ok:false.
 */
export function parseLine(
  input: string,
  today = todayIso(),
  horizon?: { weeks?: number; until?: string | null },
): Parsed {
  const raw = input.trim();
  const out: Parsed = {
    ok: false,
    raw,
    name: "",
    type: "Meeting",
    isProgram: false,
    from: "",
    to: "",
    fromTime: null,
    toTime: null,
    location: null,
    repeatDow: null,
    repeatUntil: null,
    unbounded: false,
    weeks: 0,
    dates: [],
  };
  if (!raw) return { ...out, error: "Empty line." };

  let text = ` ${raw} `;
  const eat = (re: RegExp) => {
    text = text.replace(re, " ");
  };

  // ── type ──
  const typeMap: [RegExp, string, boolean][] = [
    [/\bCBA\b/i, "CBA", true],
    [/\bMCA\b/i, "MCA", true],
    [/\bkick\s?start\b/i, "Kickstart", true],
    [/\bsummit\b/i, "Summit", true],
    [/\bwebinar\b/i, "Webinar", true],
    [/\bstand\s?up\b/i, "Standup", false],
    [/\breview\b/i, "Review", false],
    [/\b1\s?:\s?1\b/i, "1:1", false],
    [/\btraining\b/i, "Training", false],
    [/\bretreat\b/i, "Retreat", false],
    [/\bmeeting\b/i, "Meeting", false],
  ];
  for (const [re, type, isProgram] of typeMap) {
    if (re.test(text)) {
      out.type = type;
      out.isProgram = isProgram;
      break;
    }
  }

  // ── location ──
  const locIn = text.match(/\bin\s+([A-Z][A-Za-z]+)\b/);
  if (/\boffline\b/i.test(text)) out.location = "Offline";
  if (/\bonline\b/i.test(text)) out.location = "Online";
  if (locIn?.[1]) out.location = out.location ? `${locIn[1]} · ${out.location}` : locIn[1];
  eat(/\b(offline|online)\b/gi);
  if (locIn?.[0]) eat(new RegExp(locIn[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  // ── recurrence ──
  const every = text.match(
    /\bevery\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  );
  if (every?.[1]) {
    out.repeatDow = WEEKDAYS.findIndex((w) => w.toLowerCase() === every[1]!.toLowerCase());
    eat(new RegExp(every[0], "i"));
  }
  const forWeeks = text.match(/\bfor\s+(\d{1,2})\s+weeks?\b/i);
  const untilMatch = text.match(
    /\buntil\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?/i,
  );
  if (untilMatch) {
    const mm = monthNumber(untilMatch[2] ?? "");
    if (mm) {
      const dd = Number(untilMatch[1]);
      out.repeatUntil = iso(
        untilMatch[3] ? Number(untilMatch[3]) : resolveYear(mm, dd, today),
        mm,
        dd,
      );
    }
    eat(new RegExp(untilMatch[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  if (forWeeks) eat(new RegExp(forWeeks[0], "i"));

  // ── times ──
  const timeRange = text.match(
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|–|—|-|until|till)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,
  );
  if (timeRange) {
    const a = parseTime(timeRange[1]!.replace(/\s+/g, ""));
    const b = parseTime(timeRange[2]!.replace(/\s+/g, ""));
    if (a && b) {
      out.fromTime = a;
      out.toTime = b;
      eat(new RegExp(timeRange[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
  }
  if (!out.fromTime) {
    const at = text.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (at) {
      const a = parseTime(at[1]!.replace(/\s+/g, ""));
      if (a) {
        out.fromTime = a;
        eat(new RegExp(at[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
      }
    }
  }

  if (!out.fromTime) {
    const bare = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
    if (bare) {
      const a = parseTime(bare[1]!.replace(/\s+/g, ""));
      if (a) {
        out.fromTime = a;
        eat(new RegExp(bare[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
      }
    }
  }

  // ── dates ──
  let from = "";
  let to = "";

  const dayRange = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:-|–|—|to)\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?/i,
  );
  const single = text.match(
    /\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?/i,
  );
  const monthFirst = text.match(
    /\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*(?:-|–|to)\s*(\d{1,2}))?(?:\s+(\d{4}))?/i,
  );
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  const nextDay = text.match(
    /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  );
  const thisDay = text.match(
    /\b(?:this\s+|on\s+)(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  );

  if (dayRange && monthNumber(dayRange[3] ?? "")) {
    const mm = monthNumber(dayRange[3]!)!;
    const y = dayRange[4] ? Number(dayRange[4]) : resolveYear(mm, Number(dayRange[1]), today);
    from = iso(y, mm, Number(dayRange[1]));
    to = iso(y, mm, Number(dayRange[2]));
    eat(new RegExp(dayRange[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  } else if (single && monthNumber(single[2] ?? "")) {
    const mm = monthNumber(single[2]!)!;
    const y = single[3] ? Number(single[3]) : resolveYear(mm, Number(single[1]), today);
    from = iso(y, mm, Number(single[1]));
    to = from;
    eat(new RegExp(single[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  } else if (monthFirst && monthNumber(monthFirst[1] ?? "")) {
    const mm = monthNumber(monthFirst[1]!)!;
    const y = monthFirst[4] ? Number(monthFirst[4]) : resolveYear(mm, Number(monthFirst[2]), today);
    from = iso(y, mm, Number(monthFirst[2]));
    to = monthFirst[3] ? iso(y, mm, Number(monthFirst[3])) : from;
    eat(new RegExp(monthFirst[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  } else if (slash) {
    const yRaw = slash[3];
    const y = yRaw
      ? Number(yRaw.length === 2 ? `20${yRaw}` : yRaw)
      : resolveYear(Number(slash[2]), Number(slash[1]), today);
    from = iso(y, Number(slash[2]), Number(slash[1]));
    to = from;
    eat(new RegExp(slash[0].replace(/\//g, "\\/")));
  } else if (/\btomorrow\b/i.test(text)) {
    from = addDays(today, 1);
    to = from;
    eat(/\btomorrow\b/gi);
  } else if (/\btoday\b/i.test(text)) {
    from = today;
    to = from;
    eat(/\btoday\b/gi);
  } else if (nextDay?.[1]) {
    const want = WEEKDAYS.findIndex((w) => w.toLowerCase() === nextDay[1]!.toLowerCase());
    let cursor = addDays(today, 1);
    while (dayOfWeek(cursor) !== want) cursor = addDays(cursor, 1);
    from = cursor;
    to = cursor;
    eat(new RegExp(nextDay[0], "i"));
  } else if (thisDay?.[1]) {
    const want = WEEKDAYS.findIndex((w) => w.toLowerCase() === thisDay[1]!.toLowerCase());
    let cursor = addDays(today, 1);
    while (dayOfWeek(cursor) !== want) cursor = addDays(cursor, 1);
    from = cursor;
    to = cursor;
    eat(new RegExp(thisDay[0], "i"));
  } else if (out.repeatDow !== null) {
    let cursor = today;
    while (dayOfWeek(cursor) !== out.repeatDow) cursor = addDays(cursor, 1);
    from = cursor;
    to = cursor;
  }

  if (!from) {
    return { ...out, error: "Couldn't find a date. Try “on 25 August” or “17-20 August”." };
  }
  if (daysBetween(from, to) < 0) {
    return { ...out, from, to, error: "The last day is before the first day." };
  }

  // ── name: whatever sensible words are left, cleaned properly ──
  out.name = cleanName(text.replace(/\s+/g, " ").trim(), {
    type: out.type,
    recurring: out.repeatDow !== null,
  });

  out.from = from;
  out.to = to;

  // ── expand a weekly repeat into real dated sessions ──
  if (out.repeatDow !== null) {
    const span = daysBetween(from, to);
    let cursor = from;
    while (dayOfWeek(cursor) !== out.repeatDow) cursor = addDays(cursor, 1);

    // Nothing in the sentence said when to stop? Then we only go as far as the
    // horizon — never a silent year of events.
    out.unbounded = !forWeeks && !out.repeatUntil;
    const chosenUntil = horizon?.until || null;
    const weeks = out.unbounded
      ? Math.max(1, horizon?.weeks ?? DEFAULT_HORIZON_WEEKS)
      : forWeeks
        ? Number(forWeeks[1])
        : 520;
    const limit = chosenUntil ?? out.repeatUntil ?? addDays(cursor, 7 * (weeks - 1));
    out.repeatUntil = out.repeatUntil ?? chosenUntil;

    let guard = 0;
    while (daysBetween(cursor, limit) >= 0 && guard < 520) {
      out.dates.push({ from: cursor, to: addDays(cursor, span) });
      cursor = addDays(cursor, 7);
      guard += 1;
      if (!out.repeatUntil && !chosenUntil && out.dates.length >= weeks) break;
    }
    out.weeks = out.dates.length;
  } else {
    out.dates.push({ from, to });
  }

  out.ok = out.dates.length > 0;
  if (!out.ok) out.error = "That repeat produced no dates.";
  return out;
}
