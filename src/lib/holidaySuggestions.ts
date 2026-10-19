/**
 * Holiday suggestions. A suggestion is only ever a proposal: HR reviews it, edits it and
 * approves it before it becomes a day off. No imports, so this can be tested on its own.
 */

export type SuggestedKind = "national" | "regional";

export interface HolidaySuggestion {
  date: string;
  name: string;
  kind: SuggestedKind;
  region: string | null;
  source: "public-api" | "built-in";
}

interface FixedHoliday {
  /** MM-DD */
  on: string;
  name: string;
  kind: SuggestedKind;
  region?: string;
}

/**
 * Holidays that fall on the same date every year. Festivals that follow the lunar calendar
 * (Holi, Diwali, Eid, ...) move every year, so they are never guessed: HR adds those after
 * checking the official list.
 */
const FIXED: Record<string, FixedHoliday[]> = {
  IN: [
    { on: "01-26", name: "Republic Day", kind: "national" },
    { on: "04-14", name: "Dr. Ambedkar Jayanti", kind: "national" },
    { on: "08-15", name: "Independence Day", kind: "national" },
    { on: "10-02", name: "Gandhi Jayanti", kind: "national" },
    { on: "12-25", name: "Christmas Day", kind: "national" },
    { on: "02-19", name: "Chhatrapati Shivaji Maharaj Jayanti", kind: "regional", region: "MH" },
    { on: "05-01", name: "Maharashtra Day", kind: "regional", region: "MH" },
  ],
};

export function fixedHolidays(
  country: string,
  region: string | null,
  year: number,
): HolidaySuggestion[] {
  return (FIXED[country.toUpperCase()] ?? [])
    .filter((h) => h.kind === "national" || (region !== null && h.region === region.toUpperCase()))
    .map((h) => ({
      date: `${year}-${h.on}`,
      name: h.name,
      kind: h.kind,
      region: h.kind === "regional" ? (h.region ?? null) : null,
      source: "built-in" as const,
    }));
}

/**
 * The Nager.Date public-holiday API: [{ date, name, global, counties }]. A holiday with
 * `global: true` is national; one with counties is regional and only kept when it covers the
 * organisation's region (counties look like "IN-MH").
 */
export function normalizePublicApi(
  raw: unknown,
  country: string,
  region: string | null,
): HolidaySuggestion[] {
  if (!Array.isArray(raw)) return [];
  const out: HolidaySuggestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const h = item as { date?: unknown; name?: unknown; global?: unknown; counties?: unknown };
    if (typeof h.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(h.date)) continue;
    if (typeof h.name !== "string" || !h.name.trim()) continue;
    const counties = Array.isArray(h.counties) ? (h.counties as unknown[]).map(String) : [];
    if (h.global === false && counties.length > 0) {
      const wanted = region ? `${country.toUpperCase()}-${region.toUpperCase()}` : null;
      if (!wanted || !counties.some((c) => c.toUpperCase() === wanted)) continue;
      out.push({
        date: h.date,
        name: h.name.trim(),
        kind: "regional",
        region: region ?? null,
        source: "public-api",
      });
    } else {
      out.push({
        date: h.date,
        name: h.name.trim(),
        kind: "national",
        region: null,
        source: "public-api",
      });
    }
  }
  return out;
}

/** The public list first; the built-in dates fill what it does not have. One entry per date and name. */
export function mergeSuggestions(
  fromApi: HolidaySuggestion[],
  builtIn: HolidaySuggestion[],
): HolidaySuggestion[] {
  const seen = new Set<string>();
  const out: HolidaySuggestion[] = [];
  for (const h of [...fromApi, ...builtIn]) {
    const key = `${h.date}|${h.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    // the same date already suggested under another name: keep the first
    if (out.some((o) => o.date === h.date)) continue;
    seen.add(key);
    out.push(h);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export const LUNAR_NOTE =
  "Festivals that follow the lunar calendar (Holi, Diwali, Eid and others) change every year, so they are not suggested. Add them yourself once you have checked your official holiday list.";
