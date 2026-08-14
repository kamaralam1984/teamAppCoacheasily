/**
 * The one code on the login page that changes every day.
 *
 * Row-level security keeps daily_codes unreadable before sign-in, so this is a
 * curated copy of the org-wide rows in `daily_codes`, kept word for word. If
 * those rows are edited, refresh this file to match. It is deliberately a
 * hardcoded array with no network call — the login page must render instantly
 * and can never depend on a request succeeding.
 *
 * The pick is by day-of-year in Asia/Kolkata so every warrior sees the same
 * code on the same day, whatever device they open.
 */
export type DailyLine = {
  value: "Honesty" | "Dedication" | "Genuine Care";
  title: string;
  body: string;
};

export const DAILY_LINES: DailyLine[] = [
  {
    value: "Honesty",
    title: "Nobody is watching. That is the point.",
    body: "Working from home means the only person who can confirm your day is you. That is not a loophole — it is a responsibility. Shivaji Maharaj's forts held because the sentry on the far wall kept watch when no commander could see him.",
  },
  {
    value: "Dedication",
    title: "Show up before you feel like it",
    body: "Motivation arrives after the work starts, not before. The first twenty minutes are the toll you pay.",
  },
  {
    value: "Genuine Care",
    title: "Somebody's dream is in your inbox",
    body: "Behind every lead, every message, every batch is a person who paid with hope. Treat their day like it matters, because it does.",
  },
  {
    value: "Honesty",
    title: "Mark it only if you mean it",
    body: "This button is not a formality. It is a small promise between you and the team that today you will give real work.",
  },
  {
    value: "Dedication",
    title: "The unglamorous hour",
    body: "Most of what builds a company is boring and repeated. The people who win are the ones who did it anyway.",
  },
  {
    value: "Genuine Care",
    title: "Answer like it is your family asking",
    body: "Speed is kindness. Nobody enjoys waiting for an answer about something that matters to them.",
  },
  {
    value: "Honesty",
    title: "A number you round up is a lie you tell yourself",
    body: "When you log your numbers today, log the real ones. A soft number hides the exact problem you could have fixed.",
  },
  {
    value: "Dedication",
    title: "Swarajya was not built in a quarter",
    body: "Shivaji Maharaj spent decades on a vision most people could not yet see. Your goal is 45 days. You can hold that.",
  },
  {
    value: "Genuine Care",
    title: "Your teammate is having a day you cannot see",
    body: "Remote means you miss the tired face and the good news alike. Assume the best, ask before you judge.",
  },
  {
    value: "Honesty",
    title: "Half-present is not present",
    body: "If today is genuinely not a working day, do not mark it. Taking the leave honestly is stronger than faking the day.",
  },
  {
    value: "Dedication",
    title: "Finish one thing completely",
    body: "A day of half-done work feels busy and moves nothing. Pick one and close it.",
  },
  {
    value: "Genuine Care",
    title: "Nobody remembers the discount. They remember the tone.",
    body: "People forget what we offered. They remember whether we made them feel small or seen.",
  },
  {
    value: "Honesty",
    title: "The report nobody checks",
    body: "Most of what you record here, nobody will ever verify. That is exactly why it has to be accurate.",
  },
  {
    value: "Dedication",
    title: "Consistency beats intensity",
    body: "One brilliant week does not build a company. Twenty ordinary honest days do.",
  },
  {
    value: "Genuine Care",
    title: "Praise out loud, correct in private",
    body: "If somebody helped you this week, say it where the team can hear it.",
  },
  {
    value: "Honesty",
    title: "Own the miss before you are asked",
    body: "Bringing a problem forward yourself costs nothing and buys enormous trust. Hiding it costs everything.",
  },
  {
    value: "Dedication",
    title: "Your future self is watching",
    body: "The work you avoid today lands on you next week, with interest.",
  },
  {
    value: "Genuine Care",
    title: "The quiet one on the call",
    body: "In a remote team it is easy for someone to go silent for a week. Notice. Reach out.",
  },
  {
    value: "Honesty",
    title: "Attendance is not the achievement",
    body: "Marking present is the beginning of the day, not the accomplishment. What happens after this button is the real record.",
  },
  {
    value: "Dedication",
    title: "Do the follow-up nobody assigned you",
    body: "The gap between a good team and a great one is who chases the thing nobody remembered.",
  },
  {
    value: "Genuine Care",
    title: "Speak to the person, not the ticket",
    body: "There is a human on the other side of every number in this app.",
  },
  {
    value: "Honesty",
    title: "You cannot fix what you flatter",
    body: "An honest bad number is more useful than a comfortable good one. It tells you exactly where to push.",
  },
  {
    value: "Dedication",
    title: "Small hinges, heavy doors",
    body: "A ten-minute habit repeated all cycle moves things a heroic weekend never will.",
  },
  {
    value: "Genuine Care",
    title: "Be the reason somebody stays",
    body: "Members leave programmes when they feel forgotten, not when they feel challenged.",
  },
  {
    value: "Honesty",
    title: "Working from home is a trust others extended to you",
    body: "Nobody made you prove you would work. Honour that.",
  },
  {
    value: "Dedication",
    title: "The last ten percent is where the value lives",
    body: "Anyone can get something to ninety. The finish is the profession.",
  },
  {
    value: "Genuine Care",
    title: "Reply before it is escalated",
    body: "Answering early is cheaper than apologising late, in money and in dignity.",
  },
  {
    value: "Honesty",
    title: "If you would not say it on the call, do not write it here",
    body: "Every entry in this app is a statement to your team.",
  },
  {
    value: "Dedication",
    title: "Discipline is a gift you give your teammates",
    body: "When you deliver on time, three other people get to plan their day.",
  },
  {
    value: "Genuine Care",
    title: "Learn one person's story today",
    body: "Remote teams turn into names on a screen unless somebody makes the effort.",
  },
];

/** Day-of-year in Mumbai, 1-based. */
export function istDayOfYear(now: Date = new Date()): number {
  const ist = new Date(now.getTime() + (5.5 * 60 + now.getTimezoneOffset()) * 60000);
  const start = Date.UTC(ist.getFullYear(), 0, 1);
  const today = Date.UTC(ist.getFullYear(), ist.getMonth(), ist.getDate());
  return Math.floor((today - start) / 86400000) + 1;
}

export function lineOfTheDay(now: Date = new Date()): DailyLine {
  return DAILY_LINES[istDayOfYear(now) % DAILY_LINES.length]!;
}
