import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  CreditCard,
  FileSpreadsheet,
  ListChecks,
  Monitor,
  Rocket,
  Settings,
  Target,
  TrendingUp,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Mark } from "@/components/Mark";
import { fmt } from "@/lib/goals";
import type { GoalChartData, WeeklyDonut } from "@/lib/goalCharts";
import { outcomePercent, type MeetingChartData, type WeekProgress } from "@/lib/meetingGoalCharts";
import { shortDate } from "@/lib/warriors";

/* The Strategic Meetings dashboard. It only reads what the table above it already holds. */

const SURFACE = "#fffdf7";
const INK = "#241b33";
const SOFT = "#6e6580";
const GRID = "#efe7d3";
const PURPLE = "#6d28d9";
const QUIET = "#d6cce8";
const AXIS = { fontSize: 12, fill: SOFT };
const DURATION = 1100;

/** Week bars take these in turn, as in the design. */
const WEEK_COLOURS = [
  "linear-gradient(90deg, #d39a12, #f0c75e)",
  "linear-gradient(90deg, #6d28d9, #a855f7)",
  "linear-gradient(90deg, #2563eb, #4f8cff)",
  "linear-gradient(90deg, #0891b2, #22d3ee)",
  "linear-gradient(90deg, #16a34a, #4ade80)",
];

const GOAL_ICONS: [RegExp, LucideIcon][] = [
  [/technical|issue|bug/i, Settings],
  [/credit|payment|finance|revenue/i, CreditCard],
  [/sheet|tracking|report/i, FileSpreadsheet],
  [/chat|bot|\bai\b/i, Bot],
  [/monitor|post/i, Monitor],
  [/team|people|hiring/i, Users],
  [/explore|launch|access/i, Rocket],
];

function iconFor(title: string): LucideIcon {
  return GOAL_ICONS.find(([pattern]) => pattern.test(title))?.[1] ?? Target;
}

function prefersCalm(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Draws its charts when they scroll into view. These sit below a long table, so an animation that
 * ran on page load would be over before anyone reached it.
 */
function Reveal({ height, children }: { height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ minHeight: height }}>
      {seen ? children : null}
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  subtitle,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`ce-card min-w-0 p-4 ${className ?? ""}`}>
      <div className="flex items-start gap-2.5">
        <Icon size={24} className="mt-0.5 shrink-0 text-goldD" aria-hidden />
        <div className="min-w-0">
          <h2 className="font-sans text-[17px] leading-snug font-extrabold text-ink">{title}</h2>
          {subtitle ? <p className="text-[13px] leading-snug text-soft">{subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Tip({
  active,
  payload,
  label,
  describe,
}: {
  active?: boolean;
  payload?: { value?: number | null }[];
  label?: string;
  describe: (label: string, value: number) => { title: string; value: string };
}) {
  const value = payload?.[0]?.value;
  if (!active || value === null || value === undefined) return null;
  const text = describe(label ?? "", value);
  return (
    <div className="max-w-[16rem] rounded-lg border border-line bg-ivory px-2.5 py-1.5 text-[12px] shadow-sm">
      <p className="text-soft">{text.title}</p>
      <p className="font-bold text-ink">{text.value}</p>
    </div>
  );
}

/* ── outcome bars with their trend ─────────────────────────── */

function BarValue(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string | null;
}) {
  if (props.value === null || props.value === undefined) return <g />;
  const x = Number(props.x) + Number(props.width) / 2;
  // a short bar has no room inside, so its number sits above it
  const fits = Number(props.height) >= 30;
  return (
    <text
      x={x}
      y={fits ? Number(props.y) + 22 : Number(props.y) - 8}
      textAnchor="middle"
      fontSize={Number(props.width) < 44 ? 10 : 14}
      fontWeight={800}
      fill={fits ? "#ffffff" : INK}
    >
      {fmt(Number(props.value))}%
    </text>
  );
}

function OutcomeChart({ data, titles }: { data: MeetingChartData; titles: string[] }) {
  const id = useId().replace(/:/g, "");
  const animate = !prefersCalm();
  const ticks = data.barTicks;

  return (
    <div
      role="img"
      aria-label={data.bars.map((b) => `Goal ${b.label}: ${fmt(b.value)}%`).join(", ")}
    >
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart data={data.bars} margin={{ top: 14, right: 12, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a9780a" />
              <stop offset="70%" stopColor="#c9961a" />
              <stop offset="100%" stopColor="#f3c84b" />
            </linearGradient>
            <linearGradient id={`${id}-wash`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PURPLE} stopOpacity={0.22} />
              <stop offset="100%" stopColor={PURPLE} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: SOFT }} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            ticks={ticks}
            domain={[ticks[0]!, ticks[ticks.length - 1]!]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            cursor={{ fill: GRID, fillOpacity: 0.4 }}
            content={
              <Tip
                describe={(label, value) => ({
                  title: `${label}. ${titles[Number(label) - 1] ?? ""}`,
                  value: `${fmt(value)}%`,
                })}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="none"
            fill={`url(#${id}-wash)`}
            isAnimationActive={animate}
            animationDuration={DURATION}
            tooltipType="none"
          />
          <Bar
            dataKey="value"
            fill={`url(#${id}-gold)`}
            maxBarSize={72}
            radius={[12, 12, 0, 0]}
            isAnimationActive={animate}
            animationDuration={DURATION}
            label={BarValue}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={PURPLE}
            strokeWidth={3}
            dot={{ r: 6, fill: SURFACE, stroke: PURPLE, strokeWidth: 2 }}
            activeDot={{ r: 7, fill: SURFACE, stroke: PURPLE, strokeWidth: 2 }}
            isAnimationActive={animate}
            animationDuration={DURATION}
            tooltipType="none"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── goals table ───────────────────────────────────────────── */

export interface DashboardGoal {
  id: string;
  title: string;
  timeline: string | null;
  outcome: string | null;
}

function OutcomePill({ outcome, pct }: { outcome: string | null; pct: number | null }) {
  if (pct === null) {
    return <span className="text-[13px] font-bold text-ink">{outcome?.trim() || "—"}</span>;
  }
  const done = pct >= 100;
  const Icon = done ? CheckCircle2 : CircleDot;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-extrabold ${
        done ? "bg-emer/12 text-emer" : "bg-flexi/12 text-flexi"
      }`}
    >
      <Icon size={15} aria-hidden />
      {fmt(pct)}%
    </span>
  );
}

function GoalsTable({ goals }: { goals: DashboardGoal[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="bg-gold/15 text-[12px] font-bold text-ink">
            <th className="w-10 px-2 py-2 text-center">No.</th>
            <th className="px-2 py-2">Goal / Task</th>
            <th className="w-[125px] px-2 py-2">Due Date</th>
            <th className="w-[120px] px-2 py-2">Outcome</th>
            <th className="w-[180px] px-2 py-2">Progress</th>
          </tr>
        </thead>
        <tbody>
          {goals.map((g, i) => {
            if (!g.title.trim()) return null;
            const Icon = iconFor(g.title);
            const pct = outcomePercent(g.outcome);
            return (
              <tr key={g.id} className="border-b border-line last:border-b-0">
                <td className="px-2 py-2 text-center font-semibold text-ink">{i + 1}</td>
                <td className="px-2 py-2">
                  <span className="flex items-center gap-2 font-semibold text-ink">
                    <Icon size={18} className="shrink-0 text-goldD" aria-hidden />
                    <span className="whitespace-pre-line">{g.title}</span>
                  </span>
                </td>
                <td className="px-2 py-2 text-ink">
                  {g.timeline ? (
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <CalendarDays size={15} className="shrink-0 text-soft" aria-hidden />
                      {shortDate(g.timeline)} {g.timeline.slice(0, 4)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-2">
                  <OutcomePill outcome={g.outcome} pct={pct} />
                </td>
                <td className="px-2 py-2">
                  {pct === null ? (
                    <span className="text-soft">—</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Meter
                        pct={pct}
                        colour={
                          pct >= 100
                            ? "linear-gradient(90deg, #16a34a, #4ade80)"
                            : "linear-gradient(90deg, #2563eb, #4f8cff)"
                        }
                      />
                      <span className="w-10 shrink-0 text-right font-semibold text-ink">
                        {fmt(pct)}%
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Meter({ pct, colour }: { pct: number; colour: string }) {
  return (
    <span className="block h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
      <span
        className="ce-meter block h-full rounded-full"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: colour }}
      />
    </span>
  );
}

/* ── this week ─────────────────────────────────────────────── */

function WeekRound({ donut }: { donut: WeeklyDonut }) {
  const id = useId().replace(/:/g, "");
  const animate = !prefersCalm();
  // a slice of nothing would still draw its border as a notch in the ring
  const drawn = donut.slices.filter((s) => s.value > 0);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
      <div
        className="relative h-[220px] w-[220px] shrink-0"
        role="img"
        aria-label={donut.slices.map((s) => `${s.label}: ${fmt(s.value)}`).join(", ")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f0c75e" />
                <stop offset="55%" stopColor="#c9961a" />
                <stop offset="100%" stopColor="#8f6307" />
              </linearGradient>
            </defs>
            <Pie
              data={drawn}
              dataKey="value"
              nameKey="label"
              innerRadius="72%"
              outerRadius="98%"
              startAngle={90}
              endAngle={-270}
              stroke={SURFACE}
              strokeWidth={2}
              isAnimationActive={animate}
              animationDuration={DURATION}
            >
              {drawn.map((s) => (
                <Cell key={s.label} fill={s.quiet ? QUIET : `url(#${id}-ring)`} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <Trophy size={26} className="text-goldD" aria-hidden />
          <span className="mt-0.5 text-4xl font-extrabold text-ink">{donut.centreValue}</span>
          <span className="max-w-[8rem] text-center text-[13px] leading-tight text-soft">
            {donut.centreLabel}
          </span>
        </div>
      </div>
      <ul className="min-w-[10rem] flex-1 divide-y divide-line text-[14px]">
        {donut.slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 py-2">
            <span
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ background: s.quiet ? QUIET : "#c9961a" }}
            />
            <span className="min-w-0 flex-1 text-ink">{s.label}</span>
            <span className="font-bold text-ink">{fmt(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── the week-by-week line ─────────────────────────────────── */

function LineDot(props: {
  cx: number | undefined;
  cy: number | undefined;
  index: number | undefined;
  last: number;
  value: number | null | undefined;
}) {
  const { cx, cy, index, last, value } = props;
  if (cx === undefined || cy === undefined || value === null || value === undefined) {
    return <g key={index} />;
  }
  const isLast = index === last;
  return (
    <g key={index}>
      {isLast ? (
        <>
          <circle cx={cx} cy={cy} r={8} fill={PURPLE} className="ce-dot-pulse" />
          <rect x={cx - 17} y={cy - 40} width={34} height={25} rx={7} fill={PURPLE} />
          <text
            x={cx}
            y={cy - 22}
            textAnchor="middle"
            fontSize={14}
            fontWeight={800}
            fill="#ffffff"
          >
            {fmt(value)}
          </text>
        </>
      ) : null}
      <circle
        cx={cx}
        cy={cy}
        r={isLast ? 8 : 6}
        fill={SURFACE}
        stroke={PURPLE}
        strokeWidth={isLast ? 3 : 2}
      />
    </g>
  );
}

function WeekLine({ data }: { data: GoalChartData }) {
  const id = useId().replace(/:/g, "");
  const animate = !prefersCalm();
  const ticks = data.lineTicks;
  const last = data.line.length - 1;

  return (
    <div role="img" aria-label={data.line.map((p) => `${p.label}: ${fmt(p.value)}`).join(", ")}>
      <ResponsiveContainer width="100%" height={230}>
        <AreaChart data={data.line} margin={{ top: 44, right: 26, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id={`${id}-wash`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PURPLE} stopOpacity={0.26} />
              <stop offset="100%" stopColor={PURPLE} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="label"
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            padding={{ left: 20, right: 20 }}
          />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            ticks={ticks}
            domain={[ticks[0]!, ticks[ticks.length - 1]!]}
          />
          <Tooltip
            cursor={{ stroke: SOFT, strokeWidth: 1 }}
            content={
              <Tip
                describe={(label, value) => ({ title: `Week of ${label}`, value: fmt(value) })}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={PURPLE}
            strokeWidth={3}
            fill={`url(#${id}-wash)`}
            isAnimationActive={animate}
            animationDuration={DURATION}
            dot={(p: {
              cx?: number;
              cy?: number;
              index?: number;
              payload?: { value?: number | null };
            }) => (
              // an area gives its dot a [from, to] pair as "value", so the point's own row is read
              <LineDot
                key={p.index}
                cx={p.cx}
                cy={p.cy}
                index={p.index}
                value={p.payload?.value}
                last={last}
              />
            )}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── weekly overview ───────────────────────────────────────── */

function Overview({ weeks }: { weeks: WeekProgress[] }) {
  if (weeks.length === 0)
    return <p className="py-8 text-center text-sm text-soft">No weeks yet.</p>;
  return (
    <ul className="space-y-3.5">
      {weeks.map((w, i) => (
        <li key={w.label} className="flex items-center gap-3 text-[14px]">
          <CalendarDays size={18} className="shrink-0 text-night2" aria-hidden />
          <span className="w-[6.5rem] shrink-0 font-medium text-ink">Week of {w.label}</span>
          <Meter pct={w.pct} colour={WEEK_COLOURS[i % WEEK_COLOURS.length]!} />
          <span className="w-11 shrink-0 text-right font-semibold text-ink">{w.pct}%</span>
        </li>
      ))}
    </ul>
  );
}

/* ── the whole dashboard ───────────────────────────────────── */

export function MeetingDashboard({
  data,
  goals,
  weeks,
  overviewNote,
}: {
  data: MeetingChartData;
  goals: DashboardGoal[];
  weeks: WeekProgress[];
  overviewNote: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <section className="ce-card min-w-0 p-4 lg:col-span-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-extrabold tracking-wide text-soft uppercase">
            Week by week
          </p>
          <span className="flex items-center gap-1.5">
            <Mark size={26} color="#8f6307" />
            <span className="font-display text-lg text-goldD">CoachEasily</span>
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h2 className="flex items-center gap-2.5 font-sans text-[17px] font-extrabold text-ink">
            <Target size={24} className="text-goldD" aria-hidden />
            {data.barTitle}
          </h2>
          {data.bars.length > 0 ? (
            <span className="flex items-center gap-4 text-[12px] text-ink">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-3 w-6 rounded-sm"
                  style={{ background: "linear-gradient(180deg, #a9780a, #f3c84b)" }}
                />
                Outcome % (Bar)
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="relative h-0.5 w-6 bg-violet">
                  <span className="absolute top-1/2 left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-violet bg-ivory" />
                </span>
                Trend
              </span>
            </span>
          ) : null}
        </div>

        <div className="mt-2">
          {data.bars.length > 0 ? (
            <Reveal height={250}>
              <OutcomeChart data={data} titles={goals.map((g) => g.title)} />
            </Reveal>
          ) : (
            <p className="py-10 text-center text-[13px] text-soft">{data.barEmpty}</p>
          )}
        </div>
      </section>

      <Panel icon={ListChecks} title="Goals & Tasks (with Due Dates)" className="lg:col-span-3">
        <Reveal height={120}>
          <GoalsTable goals={goals} />
        </Reveal>
      </Panel>

      <Panel
        icon={CalendarDays}
        title={data.roundTitle}
        subtitle={data.donut?.subtitle}
        className="lg:col-span-2"
      >
        {data.donut ? (
          <Reveal height={220}>
            <WeekRound donut={data.donut} />
          </Reveal>
        ) : (
          <p className="py-10 text-center text-[13px] text-soft">{data.roundEmpty}</p>
        )}
      </Panel>

      <Panel icon={TrendingUp} title={data.lineTitle} className="lg:col-span-3">
        {data.line.length > 0 ? (
          <Reveal height={230}>
            <WeekLine data={data} />
          </Reveal>
        ) : (
          <p className="py-10 text-center text-[13px] text-soft">No weeks yet.</p>
        )}
      </Panel>

      <Panel
        icon={CalendarDays}
        title="Weekly Progress Overview"
        subtitle={overviewNote}
        className="lg:col-span-2"
      >
        <Reveal height={120}>
          <Overview weeks={weeks} />
        </Reveal>
      </Panel>
    </div>
  );
}
