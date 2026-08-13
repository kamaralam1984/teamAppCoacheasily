import { addDays, parseIso } from "@/lib/calendar";

export interface IcsEntry {
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
}

function stamp(): string {
  return `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

function dateOnly(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

function dateTime(isoDate: string, time: string): string {
  const { y, m, d } = parseIso(isoDate);
  const [h, min] = time.split(":");
  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}T${h}${min}00`;
}

function escape(text: string): string {
  return text.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

/** A calendar file Google, Apple and Outlook all understand. */
export function buildIcs(name: string, entries: IcsEntry[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CoachEasily//Team App//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(name)}`,
    "X-WR-TIMEZONE:Asia/Kolkata",
  ];

  for (const e of entries) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}@coacheasily`);
    lines.push(`DTSTAMP:${stamp()}`);
    if (e.fromTime) {
      lines.push(`DTSTART;TZID=Asia/Kolkata:${dateTime(e.start, e.fromTime)}`);
      lines.push(`DTEND;TZID=Asia/Kolkata:${dateTime(e.end, e.toTime ?? e.fromTime)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.start)}`);
      // all-day events end the morning after the last day
      lines.push(`DTEND;VALUE=DATE:${dateOnly(addDays(e.end, 1))}`);
    }
    lines.push(`SUMMARY:${escape(e.title)}`);
    if (e.location) lines.push(`LOCATION:${escape(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escape(e.description)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
