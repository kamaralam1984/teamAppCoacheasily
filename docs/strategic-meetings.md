# Strategic Meetings — how it works and where to change it

Each strategic meeting ("Strategic Meeting 6.0 – Beyond Boundaries 2027") has a run-up, and
during it every person keeps a *Goals for next 45 days* table with one written update per week.

Live at **https://team.coacheasily.com/strategic-meetings** (left sidebar → *Strategic Meetings*).

---

## 1. The run-up and its weeks

HR / admin / developers add or edit a meeting from the page (the meetings manager). The
optional field **Goals start on** decides the run-up:

| Goals start on | Run-up | Week columns |
|---|---|---|
| **Set** (e.g. 20 Nov, meeting 4 Jan) | From that date up to the meeting day: 20 Nov to 4 Jan (46 days) | Start on that weekday: *20 Nov to 26 Nov*, *27 Nov to 3 Dec*, … the last one is cut at the meeting day: *1 Jan to 4 Jan* |
| **Empty** (default) | Day after the previous meeting (or 45 days before the meeting) up to the meeting day | Monday to Sunday: *16 Nov to 22 Nov*, … |

The heading counts the days ("Goals for next 46 days"). "This week" is the week column today
falls in. The weekly table toggle, the dropdown, the column headings, the dashboard charts and
the CSV / PDF download all use the same week labels.

The start date has to be on or before the meeting date (checked on the form and by a database
constraint).

### How weekly data is stored (important)

Weekly rows (`meeting_goal_updates.week_start`, `meeting_goals.week_start` for weekly tables,
`meeting_goal_notes.period`) are stored by a **Monday**. With a start date, the *n*-th week
column reads and writes the *n*-th Monday counted from the Monday of the start date's week
(`meetingPeriod().shift` = days between that Monday and the start date). So:

- Setting, moving or clearing a start date **never moves, changes or hides saved data** — the
  database is not touched; only the labels and day count change.
- Example: start 20 Nov (a Friday). Column 1 *20 Nov to 26 Nov* = stored week 16 Nov; column 2
  *27 Nov to 3 Dec* = stored week 23 Nov.
- Consequence: data written before a start date was set may show one column later than people
  expect (an update typed on 23 Nov under "Week of 23 Nov" now sits under *27 Nov to 3 Dec*).
  Fix by re-typing it in the right column; do not re-key rows in the database.

## 2. Who sees what

| Who | Reads | Writes |
|---|---|---|
| Member | Own tables | Own tables |
| Manager | Their reports' tables (whole chain below them) | — (read only) |
| HR / admin | Everyone | Everyone; add / edit / delete meetings |
| Developer (email allowlist) | Everyone, via `devMeetingGoals` | Everyone, via audited `devWriteRow` (`dev_audit_log`) |

## 3. Files

| What | File |
|---|---|
| The page | `src/routes/_authenticated/strategic-meetings.tsx` |
| Add / edit meetings (incl. *Goals start on*) | `src/components/meetings/StrategicMeetingsManager.tsx` |
| Meetings data hooks | `src/hooks/useStrategicMeetings.ts` |
| **Run-up and week logic** (`meetingPeriod`, `weekFirstDay`, `weekRangeLabel`, `currentWeek`), goal reads / writes | `src/hooks/useMeetingGoals.ts` |
| Dashboard numbers (week labels via `WeekView`) | `src/lib/meetingGoalCharts.ts` (+ test) |
| Dashboard UI | `src/components/goals/MeetingDashboard.tsx` |
| CSV / PDF download | `src/lib/meetingGoalExport.ts` (+ test) |
| Developer tab for meetings | `src/components/developer/DevStrategicMeetings.tsx` |

## 4. Database

Migrations (in order; never edit an applied one — add a new migration instead):

| Migration | What |
|---|---|
| `20260922090000_strategic_meetings.sql` | `strategic_meetings` table + daily cron `ce-strategic-meetings-tick` |
| `20260923090000_meeting_goals.sql` | `meeting_goals` + `meeting_goal_updates` (one update per goal per week) |
| `20260924090000_meeting_goals_weekly.sql` | `scope` 'run' (45-day table) or 'week' (+ `week_start`) |
| `20260926090000_meeting_goal_notes.sql` | Optional Challenges / Learnings columns |
| `20260927090000_meeting_goal_row_notes.sql` | Those notes per goal row |
| `20261116090000_meeting_goal_remarks.sql` | Optional Remarks column |
| `20261116100000_meeting_goals_private_read.sql` | Read limited to self / manager chain / HR / admin |
| `20261116110000_meeting_goals_manager_read_only.sql` | Managers read but do not write |
| `20261117110000_meeting_goal_type.sql` | Main Goal / Sub Goal label |
| `20261123090000_strategic_meeting_starts_on.sql` | `strategic_meetings.starts_on` (nullable) + check `starts_on <= meeting_date` |

## 5. Deploying a change

Same as every team-app change (see `deploy/SKILL.md`): commit on `weekly-off-shift` → merge
into `coach-warriors-hub` `main` → `ce-deploy.sh team-check` → `team-migrate` (rehearsal on a
copy, then live) → `team-deploy`.

## 6. Known choices (ask before changing)

- The run always ends on the meeting day; the start date only moves its first day (20 Nov → 4 Jan
  for a 4 Jan meeting is 46 days, and the heading says so).
- Weekly data stays keyed by Monday (see §1); the start date only changes how columns are shown.
- Main Goal / Sub Goal is only a label — no parent/child goal tree.
