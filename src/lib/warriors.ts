import type { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;

export const DEPARTMENTS = [
  "Leadership",
  "People & Culture",
  "Private Coaching",
  "Operations",
  "Coaching",
  "Community",
  "Customer Experience",
  "Sales",
  "Tele-calling",
  "Content",
  "Technology",
  "Finance",
] as const;

export const WEEKLY_OFFS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Based on work",
] as const;

export type Role = "member" | "manager" | "hr" | "admin";

export const ACCESS_LEVELS: { value: Role; label: string; blurb: string }[] = [
  {
    value: "member",
    label: "Warrior",
    blurb:
      "Sees the team directory and their own goals, attendance and leave — nobody else's private details.",
  },
  {
    value: "manager",
    label: "Manager",
    blurb:
      "Everything a Warrior sees, plus the goals, attendance and leave of everyone in their reporting line, and their approvals.",
  },
  {
    value: "hr",
    label: "People & Culture",
    blurb:
      "Sees and edits every warrior's profile, goals, attendance and leave, invites new warriors, runs exits and reports.",
  },
  {
    value: "admin",
    label: "Admin",
    blurb:
      "Full access to everything People & Culture can do, plus access levels, company settings and all reports.",
  },
];

export function roleLabel(role: string | null | undefined): string | null {
  switch (role) {
    case "manager":
      return "Manager";
    case "hr":
      return "People & Culture";
    case "admin":
      return "Admin";
    default:
      return null;
  }
}

export function accessBlurb(role: string): string {
  return ACCESS_LEVELS.find((l) => l.value === role)?.blurb ?? "";
}

export function isPrivileged(role: string | null | undefined) {
  return role === "hr" || role === "admin";
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase();
}

export function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const then = new Date(`${dateStr}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

export function isNewWarrior(p: Profile): boolean {
  if (p.new_badge === "on") return true;
  if (p.new_badge === "off") return false;
  const d = daysSince(p.joined_on);
  return d !== null && d >= 0 && d < 90;
}

export const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "1 Sep" for an ISO date string, in the day-first way India writes dates. */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

export interface Anniversary {
  /** Days from today until the upcoming anniversary. */
  days: number;
  /** Years completed ON that upcoming date — never today's age. */
  years: number;
  /** "1 Sep" */
  label: string;
}

/**
 * The UPCOMING work anniversary. Years are counted from the anniversary date,
 * not from today, so someone at 11 months whose date falls next week correctly
 * reads "1 year" instead of being computed as 0 and filtered away.
 */
export function upcomingAnniversary(joinedOn: string | null): Anniversary | null {
  if (!joinedOn) return null;
  const joined = new Date(`${joinedOn}T00:00:00Z`);
  if (Number.isNaN(joined.getTime())) return null;

  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let year = now.getUTCFullYear();
  let next = Date.UTC(year, joined.getUTCMonth(), joined.getUTCDate());
  if (next < today) {
    year += 1;
    next = Date.UTC(year, joined.getUTCMonth(), joined.getUTCDate());
  }

  const d = new Date(next);
  return {
    days: Math.round((next - today) / 86_400_000),
    years: year - joined.getUTCFullYear(),
    label: `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`,
  };
}

/** Days until the next anniversary of joined_on, or null. */
export function daysToAnniversary(joinedOn: string | null): number | null {
  return upcomingAnniversary(joinedOn)?.days ?? null;
}


const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function todayName() {
  return WEEKDAYS[new Date().getDay()]!;
}

export function isOffToday(p: Profile) {
  return p.weekly_off === todayName();
}

const ROLE_RANK: Record<string, number> = { hr: 0, admin: 0, manager: 1, member: 2 };

function roleRank(role: string | null | undefined) {
  return ROLE_RANK[role ?? "member"] ?? 2;
}

/**
 * Sibling order at every level: the hand-set display order comes first (it is
 * the explicit instruction from a human), then role rank (People & Culture /
 * Admin, then Manager, then Warrior) settles ties when two siblings share the
 * same sort_order, then name A→Z as the final tie-break.
 */
export function compareSiblings(a: Profile, b: Profile): number {
  const byOrder = (a.sort_order ?? 100) - (b.sort_order ?? 100);
  if (byOrder !== 0) return byOrder;
  const byRole = roleRank(a.role) - roleRank(b.role);
  if (byRole !== 0) return byRole;
  return a.full_name.localeCompare(b.full_name);
}

export interface TreeNode {
  profile: Profile;
  children: TreeNode[];
}


/** Cycle-safe tree build: every profile is placed at most once. */
export function buildTree(profiles: Profile[]): TreeNode[] {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const childrenOf = new Map<string, Profile[]>();
  const roots: Profile[] = [];

  for (const p of profiles) {
    const parentId = p.manager_id && p.manager_id !== p.id ? p.manager_id : null;
    if (parentId && byId.has(parentId)) {
      const list = childrenOf.get(parentId) ?? [];
      list.push(p);
      childrenOf.set(parentId, list);
    } else {
      roots.push(p);
    }
  }

  const visited = new Set<string>();
  const build = (p: Profile): TreeNode => {
    visited.add(p.id);
    const kids = (childrenOf.get(p.id) ?? [])
      .filter((c) => !visited.has(c.id))
      .sort(compareSiblings);
    kids.forEach((k) => visited.add(k.id));
    return { profile: p, children: kids.map(build) };
  };

  const tree = roots
    .filter((r) => !visited.has(r.id))
    .sort(compareSiblings)
    .map(build);


  // Orphans stranded by a cycle still get rendered, never dropped.
  for (const p of profiles) {
    if (!visited.has(p.id)) tree.push(build(p));
  }
  return tree;
}

/** Everyone below `rootId`, cycle-safe. Excludes the root itself. */
export function downlineIds(profiles: Profile[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const p of profiles) {
    if (!p.manager_id || p.manager_id === p.id) continue;
    const list = childrenOf.get(p.manager_id) ?? [];
    list.push(p.id);
    childrenOf.set(p.manager_id, list);
  }
  const out = new Set<string>();
  const stack = [...(childrenOf.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return out;
}

/** Is `viewerId` anywhere up the manager chain of `targetId`? Cycle-safe. */
export function isInManagerChain(
  profiles: Profile[],
  targetId: string,
  viewerId: string,
): boolean {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const seen = new Set<string>();
  let current = byId.get(targetId)?.manager_id ?? null;
  while (current && !seen.has(current)) {
    if (current === viewerId) return true;
    seen.add(current);
    current = byId.get(current)?.manager_id ?? null;
  }
  return false;
}
