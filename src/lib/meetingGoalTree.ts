/* Main goals and sub-goals in the Strategic Meetings table: the order rows are shown in, their
   numbers (1, 1.1, 1.2, 2 …) and which goals a goal can be put under. One level only. */

export interface TreeGoal {
  id: string;
  title: string;
  position: number;
  created_at: string;
  parent_id?: string | null;
}

export interface TreeRow<G extends TreeGoal> {
  goal: G;
  /** "1", "1.1", … */
  no: string;
  /** true for a sub-goal */
  sub: boolean;
}

const byOrder = (a: TreeGoal, b: TreeGoal) =>
  a.position - b.position || a.created_at.localeCompare(b.created_at);

/**
 * Every goal once, main goals in order with their sub-goals right under them. A sub-goal whose
 * main goal is not in the list (or is itself a sub-goal) is shown as a main goal, so no row is
 * ever hidden.
 */
export function goalTree<G extends TreeGoal>(goals: G[]): TreeRow<G>[] {
  const ids = new Map(goals.map((g) => [g.id, g]));
  const isMain = (g: G) => {
    const p = g.parent_id ? ids.get(g.parent_id) : undefined;
    return !p || p.id === g.id || Boolean(p.parent_id && ids.has(p.parent_id));
  };
  const mains = goals.filter(isMain).sort(byOrder);
  const kids = new Map<string, G[]>();
  for (const g of goals) {
    if (isMain(g)) continue;
    const list = kids.get(g.parent_id!) ?? [];
    list.push(g);
    kids.set(g.parent_id!, list);
  }
  const out: TreeRow<G>[] = [];
  mains.forEach((m, i) => {
    out.push({ goal: m, no: String(i + 1), sub: false });
    (kids.get(m.id) ?? []).sort(byOrder).forEach((c, j) => {
      out.push({ goal: c, no: `${i + 1}.${j + 1}`, sub: true });
    });
  });
  return out;
}

/** The main goals a goal can be put under: every main goal except itself. */
export function parentChoices<G extends TreeGoal>(rows: TreeRow<G>[], goalId: string) {
  return rows.filter((r) => !r.sub && r.goal.id !== goalId);
}
