import { useMemo, useState } from "react";

import { WarriorAvatar } from "@/components/warriors/Avatar";
import { isNewWarrior, roleLabel, buildTree, type Profile, type TreeNode } from "@/lib/warriors";

type View = "organization" | "department" | "team";

const VIEWS: { value: View; label: string }[] = [
  { value: "organization", label: "Organization" },
  { value: "department", label: "Department" },
  { value: "team", label: "Team" },
];

function Card({ p, onOpen }: { p: Profile; onOpen: (p: Profile) => void }) {
  const label = roleLabel(p.role);
  return (
    <button
      type="button"
      onClick={() => onOpen(p)}
      aria-label={`Open ${p.full_name}'s profile`}
      className="ce-card flex w-44 min-h-11 flex-col items-center gap-1 p-3 text-center transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
    >
      <WarriorAvatar name={p.full_name} birthday={p.birthday} path={p.avatar_url} />
      <span className="w-full truncate text-[14px] font-bold text-ink">{p.full_name}</span>
      <span className="w-full truncate text-[12px] text-soft">{p.title ?? "—"}</span>
      <span className="w-full truncate text-[11px] text-soft">{p.department ?? "—"}</span>
      <span className="mt-0.5 flex flex-wrap items-center justify-center gap-1">
        {label ? (
          <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-bold tracking-wider text-goldD uppercase">
            {label}
          </span>
        ) : null}
        {isNewWarrior(p) ? (
          <span className="rounded-full bg-saff/12 px-2 py-0.5 text-[10px] font-bold tracking-wider text-saffBtn uppercase">
            New
          </span>
        ) : null}
        {p.status === "exited" ? (
          <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-bold tracking-wider text-soft uppercase">
            Past
          </span>
        ) : null}
      </span>
    </button>
  );
}

function Branch({ node, onOpen }: { node: TreeNode; onOpen: (p: Profile) => void }) {
  return (
    <li>
      <Card p={node.profile} onOpen={onOpen} />
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((c) => (
            <Branch key={c.profile.id} node={c} onOpen={onOpen} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Chart({ tree, onOpen }: { tree: TreeNode[]; onOpen: (p: Profile) => void }) {
  if (tree.length === 0) return <p className="text-sm text-soft">Nobody to show here yet.</p>;
  return (
    <div className="org-chart">
      <ul>
        {tree.map((n) => (
          <Branch key={n.profile.id} node={n} onOpen={onOpen} />
        ))}
      </ul>
    </div>
  );
}

/** First node in the tree whose profile is `id`, with its whole downline. */
function subtree(tree: TreeNode[], id: string): TreeNode | null {
  for (const n of tree) {
    if (n.profile.id === id) return n;
    const hit = subtree(n.children, id);
    if (hit) return hit;
  }
  return null;
}

/**
 * The org chart as a picture. Organization: everyone under the top of the company.
 * Department: one chart per department. Team: one person and everybody under them.
 * Clicking a card opens that person's profile.
 */
export function OrgChart({
  profiles,
  viewerId,
  onOpen,
}: {
  profiles: Profile[];
  viewerId: string | null;
  onOpen: (p: Profile) => void;
}) {
  const [view, setView] = useState<View>("organization");
  const fullTree = useMemo(() => buildTree(profiles), [profiles]);

  const departments = useMemo(() => {
    const names = new Set<string>();
    profiles.forEach((p) => names.add(p.department?.trim() || "No department"));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [profiles]);

  const leaders = useMemo(
    () =>
      profiles
        .filter((p) => profiles.some((c) => c.manager_id === p.id))
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [profiles],
  );
  const defaultLeader = leaders.find((l) => l.id === viewerId)?.id ?? fullTree[0]?.profile.id ?? "";
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const activeLeader = leaderId ?? defaultLeader;

  return (
    <div>
      <div role="tablist" aria-label="Org chart view" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            role="tab"
            aria-selected={view === v.value}
            onClick={() => setView(v.value)}
            className={`min-h-11 rounded-full border px-4 text-[13px] font-bold transition-colors focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none ${
              view === v.value
                ? "border-gold bg-cream text-goldD"
                : "border-line text-ink hover:bg-cream"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto pb-4">
        {view === "organization" ? (
          <div className="mx-auto w-max min-w-full">
            <Chart tree={fullTree} onOpen={onOpen} />
          </div>
        ) : view === "department" ? (
          <div className="space-y-8">
            {departments.map((d) => (
              <section key={d}>
                <h3 className="font-display text-xl text-ink">{d}</h3>
                <div className="mx-auto mt-3 w-max min-w-full">
                  <Chart
                    tree={buildTree(
                      profiles.filter((p) => (p.department?.trim() || "No department") === d),
                    )}
                    onOpen={onOpen}
                  />
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div>
            <label className="block max-w-xs">
              <span className="ce-label">Team of</span>
              <select
                className="ce-input"
                value={activeLeader}
                onChange={(e) => setLeaderId(e.target.value)}
              >
                {leaders.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.full_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mx-auto mt-5 w-max min-w-full">
              <Chart
                tree={(() => {
                  const n = subtree(fullTree, activeLeader);
                  return n ? [n] : [];
                })()}
                onOpen={onOpen}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
