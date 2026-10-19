// Tables the Developer panel may touch. Shared by client and server.
export const DEV_TABLES = [
  "attendance", "calendar_attendees", "calendar_tokens", "checkin_requests", "comp_off_credits",
  "cycles", "daily_codes", "daily_reflections", "day_plans", "departments", "energy_logs", "events",
  "goal_advice", "goal_entries", "goals", "holidays", "idea_votes", "ideas", "leave_requests",
  "notifications", "organisations", "profile_education", "profile_employment", "profile_milestones",
  "profile_private", "profiles", "programs", "pulse_done", "pulse_responses", "pulse_rounds",
  "recognitions", "release_announced", "release_items", "release_seen", "releases", "ritual_logs",
  "rituals", "sop_items", "sop_logs", "task_days", "tasks", "themes", "tour_seen", "weekly_reviews",
] as const;

export type DevTable = (typeof DEV_TABLES)[number];

const KEYS: Partial<Record<DevTable, string[]>> = {
  calendar_tokens: ["profile_id"],
  idea_votes: ["idea_id", "profile_id"],
  profile_private: ["profile_id"],
  pulse_done: ["round_id", "profile_id"],
  release_announced: ["release_id"],
  release_seen: ["release_id", "profile_id"],
  tour_seen: ["profile_id"],
};

export function keyColumns(table: DevTable): string[] {
  return KEYS[table] ?? ["id"];
}

export function assertDevTable(name: string): DevTable {
  if (!(DEV_TABLES as readonly string[]).includes(name)) throw new Error(`Table not allowed: ${name}`);
  return name as DevTable;
}

export const ORG_SETTING_KEYS = [
  "digests_enabled", "comp_off_enabled", "testing_until", "daily_meeting_time", "daily_meeting_url",
  "casual_quota", "sick_quota", "casual_quarter_cap", "daily_priority_cap", "team_birthdays", "timezone",
];

export function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
