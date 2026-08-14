import { WarriorAvatar } from "@/components/warriors/Avatar";
import { isNewWarrior, roleLabel, type Profile, type TreeNode } from "@/lib/warriors";

export interface LoginBadge {
  has_login: boolean;
  invited_at: string | null;
  accepted_at: string | null;
}

/** Title and department are often the same word (e.g. "Technology") — show it once. */
function subtitle(p: Profile) {
  const title = p.title?.trim() || null;
  const dept = p.department?.trim() || null;
  if (title && dept && title.toLowerCase() !== dept.toLowerCase()) return `${title} · ${dept}`;
  return title ?? dept ?? "—";
}

function Row({
  node,
  depth,
  onOpen,
  onEdit,
  onExit,
  canManage,
  index,
  logins,
  onInvite,
}: {
  node: TreeNode;
  depth: number;
  index: number;
  onOpen: (p: Profile) => void;
  onEdit: (p: Profile) => void;
  onExit: (p: Profile) => void;
  canManage: boolean;
  logins?: Map<string, LoginBadge> | undefined;
  onInvite?: ((p: Profile) => void) | undefined;
}) {
  const p = node.profile;
  const label = roleLabel(p.role);
  const login = logins?.get(p.id);
  const needsLogin = Boolean(canManage && logins && p.status === "active" && !login?.has_login);

  return (
    <div className={depth > 0 ? "border-l border-line pl-3 sm:pl-5" : ""}>
      <div
        style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
        className="ce-rise ce-card mb-3 flex w-full items-center gap-2 p-3 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:gap-3 sm:p-4"
      >
        <button
          type="button"
          onClick={() => onOpen(p)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
        >
          <WarriorAvatar name={p.full_name} birthday={p.birthday} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
              {needsLogin ? (
                <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-bold tracking-wider text-soft uppercase">
                  No login yet
                </span>
              ) : login?.has_login && !login.accepted_at ? (
                <span className="rounded-full bg-saff/12 px-2 py-0.5 text-[10px] font-bold tracking-wider text-saffBtn uppercase">
                  Invite sent
                </span>
              ) : null}
              {p.status === "exited" ? (
                <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-bold tracking-wider text-soft uppercase">
                  Exited
                </span>
              ) : null}
            </span>
            <span className="mt-1 block truncate text-[13px] text-soft">{subtitle(p)}</span>
          </span>
        </button>

        {canManage ? (
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(p)}
              aria-label={`Edit ${p.full_name}`}
              className="flex h-11 min-w-11 items-center justify-center rounded-lg border border-line px-2 text-[12px] font-bold text-ink transition-colors hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
            >
              Edit
            </button>
            {needsLogin && onInvite ? (
              <button
                type="button"
                onClick={() => onInvite(p)}
                aria-label={`Invite ${p.full_name}`}
                className="flex h-11 min-w-11 items-center justify-center rounded-lg border border-gold px-2 text-[12px] font-bold text-goldD transition-colors hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
              >
                Invite
              </button>
            ) : null}
            {p.status !== "exited" ? (
              <button
                type="button"
                onClick={() => onExit(p)}
                aria-label={`Exit ${p.full_name}`}
                className="flex h-11 min-w-11 items-center justify-center rounded-lg border border-line px-2 text-[12px] font-bold text-red transition-colors hover:bg-red/8 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
              >
                Exit
              </button>
            ) : null}
          </span>
        ) : null}
      </div>

      {node.children.length > 0 ? (
        <div className="ml-3 sm:ml-6">
          {node.children.map((child, i) => (
            <Row
              key={child.profile.id}
              node={child}
              depth={depth + 1}
              index={i}
              onOpen={onOpen}
              onEdit={onEdit}
              onExit={onExit}
              canManage={canManage}
              logins={logins}
              onInvite={onInvite}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OrgTree({
  tree,
  onOpen,
  onEdit,
  onExit,
  canManage,
  logins,
  onInvite,
}: {
  tree: TreeNode[];
  onOpen: (p: Profile) => void;
  onEdit: (p: Profile) => void;
  onExit: (p: Profile) => void;
  canManage: boolean;
  logins?: Map<string, LoginBadge> | undefined;
  onInvite?: ((p: Profile) => void) | undefined;
}) {
  if (tree.length === 0) {
    return <p className="text-sm text-soft">No warriors yet.</p>;
  }
  return (
    <div>
      {tree.map((node, i) => (
        <Row
          key={node.profile.id}
          node={node}
          depth={0}
          index={i}
          onOpen={onOpen}
          onEdit={onEdit}
          onExit={onExit}
          canManage={canManage}
          logins={logins}
          onInvite={onInvite}
        />
      ))}
    </div>
  );
}
