/** One-tap links into Google, Apple and Outlook. */

function compact(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

function compactTime(time: string): string {
  return `${time.replace(":", "")}00`;
}

function shift(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}

export interface SingleEventLink {
  title: string;
  start: string;
  end: string;
  fromTime?: string | null;
  toTime?: string | null;
  location?: string | null;
  details?: string | null;
}

/** "Add to Google Calendar" for one item, times always read as Asia/Kolkata. */
export function googleEventUrl(e: SingleEventLink): string {
  const dates = e.fromTime
    ? `${compact(e.start)}T${compactTime(e.fromTime)}/${compact(e.end)}T${compactTime(
        e.toTime ?? e.fromTime,
      )}`
    : `${compact(e.start)}/${compact(shift(e.end, 1))}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates,
    ctz: "Asia/Kolkata",
  });
  if (e.location) params.set("location", e.location);
  if (e.details) params.set("details", e.details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export interface SubscribeLinks {
  url: string;
  webcal: string;
  google: string;
  apple: string;
  outlook: string;
}

export function subscribeLinks(origin: string, token: string): SubscribeLinks {
  const url = `${origin}/api/public/calendar/${token}.ics`;
  const webcal = url.replace(/^https?:/, "webcal:");
  return {
    url,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    apple: webcal,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(
      url,
    )}&name=${encodeURIComponent("CoachEasily")}`,
  };
}
