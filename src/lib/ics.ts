/** Everything needed to speak fluent iCalendar to Google, Apple and Outlook. */

export interface IcsEntry {
  /** Stable across edits — this is what stops duplicates appearing. */
  uid: string;
  title: string;
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD, inclusive */
  end: string;
  fromTime?: string | null;
  toTime?: string | null;
  location?: string | null;
  description?: string | null;
  /** Raised on every edit so calendar apps replace rather than keep the old copy. */
  sequence?: number;
  cancelled?: boolean;
}

const TZ = "Asia/Kolkata";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parts(isoDate: string): { y: number; m: number; d: number } {
  const [y, m, d] = isoDate.split("-").map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

function shift(isoDate: string, n: number): string {
  const { y, m, d } = parts(isoDate);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function stamp(): string {
  return `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

function dateOnly(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

function dateTime(isoDate: string, time: string): string {
  const { y, m, d } = parts(isoDate);
  const [h, min] = time.split(":");
  return `${y}${pad(m)}${pad(d)}T${h}${min}00`;
}

function escape(text: string): string {
  return text.replace(/([,;\\])/g, "\\$1").replace(/\r?\n/g, "\\n");
}

/** iCalendar lines must not exceed 75 octets; continuations start with a space. */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const chunks: string[] = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length > 73) {
    chunks.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  if (rest) chunks.push(` ${rest}`);
  return chunks.join("\r\n");
}

/** India never changes its clocks, so one fixed offset block is correct and simple. */
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZ}`,
  "X-LIC-LOCATION:Asia/Kolkata",
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:+0530",
  "TZOFFSETTO:+0530",
  "TZNAME:IST",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export function buildIcs(name: string, entries: IcsEntry[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CoachEasily//Team App//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(name)}`,
    `X-WR-TIMEZONE:${TZ}`,
    "X-WR-CALDESC:CoachEasily programmes, holidays, meetings and your own approved leave.",
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
    "X-PUBLISHED-TTL:PT4H",
    ...VTIMEZONE,
  ];

  const ts = stamp();
  for (const e of entries) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}@coacheasily`);
    lines.push(`DTSTAMP:${ts}`);
    lines.push(`SEQUENCE:${e.sequence ?? 0}`);
    if (e.fromTime) {
      lines.push(`DTSTART;TZID=${TZ}:${dateTime(e.start, e.fromTime)}`);
      lines.push(`DTEND;TZID=${TZ}:${dateTime(e.end, e.toTime ?? e.fromTime)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.start)}`);
      // an all-day block ends the morning after its last day
      lines.push(`DTEND;VALUE=DATE:${dateOnly(shift(e.end, 1))}`);
    }
    lines.push(`SUMMARY:${escape(e.title)}`);
    if (e.location) lines.push(`LOCATION:${escape(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escape(e.description)}`);
    lines.push(e.cancelled ? "STATUS:CANCELLED" : "STATUS:CONFIRMED");
    lines.push("TRANSP:OPAQUE");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}
