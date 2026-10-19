import type { Profile } from "@/lib/warriors";

/** Lower-case, no accents, so "kirti" finds "Kīrti". */
function plain(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface PersonMatch {
  person: Profile;
  managerName: string | null;
  score: number;
}

/**
 * Search the directory by name, employee id, department, title or manager. Every word typed
 * has to match something; matches on the name come first.
 */
export function searchPeople(people: Profile[], query: string, limit = 12): PersonMatch[] {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const byId = new Map(people.map((p) => [p.id, p]));

  const out: PersonMatch[] = [];
  for (const person of people) {
    const manager = person.manager_id ? (byId.get(person.manager_id) ?? null) : null;
    const name = plain(person.full_name);
    const code = plain(person.employee_code);
    const fields = [
      name,
      code,
      plain(person.department),
      plain(person.title),
      plain(manager?.full_name),
    ];

    let score = 0;
    let all = true;
    for (const w of words) {
      if (name.split(/\s+/).some((n) => n.startsWith(w))) score += 4;
      else if (name.includes(w)) score += 3;
      else if (code.includes(w)) score += 3;
      else if (fields.some((f) => f.includes(w))) score += 1;
      else {
        all = false;
        break;
      }
    }
    if (!all) continue;
    if (person.status === "exited") score -= 1;
    out.push({ person, managerName: manager?.full_name ?? null, score });
  }
  return out
    .sort((a, b) => b.score - a.score || a.person.full_name.localeCompare(b.person.full_name))
    .slice(0, limit);
}
