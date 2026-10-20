/**
 * Every explanation in the app lives here, once.
 * The panel on a screen and the Help page read the same words,
 * so nobody is ever told two different things.
 */

export type HelpGroup =
  | "Start here"
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
  "Start here",
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
  /* ── Start here ───────────────────────────────────────── */
  {
    key: "first-goal",
    title: "Set your first goal, step by step",
    group: "Start here",
    body: [
      "1. Open Goals. A goal lives inside a cycle, and HR opens the cycle. If you see no cycle, ask HR to open one first.",
      "2. Press “+ Write a goal”. You will see a few ready-made starting points for your department. Pick one, or write your own from nothing.",
      "3. Name it. Use something you will be able to say “done” about, like “Support tickets resolved” or “GHL modules completed”.",
      "4. Say what you are counting. A number goal follows one figure (tickets, percent, minutes). A funnel goal follows steps in order, like Calls → Connected → Closed, and measures how many make it to the end.",
      "5. Say where you are today. That is your starting number. Use 0 for something you count up from nothing, and today's real figure for a percent or a level you already have.",
      "6. Say where you will be at the end of the cycle. That is your target. A target below your start works too, for things that should come down, like downtime.",
      "7. Save. You can edit the goal later, but changing the start or the target after you have logged numbers changes how far along it looks, so settle them early.",
      "Worth knowing: for a number goal, the figure you log is where you are NOW, as a running total (3, then 5, then 8), not just today's count. Funnel goals are different: each day you enter that day's count at every step.",
    ],
  },
  {
    key: "track-goal",
    title: "Track a goal day by day",
    group: "Start here",
    body: [
      "Log your number once a day, from “Today's numbers” on the dashboard or from the goal itself on the Goals page. You can back-date a day you missed, but never a day that has not happened.",
      "The goal always shows three things: where you started, where you are now (your latest number), and where you are going. Progress is how far you have travelled from the start towards the target, so going from 0 to 7 of 20 is counted as real work.",
      "The status tells you how you are doing against an even pace through the cycle. On track means close to that pace. At risk means you are 20 points or more behind it. Completed means the target is reached. Overdue means the cycle ended and the target was not reached.",
      "“This week” shows how far your number moved in the week (for example +8 tickets), compared with the week before. It is not the sum of the numbers you logged, so a running total of 3, 5, 8 reads as +8, not 16.",
      "Under each goal, “Tasks for this goal” lists the tasks that move it, shows how many are done, and lets you add one on the spot. When you finish one of those tasks, the app reminds you to put in the new number.",
      "Every week, write a line about what you will do to move the numbers, and fill in the weekly review. Add milestones for the big steps and comments when something changes. Your manager is told when you log numbers and when a goal slips.",
      "To see everything you logged for any stretch of days, open My report.",
    ],
  },
  {
    key: "first-task",
    title: "Make a task and finish it",
    group: "Start here",
    body: [
      "1. Open Tasks and type in the “Add a task” line. You can set a date, a part of the day (morning, afternoon, evening), a priority, and tie it to one of your goals.",
      "2. Have a lot to write down? Paste it all into the Brain dump. It proposes separate tasks, and nothing is saved until you confirm.",
      "3. Each morning pick the few things that matter most today and commit to them. In the evening, close the day to see what you kept.",
      "4. A task moves from Assigned to Accepted to In progress, then to Completed. A task you made for yourself you can complete straight away. A task somebody else gave you goes to them for review first, and they approve it or send it back.",
      "5. Managers and HR can hand a task to someone. The person receives a notification and can accept it or start it.",
    ],
  },
  {
    key: "pending-tasks",
    title: "What is still left, and the evening reminder",
    group: "Start here",
    body: [
      "At the top of Tasks, “What is left” lists every task that is not finished and says what is missing for each: how many days late, due today, not started, waiting for review, or waiting on another task. Late work comes first.",
      "At 6 pm every working day you get one reminder if anything is overdue or due today, with the first few titles. It stays quiet on your weekly off, on holidays and when you are on approved leave. A task that is with someone else for review does not count against you.",
      "You also get a note the day a task becomes overdue, and one when it is due today or tomorrow.",
      "Below the list, “Completed” keeps everything you have finished, newest first, with the day you finished it and whether it was on time or late.",
    ],
  },
  {
    key: "my-report",
    title: "My report — your 45 days, to download",
    group: "Start here",
    body: [
      "Open My report from the menu. Choose the days (the last 45 days is the first choice, matching a goal cycle) and press Show report.",
      "You get three tabs: your tasks, your goals as they stand on the last day, and every number you logged, day by day. Each tab downloads as CSV, Excel or PDF.",
      "It only ever shows your own work. Nobody can use it to look at somebody else's.",
      "A report can cover up to a year at a time. The PDF prints names in plain Latin letters; use the CSV or Excel file if a name has other scripts.",
    ],
  },
  {
    key: "birthdays",
    title: "Birthdays",
    group: "Start here",
    body: [
      "On your birthday the app opens on a full-screen Happy Birthday with your name, sparks and fireworks. Press Thank you to carry on.",
      "On other people's birthdays, you see a small popup when you open the app saying whose day it is. From there you can go to the dashboard and send your wishes in one tap.",
      "The greeting shows once each time you open the app, not on every page. If your device is set to reduce motion, the fireworks are left out.",
    ],
  },

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
      "HR opens and closes cycles. When a cycle passes its end date the Goals page says it has ended, and HR and admin are told three days before and again the day after, so the next one is not forgotten. Until HR opens the next cycle, numbers you log still count on the ended one.",
      "When a new cycle opens, the last-cycle card asks where you actually finished so the record is true.",
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
      "Comp-off has not been introduced yet. It is planned for next year.",
      "Until then nothing is being accrued — marking attendance on a holiday or on your weekly off does not create a credit, and you will not see comp-off in the leave types.",
      "When it does arrive, we will explain here exactly how it is earned and how it is taken.",
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
