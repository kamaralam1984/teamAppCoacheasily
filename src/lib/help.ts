/**
 * Every explanation in the app lives here, once.
 * The panel on a screen and the Help page read the same words,
 * so nobody is ever told two different things.
 */

export type HelpGroup =
  | "Your day"
  | "Goals and numbers"
  | "Leave"
  | "The calendar"
  | "Tasks"
  | "Culture"
  | "Your voice"
  | "For managers"
  | "For HR";

export const HELP_GROUPS: HelpGroup[] = [
  "Your day",
  "Goals and numbers",
  "Leave",
  "The calendar",
  "Tasks",
  "Culture",
  "Your voice",
  "For managers",
  "For HR",
];

/** A screen with a "How do I use this?" link. */
export type HelpScreen =
  | "dashboard"
  | "calendar"
  | "tasks"
  | "goals"
  | "culture"
  | "leave"
  | "warriors"
  | "ideas"
  | "team"
  | "approvals"
  | "reports"
  | "settings";

export interface HelpTopic {
  key: string;
  title: string;
  group: HelpGroup;
  /** Set when this topic is the panel for a screen. */
  screen?: HelpScreen;
  /** Short paragraphs. Plain words, no manual. */
  body: string[];
}

export const HELP_TOPICS: HelpTopic[] = [
  /* ── Your day ─────────────────────────────────────────── */
  {
    key: "dashboard",
    title: "The dashboard — your day in one screen",
    group: "Your day",
    screen: "dashboard",
    body: [
      "This is where the day starts. Mark your attendance, read the code for the day, pick the few things you will actually finish, and put in yesterday's numbers if you owe any.",
      "Most days you will do three things here: tap Mark attendance, choose your priorities for the day, and log any numbers your goals need.",
      "Worth knowing: attendance cannot be back-dated and cannot be undone. It is a record of when you actually arrived, so mark it when you start — not later in the day and not for a day gone by.",
    ],
  },
  {
    key: "attendance",
    title: "Marking attendance",
    group: "Your day",
    body: [
      "One tap, once a day, when you begin. It stamps the time, so it is honest by design.",
      "There is no undo and no back-dating. If you forget a day, that day simply has no mark — tell HR rather than trying to fix it yourself.",
      "Every twenty days marked adds one day of earned leave, up to a maximum of thirty. That is why the count matters.",
    ],
  },
  {
    key: "daily-code",
    title: "Today's code",
    group: "Your day",
    body: [
      "A short value, a thought and a pledge for the day. It shows when you mark attendance and then sits on the dashboard so you can come back to it.",
      "Some codes are written for a particular department. You will see yours.",
    ],
  },
  {
    key: "checkin",
    title: "Asking for a check-in",
    group: "Your day",
    body: [
      "If something is heavy — work or otherwise — you can ask for a quiet conversation from the Culture screen.",
      "A check-in request is private. Only HR sees that you asked. Nobody on your team is told, and the reason is yours to share or not.",
    ],
  },

  /* ── Goals and numbers ────────────────────────────────── */
  {
    key: "goals",
    title: "Goals — what you are moving this cycle",
    group: "Goals and numbers",
    screen: "goals",
    body: [
      "A cycle is a fixed stretch of days with a handful of goals in it. Each goal has where you started, where you are now, and where you are going.",
      "Here you will mostly log today's number, look at how far you have moved, and write your Monday plan for the week.",
      "Worth knowing: progress is measured from where you started, not from zero. Going from 0 to 7 with a target of 20 is real work, and the app counts it that way.",
    ],
  },
  {
    key: "moved-vs-target",
    title: "\"Moved this cycle\" and \"of target\"",
    group: "Goals and numbers",
    body: [
      "Moved this cycle is how far you travelled from where you started towards your target. It only counts what changed in these days.",
      "Of target is how close you are to the finish line. It includes where you already were when the cycle began.",
      "Both matter, and they answer different questions. We lead with movement because that is the part you can affect. Somebody sitting at 78 with a target of 85 may be in a strong position and still not have moved — that is a different conversation from being stuck at zero.",
      "When a target is the same as the starting number, that is a hold-the-line goal. There is no movement to measure, so you are scored on keeping the level.",
    ],
  },
  {
    key: "daily-numbers",
    title: "Today's numbers",
    group: "Goals and numbers",
    body: [
      "Small and daily beats a big catch-up at the end. Put in what happened today, and the goal takes care of itself.",
      "You can back-date a number if you missed a day. Funnels take a count at each stage; single-number goals take one figure.",
      "If a goal tracks money, there is an extra box for what closed today.",
    ],
  },
  {
    key: "cycles",
    title: "Cycles, and closing one off",
    group: "Goals and numbers",
    body: [
      "HR opens and closes cycles. When one closes, the last-cycle card asks where you actually finished so the record is true.",
      "You can carry a goal into the next cycle. It brings the closing number across as the new starting point, and the old target with it.",
      "Goals are archived, never deleted. What was logged stays logged.",
    ],
  },

  /* ── Leave ────────────────────────────────────────────── */
  {
    key: "leave",
    title: "Leave — asking for time off",
    group: "Leave",
    screen: "leave",
    body: [
      "Your balances sit at the top: what you are entitled to, what you have used, what is waiting for a decision, and what is left.",
      "Apply with the dates and a line about why. It goes to your approver, and you can watch it here until it is decided.",
      "Worth knowing: a weekly off inside a stretch of earned leave is not charged to you. That is why a week away is often fewer days than the calendar suggests — the form tells you the count it will actually use.",
    ],
  },
  {
    key: "leave-rules",
    title: "The rules that trip people up",
    group: "Leave",
    body: [
      "Sick leave never carries a warning. If you are unwell, apply. Nothing about it is questioned by the app.",
      "The sandwich rule applies to casual leave taken either side of a holiday or a weekly off — the days in between get counted. The form warns you before you send it.",
      "Earned leave grows as you show up: one day for every twenty days marked, capped at thirty.",
      "A short-notice request is not blocked, only flagged, so your approver knows to look sooner.",
    ],
  },
  {
    key: "comp-off",
    title: "Comp-off",
    group: "Leave",
    body: [
      "If you mark attendance on a holiday or on your weekly off, a comp-off credit is created for you automatically. You do not have to ask.",
      "When you take one, the oldest credit is used first so nothing quietly expires.",
      "If comp-off is switched off for the company, you will not see it in the leave types at all.",
    ],
  },
  {
    key: "handover",
    title: "Handover before you go",
    group: "Leave",
    body: [
      "When you apply, you can name somebody to hold your tasks while you are away and pick which ones they take.",
      "If you are hosting anything on the calendar during those dates, the app says so before your approver decides.",
    ],
  },

  /* ── The calendar ─────────────────────────────────────── */
  {
    key: "calendar",
    title: "The company calendar",
    group: "The calendar",
    screen: "calendar",
    body: [
      "Programs, meetings, holidays and who is away — one month at a time. Tap a day to see everything on it.",
      "Most people come here to check what is on and who is out. If you schedule, you can type a plain sentence like \"Batch 12 session 3 on Tuesday at 7pm\" and the app works it out before you confirm.",
      "Worth knowing: if a host has approved leave on the day of their session, a red line says so — in the calendar and again in Approvals, before anybody signs anything off.",
    ],
  },
  {
    key: "calendar-subscribe",
    title: "Getting it into your own calendar",
    group: "The calendar",
    body: [
      "There is a private subscription link on the calendar screen. Add it to Google Calendar or your phone once and it keeps itself up to date.",
      "The link is yours alone. Do not pass it on — it shows your schedule.",
    ],
  },

  /* ── Tasks ────────────────────────────────────────────── */
  {
    key: "tasks",
    title: "Tasks and the daily rhythm",
    group: "Tasks",
    screen: "tasks",
    body: [
      "In the morning you pick a small number of promises for the day. In the evening you close the day and see what you kept.",
      "Add tasks quickly, sort them into morning, afternoon or evening, and tie one to a goal when it is moving a number.",
      "Worth knowing: a task you carry forward three times gets a gentle nudge. That is not a telling-off — it usually means the task is too big, or it was never really yours.",
    ],
  },
  {
    key: "brain-dump",
    title: "Brain dump",
    group: "Tasks",
    body: [
      "Type everything in your head in one go and the app splits it into separate tasks with sensible slots.",
      "It only ever proposes. Nothing is saved until you look at the list and confirm it.",
    ],
  },

  /* ── Culture ──────────────────────────────────────────── */
  {
    key: "culture",
    title: "Culture — how we treat each other",
    group: "Culture",
    screen: "culture",
    body: [
      "Recognition, the daily rituals, the playbook of how we do things, and a private way to ask for a check-in.",
      "Most people come here to thank somebody properly or to look up how something is done.",
      "Worth knowing: recognition cannot be edited once it is given. Say it as you mean it.",
    ],
  },
  {
    key: "playbook",
    title: "The playbook",
    group: "Culture",
    body: [
      "The agreed way of doing the recurring things, kept by department. If you are unsure how something is done here, look before you ask.",
      "HR keeps it current. If a step is wrong or missing, say so on the Ideas board.",
    ],
  },

  /* ── Your voice ───────────────────────────────────────── */
  {
    key: "ideas",
    title: "Ideas and improvements",
    group: "Your voice",
    screen: "ideas",
    body: [
      "Anything that would make the work better — a fix, an annoyance, a suggestion. Add it, vote on somebody else's, and watch what happens to it.",
      "You can send it anonymously. When you do, nothing stored with it points back at you, including a screenshot.",
      "Worth knowing: a screenshot helps more than a paragraph. If something looks wrong on your screen, attach it.",
    ],
  },
  {
    key: "pulse",
    title: "The pulse",
    group: "Your voice",
    body: [
      "A few short questions now and then, on the dashboard. Your answers are anonymous — they are stored without any link to you, and even HR cannot see who said what.",
      "Results stay hidden until at least four people have answered, so nobody can be worked out from a small group.",
    ],
  },
  {
    key: "whats-new",
    title: "What's new",
    group: "Your voice",
    body: [
      "When something is added to the app, it is written up here in plain language: what it does, how to use it, and why it helps.",
      "A new release also lands in your bell. You can read the whole history any time from the account menu.",
    ],
  },
  {
    key: "profile",
    title: "Your profile and photo",
    group: "Your voice",
    body: [
      "Your photo, a short line about you, your date of birth and phone, your personal details and your emergency contact — all yours to keep current.",
      "Your name, role, department, reporting line and joining date are looked after by HR. If one of those is wrong, ask them.",
    ],
  },

  /* ── For managers ─────────────────────────────────────── */
  {
    key: "team",
    title: "Team — how your people are doing",
    group: "For managers",
    screen: "team",
    body: [
      "Your reports' goals, their progress, and how well the daily promises are being kept over the last fortnight.",
      "Use it before a one-to-one. The numbers are a starting point for a conversation, not a verdict.",
      "Worth knowing: promises kept says more than any single percentage. Somebody who commits to three and finishes three is in better shape than somebody who commits to ten and finishes five.",
    ],
  },
  {
    key: "approvals",
    title: "Approvals",
    group: "For managers",
    screen: "approvals",
    body: [
      "Leave waiting on you, with the person's balance and any conflicts already worked out.",
      "You cannot approve your own leave. Yours goes up the line, and the screen tells you who is holding it.",
      "Worth knowing: before you approve, check the calendar conflicts shown on the request. A session with no host is a harder problem than a rescheduled day off.",
    ],
  },
  {
    key: "warriors",
    title: "Warriors — the team",
    group: "For managers",
    screen: "warriors",
    body: [
      "Everybody, arranged by who reports to whom. Open somebody to see their role, what they own and one human detail.",
      "Goals, attendance and leave are private — visible to the person, their manager, HR and Admin.",
      "HR and Admin can add, edit and exit people, send joining links, and see what details are still missing.",
    ],
  },

  /* ── For HR ───────────────────────────────────────────── */
  {
    key: "reports",
    title: "Reports",
    group: "For HR",
    screen: "reports",
    body: [
      "The company view: the appraisal matrix, punctuality, the leave ledger, revenue and overall team health.",
      "Punctuality is judged against each person's own working pattern, so a flexible schedule is not punished.",
      "This screen is HR and Admin only.",
    ],
  },
  {
    key: "settings",
    title: "Admin settings",
    group: "For HR",
    screen: "settings",
    body: [
      "Cycles, departments, leave quotas, the playbook, the daily priority cap, holidays and the testing notice.",
      "Changes here reach everybody, so make them deliberately.",
      "Worth knowing: opening a new cycle does not close the old one. Close it when people have finished recording where they landed.",
    ],
  },
  {
    key: "tour",
    title: "The walkthrough",
    group: "Your day",
    body: [
      "A short guided tour of the dashboard, shown once when you join. It points at the real buttons and says what each one is for.",
      "You can start it again any time from the top of this page.",
    ],
  },
];

export function helpForScreen(screen: HelpScreen): HelpTopic | undefined {
  return HELP_TOPICS.find((t) => t.screen === screen);
}

export function searchHelp(query: string): HelpTopic[] {
  const q = query.trim().toLowerCase();
  if (!q) return HELP_TOPICS;
  return HELP_TOPICS.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.body.some((line) => line.toLowerCase().includes(q)),
  );
}
