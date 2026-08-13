import type { CSSProperties } from "react";

import type { TeamHealth } from "@/lib/reports";

export function TeamHealthRow({
  health,
  style,
}: {
  health: TeamHealth | null | undefined;
  style?: CSSProperties;
}) {
  const items = [
    { label: "Warriors", value: health ? String(health.warriors) : "—" },
    { label: "Present today", value: health ? String(health.present_today) : "—" },
    { label: "On leave today", value: health ? String(health.on_leave_today) : "—" },
    {
      label: "Goals written",
      value: health ? `${health.goals_written} of ${health.warriors}` : "—",
    },
    { label: "Avg goal progress", value: health ? `${Math.round(health.avg_progress)}%` : "—" },
    { label: "Tasks overdue", value: health ? String(health.tasks_overdue) : "—" },
  ];

  return (
    <section className="ce-rise ce-card p-6" style={style}>
      <p className="ce-label">Right now</p>
      <h2 className="mt-1 font-display text-2xl text-ink">Team health</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((i) => (
          <div key={i.label} className="rounded-[14px] bg-cream px-3 py-3">
            <p className="font-display text-2xl text-ink">{i.value}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-soft">{i.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
