import { WarriorAvatar } from "@/components/warriors/Avatar";
import { isNewWarrior, roleLabel, type Profile, type TreeNode } from "@/lib/warriors";

function Row({
  node,
  depth,
  onOpen,
  index,
}: {
  node: TreeNode;
  depth: number;
  index: number;
  onOpen: (p: Profile) => void;
}) {
  const p = node.profile;
  const label = roleLabel(p.role);

  return (
    <div className={depth > 0 ? "border-l border-line pl-3 sm:pl-5" : ""}>
      <button
        type="button"
        onClick={() => onOpen(p)}
        style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
        className="ce-rise ce-card mb-3 flex w-full items-center gap-3 p-4 text-left transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
      >
        <WarriorAvatar name={p.full_name} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-bold text-ink">{p.full_name}</span>
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
                Exited
              </span>
            ) : null}
          </span>
          <span className="mt-1 block truncate text-[13px] text-soft">
            {p.title ?? "—"}
            {p.department ? ` · ${p.department}` : ""}
          </span>
        </span>
      </button>

      {node.children.length > 0 ? (
        <div className="ml-3 sm:ml-6">
          {node.children.map((child, i) => (
            <Row key={child.profile.id} node={child} depth={depth + 1} index={i} onOpen={onOpen} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OrgTree({
  tree,
  onOpen,
}: {
  tree: TreeNode[];
  onOpen: (p: Profile) => void;
}) {
  if (tree.length === 0) {
    return <p className="text-sm text-soft">No warriors yet.</p>;
  }
  return (
    <div>
      {tree.map((node, i) => (
        <Row key={node.profile.id} node={node} depth={0} index={i} onOpen={onOpen} />
      ))}
    </div>
  );
}
