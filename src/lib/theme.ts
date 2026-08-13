/**
 * The theme engine.
 *
 * A theme repaints the office; it never repaints the words. Structurally, a
 * patch can only carry the ten SURFACE + ACCENT tokens below. There is no field
 * anywhere — type, table constraint or form — for ink, soft, white or mist, so
 * no festival can ever make a line of text unreadable.
 */

export const PATCH_KEYS = [
  "pearl",
  "ivory",
  "night",
  "night2",
  "line",
  "gold",
  "goldL",
  "goldD",
  "saff",
  "saffBtn",
] as const;

export type PatchKey = (typeof PATCH_KEYS)[number];

/** Colours a theme is allowed to set. Text tokens are deliberately absent. */
export type ThemePatch = Partial<Record<PatchKey, string>>;

export type Particles = "embers" | "colour" | "sparkle" | "none";

export interface Theme {
  key: string;
  name: string;
  emoji: string;
  greeting: string;
  /** MM-DD strings this theme auto-selects on. */
  dates: string[];
  patch: ThemePatch;
  particles: Particles;
  sort_order: number;
}

/** Strips anything that is not an allowed surface/accent token. */
export function sanitisePatch(raw: unknown): ThemePatch {
  const out: ThemePatch = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of PATCH_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) out[key] = value;
  }
  return out;
}

/** Shipped defaults — the app is themed correctly before the table even loads. */
export const FALLBACK_THEMES: Theme[] = [
  {
    key: "everyday",
    name: "Everyday",
    emoji: "🪔",
    greeting: "Show up, mark the day, move one number.",
    dates: [],
    patch: {},
    particles: "embers",
    sort_order: 0,
  },
];

export const EVERYDAY: Theme = FALLBACK_THEMES[0];

/** MM-DD in IST. */
export function istMonthDay(now: Date = new Date()): string {
  return now
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .slice(5);
}

/**
 * Manual choice wins, then today's festival, then the company default,
 * then Everyday. Nothing here ever throws — the shell must always paint.
 */
export function resolveTheme(
  themes: Theme[],
  opts: { manualKey?: string | null; defaultKey?: string | null; monthDay?: string },
): Theme {
  const list = themes.length > 0 ? themes : FALLBACK_THEMES;
  const byKey = (k?: string | null) => (k ? (list.find((t) => t.key === k) ?? null) : null);

  const manual = byKey(opts.manualKey);
  if (manual) return manual;

  const md = opts.monthDay ?? istMonthDay();
  const festival = list.find((t) => t.dates.includes(md));
  if (festival) return festival;

  return byKey(opts.defaultKey) ?? byKey("everyday") ?? list[0] ?? EVERYDAY;
}

/** Writes the patch onto :root and clears whatever the previous theme set. */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const key of PATCH_KEYS) {
    const value = theme.patch[key];
    if (value) root.style.setProperty(`--ce-${key}`, value);
    else root.style.removeProperty(`--ce-${key}`);
  }
  root.dataset.theme = theme.key;
}

export const THEME_STORAGE_KEY = "ce-theme";
