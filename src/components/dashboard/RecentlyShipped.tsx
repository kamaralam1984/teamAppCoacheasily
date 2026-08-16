import { Link } from "@tanstack/react-router";

import type { IdeaRow } from "@/hooks/useIdeas";

/** Hidden entirely when nothing has shipped — an empty box is worse than no box. */
export function RecentlyShipped({
  items,
  style,
}: {
  items: IdeaRow[] | undefined;
  style?: React.CSSProperties;
}) {
  const shipped = (items ?? [])
    .filter((i) => i.status === "shipped")
    .sort((a, b) => (b.decided_at ?? b.created_at).localeCompare(a.decided_at ?? a.created_at))
    .slice(0, 3);

  if (shipped.length === 0) return null;

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <h2 className="font-display text-2xl text-ink">Recently shipped</h2>
      <ul className="mt-4 space-y-2.5">
        {shipped.map((i) => (
          <li key={i.id} className="text-sm text-ink">
            <span className="font-semibold">{i.title}</span>
            <span className="text-soft">
              {" "}
              — {i.is_anonymous ? "Anonymous" : (i.author.split(" ")[0] ?? i.author)} noticed
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        <Link to="/ideas" className="text-[13px] font-bold text-goldD">
          See the whole board →
        </Link>
        <Link to="/whats-new" className="text-[13px] font-bold text-goldD">
          What's new →
        </Link>
      </div>
    </section>
  );
}
