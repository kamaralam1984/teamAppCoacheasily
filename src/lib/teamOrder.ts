import { DEPARTMENTS, type Profile } from "@/lib/warriors";

/**
 * How the team is listed: the founder first, then People & Culture, then everybody else by post (heads, then
 * managers, then seniors, then the rest), then by access role, then by department, then by name. A place set by
 * hand (team_order) comes before all of that.
 */

const FOUNDER = /\b(founder|co-founder|ceo|chief executive|managing director)\b/i;

export function isFounder(p: Pick<Profile, "title" | "manager_id">): boolean {
  return FOUNDER.test(p.title ?? "") || (!p.manager_id && !p.title);
}

export function isPeopleAndCulture(p: Pick<Profile, "role" | "department">): boolean {
  return p.role === "hr" || p.department === "People & Culture";
}

/** Smaller is more senior. Read from the post, since that is how people think of seniority here. */
export function seniority(title: string | null | undefined): number {
  const t = title ?? "";
  if (FOUNDER.test(t) || /\b(director|president)\b/i.test(t)) return 0;
  if (/\b(head|vp|vice)\b/i.test(t)) return 1;
  if (/\b(manager|lead|principal)\b/i.test(t)) return 2;
  if (/\b(senior|sr)\b/i.test(t)) return 3;
  if (/\b(intern|trainee|apprentice|part-time|assistant)\b/i.test(t)) return 5;
  return 4;
}

const ROLE_ORDER: Record<string, number> = { admin: 0, hr: 0, manager: 1, member: 2 };

/** 0 founder, 1 People & Culture, 2 everybody else. */
export function tier(p: Profile): 0 | 1 | 2 {
  if (isFounder(p)) return 0;
  if (isPeopleAndCulture(p)) return 1;
  return 2;
}

export function compareTeam(a: Profile, b: Profile): number {
  // a place chosen by hand beats the rule; people nobody has placed yet come after those who were placed
  const placeA = a.team_order ?? null;
  const placeB = b.team_order ?? null;
  if (placeA !== null && placeB !== null && placeA !== placeB) return placeA - placeB;
  if (placeA !== null && placeB === null) return -1;
  if (placeA === null && placeB !== null) return 1;
  const byTier = tier(a) - tier(b);
  if (byTier !== 0) return byTier;
  // the post comes first: a Head sits above a Manager, a Manager above a Senior, whatever the access role
  const bySeniority = seniority(a.title) - seniority(b.title);
  if (bySeniority !== 0) return bySeniority;
  if (tier(a) === 2) {
    const byRole = (ROLE_ORDER[a.role] ?? 2) - (ROLE_ORDER[b.role] ?? 2);
    if (byRole !== 0) return byRole;
  }
  const dept = (p: Profile) => {
    const i = DEPARTMENTS.indexOf((p.department ?? "") as (typeof DEPARTMENTS)[number]);
    return i === -1 ? DEPARTMENTS.length : i;
  };
  const byDept = dept(a) - dept(b);
  if (byDept !== 0) return byDept;
  const byOrder = (a.sort_order ?? 100) - (b.sort_order ?? 100);
  if (byOrder !== 0) return byOrder;
  return a.full_name.localeCompare(b.full_name);
}

export function teamOrder(people: Profile[]): Profile[] {
  return [...people].sort(compareTeam);
}

export type TeamOrderInput = { orderedIds: string[] } | { reset: true };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the developer panel may send: a list of people in order, or an instruction to go back to the rule. */
export function validateTeamOrderInput(input: unknown): TeamOrderInput {
  const i = input as { orderedIds?: unknown; reset?: unknown } | null;
  if (i?.reset === true) return { reset: true };
  const ids = i?.orderedIds;
  if (!Array.isArray(ids) || ids.length === 0)
    throw new Error("Send the people in the order you want.");
  if (ids.length > 500) throw new Error("That is too many people.");
  if (!ids.every((x): x is string => typeof x === "string" && UUID.test(x))) {
    throw new Error("Every entry must be a person's id.");
  }
  if (new Set(ids).size !== ids.length) throw new Error("A person is listed twice.");
  return { orderedIds: ids };
}
