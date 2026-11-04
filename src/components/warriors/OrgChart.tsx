import { useMemo, useState } from "react";

import { WarriorAvatar } from "@/components/warriors/Avatar";
import type { OpenPosition } from "@/hooks/useOpenPositions";
import {
  compareSiblings,
  isNewWarrior,
  roleLabel,
  buildTree,
  type Profile,
  type TreeNode,
} from "@/lib/warriors";

/** A box on the chart: a person, or an open post nobody holds yet. */
type ChartNode =
  | { kind: "person"; profile: Profile; children: ChartNode[] }
  | { kind: "open"; position: OpenPosition; children: ChartNode[] };

function toChart(tree: TreeNode[]): ChartNode[] {
  return tree.map((n) => ({ kind: "person", profile: n.profile, children: toChart(n.children) }));
}

function nodeKey(n: ChartNode): string {
  return n.kind === "person" ? n.profile.id : `open-${n.position.id}`;
}

function compareNodes(a: ChartNode, b: ChartNode): number {
  const order = (n: ChartNode) => (n.kind === "person" ? (n.profile.sort_order ?? 100) : n.position.sort_order);
  const byOrder = order(a) - order(b);
  if (byOrder !== 0) return byOrder;
  if (a.kind === "person" && b.kind === "person") return compareSiblings(a.profile, b.profile);
  if (a.kind !== b.kind) return a.kind === "person" ? -1 : 1;
  return a.kind === "open" && b.kind === "open" ? a.position.title.localeCompare(b.position.title) : 0;
}

/**
 * Put each open position under the person it reports to, and move the people drawn under it
 * (chart_position_id) from wherever their manager put them to under the open box.
 */
function withOpenPositions(roots: ChartNode[], positions: OpenPosition[]): ChartNode[] {
  if (positions.length === 0) return roots;
  const ids = new Set(positions.map((p) => p.id));
  const held = new Map<string, ChartNode[]>();

  const detach = (nodes: ChartNode[]): ChartNode[] =>
    nodes.flatMap((n) => {
      n.children = detach(n.children);
      const posId = n.kind === "person" ? n.profile.chart_position_id : null;
      if (posId && ids.has(posId)) {
        held.set(posId, [...(held.get(posId) ?? []), n]);
        return [];
      }
      return [n];
    });
  let tree = detach(roots);

  const find = (nodes: ChartNode[], id: string): ChartNode | null => {
    for (const n of nodes) {
      if (n.kind === "person" && n.profile.id === id) return n;
      const hit = find(n.children, id);
      if (hit) return hit;
    }
    return null;
  };

  for (const position of positions) {
    const open: ChartNode = {
      kind: "open",
      position,
      children: (held.get(position.id) ?? []).sort(compareNodes),
    };
    const parent = position.reports_to ? find(tree, position.reports_to) : null;
    if (parent) parent.children = [...parent.children, open].sort(compareNodes);
    else tree = [...tree, open];
  }
  return tree;
}

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
        {p.new_role ? (
          <span className="rounded-full bg-saff px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
            New role
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

/** An open post: the same card, dashed and quiet, with nobody in it yet. */
function OpenCard({ position }: { position: OpenPosition }) {
  return (
    <div
      aria-label={`${position.title}, to be hired`}
      className="ce-card flex w-44 min-h-11 flex-col items-center justify-center gap-1 border-2 border-dashed border-gold/50 bg-transparent! p-3 text-center shadow-none!"
    >
      <span className="w-full text-[14px] font-bold text-soft">{position.title}</span>
      {position.department ? (
        <span className="w-full truncate text-[11px] text-soft">{position.department}</span>
      ) : null}
      <span className="text-[12px] text-soft italic">To be hired</span>
    </div>
  );
}

function Branch({ node, onOpen }: { node: ChartNode; onOpen: (p: Profile) => void }) {
  return (
    <li>
      {node.kind === "person" ? <Card p={node.profile} onOpen={onOpen} /> : <OpenCard position={node.position} />}
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((c) => (
            <Branch key={nodeKey(c)} node={c} onOpen={onOpen} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Chart({ tree, onOpen }: { tree: ChartNode[]; onOpen: (p: Profile) => void }) {
  if (tree.length === 0) return <p className="text-sm text-soft">Nobody to show here yet.</p>;
  return (
    <div className="org-chart">
      <ul>
        {tree.map((n) => (
          <Branch key={nodeKey(n)} node={n} onOpen={onOpen} />
        ))}
      </ul>
    </div>
  );
}

/** First person box in the chart whose profile is `id`, with everything under it. */
function subtree(tree: ChartNode[], id: string): ChartNode | null {
  for (const n of tree) {
    if (n.kind === "person" && n.profile.id === id) return n;
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
  positions = [],
  viewerId,
  onOpen,
}: {
  profiles: Profile[];
  /** Open posts, drawn as "To be hired" boxes in the organization and team views. */
  positions?: OpenPosition[];
  viewerId: string | null;
  onOpen: (p: Profile) => void;
}) {
  const [view, setView] = useState<View>("organization");
  const fullTree = useMemo(
    () => withOpenPositions(toChart(buildTree(profiles)), positions),
    [profiles, positions],
  );

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
  const firstPerson = fullTree.find((n) => n.kind === "person");
  const defaultLeader =
    leaders.find((l) => l.id === viewerId)?.id ??
    (firstPerson?.kind === "person" ? firstPerson.profile.id : "");
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
                    tree={toChart(
                      buildTree(
                        profiles.filter((p) => (p.department?.trim() || "No department") === d),
                      ),
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
